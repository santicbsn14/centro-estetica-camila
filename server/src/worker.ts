// Worker de notificaciones — ciclo real (modelo-datos-turnos.md §7).
// Embebido en el mismo proceso Express, mantenido despierto por un ping
// externo contra /healthz (§11, "Infra del worker — DECISIÓN CERRADA").

import { Notificacion, Turno } from './models';
import { INotificacion, TipoNotificacion } from './models/notificacion.model';
import { EstadoTurno } from './models/turno.model';
import { ClienteWhatsApp, clienteWhatsAppMock } from './services/whatsapp';

const WORKER_INTERVAL_MS = 60_000; // 1 minuto (§11)
const UMBRAL_ENVIANDO_MS = 5 * 60_000; // §7: recuperar lo colgado en 'enviando' a los 5 min
const LOTE_MAX = 10; // "lote chico" (§7) — volumen real 25-35 notif/día (§11), sobra margen
const BACKOFF_MIN = [1, 5, 15, 60]; // §7 — backoff[intentos - 1] tras cada fallo
const MAX_INTENTOS = 4; // §7 — al 4to fallo, 'fallida' (backoff[3]=60 no llega a usarse)

let intervalId: NodeJS.Timeout | undefined;

export interface WorkerOpciones {
  clienteWhatsApp?: ClienteWhatsApp;
}

// Expuesto como función, no ejecutado a nivel de módulo: así el interval no
// arranca solo al importar este archivo desde un test — sólo arranca cuando
// el bootstrap del server (index.ts) lo llama explícitamente.
export function arrancarWorker(opciones: WorkerOpciones = {}): void {
  if (intervalId) return; // ya está corriendo — no duplicar el interval
  const cliente = opciones.clienteWhatsApp ?? clienteWhatsAppMock;
  intervalId = setInterval(() => {
    void cicloWorker(cliente);
  }, WORKER_INTERVAL_MS);
}

export function detenerWorker(): void {
  if (!intervalId) return;
  clearInterval(intervalId);
  intervalId = undefined;
}

// Exportado aparte de arrancarWorker para poder invocar un tick puntual
// desde un test sin depender de setInterval — arrancarWorker igual lo
// dispara con el mismo default cuando no se inyecta cliente.
export async function cicloWorker(cliente: ClienteWhatsApp = clienteWhatsAppMock): Promise<void> {
  await recuperarEnviandoColgadas();

  for (let i = 0; i < LOTE_MAX; i++) {
    const notif = await tomarNotificacionPendiente();
    if (!notif) break;
    await procesarNotificacion(notif, cliente);
  }
}

// 1. Recuperar lo colgado (§7). `proximoIntento` se reutiliza como lease del
// claim: tomarNotificacionPendiente() la fija en ahora+5min al pasar a
// 'enviando'; si el proceso muere antes de resolverla (crash entre el claim
// y el envío), ese lease vence y este paso la devuelve a 'pendiente'.
// findOneAndUpdate en loop con el estado esperado en el filtro — mismo
// patrón que las transiciones de turno (turnos.service.ts) — en vez de un
// updateMany ciego sobre todos los colgados a la vez.
async function recuperarEnviandoColgadas(): Promise<void> {
  const ahora = new Date();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const recuperada = await Notificacion.findOneAndUpdate(
      { estado: 'enviando', proximoIntento: { $lte: ahora } },
      { $set: { estado: 'pendiente' }, $unset: { proximoIntento: '' } }
    );
    if (!recuperada) break;
  }
}

// 2. Tomar el trabajo, no leerlo (§7): claim atómico de UNA notificación por
// vez. El filtro exige 'pendiente' + que ya sea su hora (`programadaPara`,
// clave para recordatorio_24h, que se programa 24h antes del turno) + que no
// esté en backoff (`proximoIntento`, gate de reintento cuando el estado es
// 'pendiente' — sentido distinto del lease de arriba, nunca compiten sobre
// el mismo documento porque dependen del estado). Sólo canal 'whatsapp': el
// canal 'email' queda fuera de esta tarea (ver §17).
async function tomarNotificacionPendiente(): Promise<INotificacion | null> {
  const ahora = new Date();
  return Notificacion.findOneAndUpdate(
    {
      estado: 'pendiente',
      canal: 'whatsapp',
      programadaPara: { $lte: ahora },
      $or: [{ proximoIntento: { $exists: false } }, { proximoIntento: { $lte: ahora } }],
    },
    { $set: { estado: 'enviando', proximoIntento: new Date(ahora.getTime() + UMBRAL_ENVIANDO_MS) } },
    { new: true, sort: { programadaPara: 1 } }
  );
}

async function procesarNotificacion(notif: INotificacion, cliente: ClienteWhatsApp): Promise<void> {
  // 3. Revalidar el turno antes de mandar (§7 — segunda defensa; la primera,
  // cancelar notificaciones 'pendiente' al cambiar de estado, ya está en
  // turnos.service.ts y no se toca acá).
  const turno = await Turno.findById(notif.turnoId).lean();
  if (!turno || !turnoJustificaEnvio(notif.tipo, turno.estado)) {
    await Notificacion.findOneAndUpdate(
      { _id: notif._id, estado: 'enviando' },
      { $set: { estado: 'cancelada' }, $unset: { proximoIntento: '' } }
    );
    return;
  }

  // 4. Enviar (mockeado — ver services/whatsapp.ts).
  const resultado = await cliente.enviar({
    turnoId: notif.turnoId.toString(),
    tipo: notif.tipo,
    destino: notif.destino,
  });

  if (resultado.exito) {
    await Notificacion.findOneAndUpdate(
      { _id: notif._id, estado: 'enviando' },
      {
        $set: {
          estado: 'enviada',
          enviadaEn: new Date(),
          proveedorSid: resultado.proveedorSid,
          proveedorEstado: 'queued',
        },
        $unset: { proximoIntento: '', error: '' },
      }
    );
    return;
  }

  // 5. Reintentos con backoff — al 4to fallo, 'fallida' y visible en el
  // panel (error queda en el documento).
  const intentos = notif.intentos + 1;
  if (intentos >= MAX_INTENTOS) {
    await Notificacion.findOneAndUpdate(
      { _id: notif._id, estado: 'enviando' },
      { $set: { estado: 'fallida', intentos, error: resultado.error }, $unset: { proximoIntento: '' } }
    );
    return;
  }

  const esperaMs = BACKOFF_MIN[intentos - 1] * 60_000;
  await Notificacion.findOneAndUpdate(
    { _id: notif._id, estado: 'enviando' },
    {
      $set: {
        estado: 'pendiente',
        intentos,
        proximoIntento: new Date(Date.now() + esperaMs),
        error: resultado.error,
      },
    }
  );
}

// Regla de revalidación (§7: "si el turno cambió (se canceló, etc.)... la
// notificación no debe salir"). Sólo invalida un turno que llegó a un
// estado terminal negativo (cancelado/rechazado) — salvo que la notificación
// exista precisamente para anunciar esa transición, o no dependa del estado
// del turno (autorespuesta: la dispara un mensaje entrante, no una
// transición de turno).
function turnoJustificaEnvio(tipo: TipoNotificacion, estadoTurno: EstadoTurno): boolean {
  if (tipo === 'rechazo' || tipo === 'cancelacion' || tipo === 'autorespuesta') return true;
  return estadoTurno !== 'cancelado' && estadoTurno !== 'rechazado';
}
