import crypto from 'node:crypto';
import mongoose, { ClientSession, Types } from 'mongoose';
import { DateTime } from 'luxon';
import { Configuracion, Usuario, Servicio, Excepcion, Turno, Cliente, Notificacion } from '../models';
import {
  OrigenTurno,
  EstadoTurno,
  PorTipoHistorial,
  IClienteSnapshot,
  IServicioSnapshot,
  IHistorialEntry,
} from '../models/turno.model';
import { calcularDisponibilidad, estaEnGrilla, Slot } from './disponibilidad';
import { normalizarTelefonoAR } from './telefono';
import { ApiError } from '../utils/apiError';
import { UsuarioAutenticado } from '../middleware/auth';

// Ownership del panel — deliberadamente acá y no en middleware (§ auth): es
// una regla sobre el RECURSO puntual (de quién es el turno), no sobre la ruta.
// El admin no lleva este filtro; una profesional sólo actúa sobre lo suyo.
export function verificarOwnershipTurno(
  usuario: UsuarioAutenticado,
  turno: { profesionalId: Types.ObjectId }
): void {
  if (usuario.rol === 'profesional' && turno.profesionalId.toString() !== usuario.id) {
    throw new ApiError(403, 'SIN_PERMISO', 'No podés actuar sobre turnos de otra profesional');
  }
}

// Servicio de creación de turno — modelo-datos-turnos.md §15.1.
// origen NO viaja en el body (crearTurnoSchema no lo tiene) ni como parámetro
// de quien llama: se deriva ACÁ, de `usuarioSiHaySesion` (poblado por
// `detectarSesion`, middleware/auth.ts, si POST /api/turnos detectó una
// sesión válida de admin/profesional). Sesión detectada ⇒ 'admin'; si no ⇒
// 'web'. Centralizado en un solo lugar (no en la ruta) para que un futuro
// segundo caller no pueda "olvidarse" de derivarlo bien.

export interface CrearTurnoParams {
  servicioId: string;
  profesionalId: string;
  inicio: string; // ISO UTC, tal como llega en el body
  nombre: string;
  telefono: string; // crudo
  email?: string;
  // Default true cuando se omite (crearTurnoSchema, shared) — sólo importa
  // cuando la sesión detectada deriva origen:'admin'; 'web' siempre valida
  // las cinco capas sin importar este valor (§15.1, "respetarGrilla").
  respetarGrilla?: boolean;
  usuarioSiHaySesion?: UsuarioAutenticado;
}

export interface CrearTurnoResultado {
  codigo: string;
  estado: 'pendiente' | 'confirmado';
  inicio: string;
  fin: string;
  servicio: {
    nombre: string;
    duracionMin: number;
    precio: number;
  };
  fueraDeHorario: boolean;
  // TODO (revisar en la review): ¿el tokenGestion crudo va en esta respuesta para
  // que el front arme el link ya mismo, o queda sólo server-side hasta que el
  // worker arme el mensaje de WhatsApp? Por ahora NO se expone.
}

export async function crearTurno(params: CrearTurnoParams): Promise<CrearTurnoResultado> {
  if (!Types.ObjectId.isValid(params.servicioId) || !Types.ObjectId.isValid(params.profesionalId)) {
    throw new ApiError(400, 'ID_INVALIDO', 'servicioId o profesionalId inválido');
  }

  const inicio = new Date(params.inicio);
  if (Number.isNaN(inicio.getTime())) {
    throw new ApiError(400, 'FECHA_INVALIDA', 'inicio no es una fecha válida');
  }

  // Normalizado ANTES de tocar la DB (§10) — si el teléfono es inválido, no
  // abrimos transacción ni tocamos el índice único de turnos.
  const telefonoE164 = normalizarTelefonoAR(params.telefono);

  const session = await mongoose.startSession();
  try {
    let resultado: CrearTurnoResultado | undefined;

    // Una sola transacción — el código (§4/§13, formato TRN-{año}-####) se
    // genera DENTRO de intentarCrearTurno, vía contador atómico en
    // configuracion. La única colisión posible ahí es una carrera de último
    // recurso sobre el índice único, y esa se reintenta puertas adentro
    // (una vez, ver esColisionDeCodigo más abajo) — no reintentando la
    // transacción completa desde acá.
    await session.withTransaction(async () => {
      resultado = await intentarCrearTurno({ ...params, inicio, telefonoE164 }, session);
    });

    // withTransaction no re-lanza si el callback resuelve sin throw.
    return resultado as CrearTurnoResultado;
  } finally {
    await session.endSession();
  }
}

interface ParamsInternos extends Omit<CrearTurnoParams, 'inicio'> {
  inicio: Date;
  telefonoE164: string;
}

async function intentarCrearTurno(p: ParamsInternos, session: ClientSession): Promise<CrearTurnoResultado> {
  // Determinación de origen — DECISIÓN CERRADA (§15.1): sesión detectada de
  // admin/profesional ⇒ 'admin'; sin sesión ⇒ 'web'. No hay ninguna otra
  // entrada (el body no tiene `origen`, ver crearTurnoSchema).
  const origen: OrigenTurno = p.usuarioSiHaySesion ? 'admin' : 'web';

  // Ownership de profesionalId en sesión de profesional — DECISIÓN CERRADA
  // (§15.1, Web 2026-09-04). Admin: sin restricción, cualquier profesionalId
  // válido. Profesional (no admin): sólo puede cargar turnos para sí misma —
  // reusa el mismo helper y el mismo código (403 SIN_PERMISO) que el
  // ownership de turnos existentes (aprobar/rechazar/cancelar, §15.4), no
  // se inventa uno nuevo. Sin sesión (web): sin restricción, como siempre.
  // Comparación en memoria, antes de tocar la base — profesionalId ya está
  // validado como ObjectId (crearTurno, antes de abrir la transacción).
  if (p.usuarioSiHaySesion) {
    verificarOwnershipTurno(p.usuarioSiHaySesion, { profesionalId: new Types.ObjectId(p.profesionalId) });
  }

  const [config, profesional, servicio] = await Promise.all([
    Configuracion.findById('centro').session(session).lean(),
    Usuario.findById(p.profesionalId).session(session).lean(),
    Servicio.findById(p.servicioId).session(session).lean(),
  ]);

  if (!config) {
    throw new ApiError(500, 'CONFIG_FALTANTE', 'Falta configurar el centro');
  }
  if (!profesional || !profesional.activo || !profesional.atiende) {
    throw new ApiError(404, 'PROFESIONAL_NO_DISPONIBLE', 'La profesional no está disponible');
  }
  if (!servicio || !servicio.activo) {
    throw new ApiError(404, 'SERVICIO_NO_DISPONIBLE', 'El servicio no está disponible');
  }

  // Elegibilidad servicio↔profesional: decidido en la review, se valida en
  // ambos orígenes (ver conversación — no está en las "cinco capas" de disponibilidad,
  // que sólo cubren horario/excepciones/turnos).
  const prestaElServicio = profesional.servicios.some((id) => id.equals(servicio._id));
  if (!prestaElServicio) {
    throw new ApiError(400, 'SERVICIO_NO_PRESTADO', 'Esa profesional no presta ese servicio');
  }

  const fin = new Date(p.inicio.getTime() + servicio.duracionMin * 60_000);
  const finBloqueo = new Date(fin.getTime() + servicio.bufferPostMin * 60_000);

  // TODO: falta el margen hacia atrás en `inicio` que pide disponibilidad.ts
  // (mayor dur+buffer del catálogo) — acá alcanza porque comparamos contra un
  // único candidato, pero conviene revisar cuando este query se comparta con
  // el endpoint de disponibilidad pública.
  const turnosActivos = await Turno.find({
    profesionalId: profesional._id,
    estado: { $in: ['pendiente', 'confirmado'] },
    inicio: { $lt: finBloqueo },
  })
    .session(session)
    .lean();

  const haySolape = turnosActivos.some(
    (t) => p.inicio.getTime() < t.finBloqueo.getTime() && finBloqueo.getTime() > t.inicio.getTime()
  );

  const excepciones = await Excepcion.find({
    profesionalId: { $in: [null, profesional._id] },
    desde: { $lt: finBloqueo },
    hasta: { $gt: p.inicio },
  })
    .session(session)
    .lean();

  if (haySolape) {
    // Reusa la relectura que ya se hizo — no vuelve a la DB (§15.1).
    const slots: Slot[] = calcularDisponibilidad({
      ahora: new Date(),
      config,
      profesional,
      servicio,
      excepciones,
      turnos: turnosActivos,
    }).filter((s) => mismoDiaLocal(s.inicio, p.inicio, config.timezone));

    throw new ApiError(409, 'SLOT_OCUPADO', 'Ese horario ya no está disponible', { slots });
  }

  let fueraDeHorario = false;

  // respetarGrilla — separado de origen (§15.1, DECISIÓN CERRADA): 'web'
  // SIEMPRE las cinco capas (ignora respetarGrilla, la pública nunca lo
  // manda). 'admin' con respetarGrilla true/ausente (el caso común) valida
  // exactamente igual que web — sin agujero. Sólo 'admin' + respetarGrilla
  // false EXPLÍCITO salta a "sólo importa el solape" (ya validado arriba) y
  // marca fueraDeHorario.
  const aplicarGrilla = origen === 'web' || p.respetarGrilla !== false;

  if (aplicarGrilla) {
    if (!estaEnGrilla(p.inicio, config.timezone, config.pasoGrillaMin)) {
      throw new ApiError(400, 'GRILLA_INVALIDA', 'El horario pedido no está anclado a la grilla');
    }

    const disponibles = calcularDisponibilidad({
      ahora: new Date(),
      config,
      profesional,
      servicio,
      excepciones,
      turnos: turnosActivos,
    });
    const ofrecido = disponibles.some((s) => s.inicio === p.inicio.toISOString());
    if (!ofrecido) {
      // Cubre las otras cuatro capas (horario del centro/profesional/servicio,
      // excepciones, antelación mínima, ventana máxima) de una sola vez,
      // reusando el mismo cálculo — sin duplicar la regla en dos lugares.
      throw new ApiError(400, 'FUERA_DE_HORARIO', 'El horario pedido no está disponible');
    }
  } else {
    fueraDeHorario = true;
  }

  const cliente = await Cliente.findOneAndUpdate(
    { telefonoE164: p.telefonoE164 },
    {
      $setOnInsert: {
        telefonoE164: p.telefonoE164,
        telefonoCrudo: p.telefono,
        nombre: p.nombre,
        email: p.email,
      },
    },
    { upsert: true, new: true, session }
  );
  // TODO (abierto): si el cliente ya existía con otro nombre/email, ¿los
  // actualizamos acá o se ignoran? No está en el contrato pedido — hoy sólo
  // setOnInsert, o sea que un cliente recurrente conserva su nombre original.

  const tokenCrudo = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(tokenCrudo).digest('hex');

  // Estado inicial según origen — DECISIÓN CERRADA (§15.1): 'web' nace
  // pendiente (como siempre); 'admin' nace confirmado directamente (Camila ya
  // habló con la clienta al cargar el turno a mano) — nunca pasa por
  // pendiente. `expiraEn` sólo tiene sentido mientras el turno es pendiente
  // (ver comentario en turno.model.ts); un turno que nace confirmado no lo
  // lleva.
  const estadoInicial = origen === 'web' ? ('pendiente' as const) : ('confirmado' as const);

  // Campos fijos del documento — sólo `codigo` cambia entre el intento y el
  // reintento de más abajo.
  const camposTurno = {
    clienteId: cliente._id,
    clienteSnapshot: { nombre: p.nombre, telefonoE164: p.telefonoE164, email: p.email },
    profesionalId: profesional._id,
    profesionalNombre: profesional.nombre,
    servicio: {
      servicioId: servicio._id,
      nombre: servicio.nombre,
      duracionMin: servicio.duracionMin,
      bufferPostMin: servicio.bufferPostMin,
      precio: servicio.precio,
    },
    inicio: p.inicio,
    fin,
    finBloqueo,
    estado: estadoInicial,
    expiraEn:
      estadoInicial === 'pendiente' ? new Date(Date.now() + config.vencimientoPendienteHoras * 3600_000) : undefined,
    historial: [
      {
        estado: estadoInicial,
        fecha: new Date(),
        porTipo: origen === 'admin' ? ('usuario' as const) : ('cliente' as const),
        porId: p.usuarioSiHaySesion ? new Types.ObjectId(p.usuarioSiHaySesion.id) : undefined,
      },
    ],
    origen,
    fueraDeHorario,
    tokenHash,
  };

  // Código de turno (§4/§13, TRN-{año}-####): contador atómico en
  // configuracion. El índice único de `codigo` (§9) es la defensa real
  // contra una carrera; esto sólo puede colisionar si dos transacciones
  // leyeron el mismo `ultimo` antes de que la primera comitee — se
  // regenera el código UNA vez más y se reintenta el insert, sin
  // reintentar la transacción completa (crearTurno ya no tiene ese loop).
  let codigo = await generarCodigoTurno(session, config.timezone);
  let turno;
  try {
    [turno] = await Turno.create([{ ...camposTurno, codigo }], { session });
  } catch (err) {
    if (!esColisionDeCodigo(err)) throw err;
    codigo = await generarCodigoTurno(session, config.timezone);
    [turno] = await Turno.create([{ ...camposTurno, codigo }], { session });
  }

  // Notificación según origen — DECISIÓN CERRADA (§15.1): 'web' encola
  // 'solicitud' (nadie confirmó nada todavía). 'admin' encola confirmacion +
  // recordatorio_24h si corresponde — reusa `encolarConfirmacion`, la MISMA
  // función que usa aprobarTurno (§15.4), no reimplementa el umbral de 24hs.
  // 'admin' NO encola 'solicitud': no aplica, nadie espera confirmación.
  if (origen === 'web') {
    await Notificacion.create(
      [
        {
          turnoId: turno._id,
          tipo: 'solicitud',
          canal: 'whatsapp',
          destino: p.telefonoE164,
          programadaPara: new Date(),
        },
      ],
      { session }
    );
  } else {
    await encolarConfirmacion(turno as unknown as TurnoLean, session);
  }
  // NO se envía nada acá — el worker (§7) toma estas notificaciones
  // 'pendiente' aparte. `tokenCrudo` queda sin uso hasta que el worker arme
  // el link del mensaje; ver TODO de CrearTurnoResultado arriba.
  void tokenCrudo;

  return {
    codigo: turno.codigo,
    estado: turno.estado as 'pendiente' | 'confirmado',
    inicio: turno.inicio.toISOString(),
    fin: turno.fin.toISOString(),
    servicio: { nombre: servicio.nombre, duracionMin: servicio.duracionMin, precio: servicio.precio },
    fueraDeHorario: turno.fueraDeHorario,
  };
}

function mismoDiaLocal(isoUtc: string, referencia: Date, timezone: string): boolean {
  return DateTime.fromISO(isoUtc, { zone: timezone }).hasSame(
    DateTime.fromJSDate(referencia, { zone: timezone }),
    'day'
  );
}

// Código de turno — modelo-datos-turnos.md §4/§13, DECISIÓN CERRADA:
// `TRN-{año}-####`, contador atómico en `configuracion` (no un `Counter`
// aparte, ver §13 del porqué). `año` sale de Luxon en el timezone del
// centro, no `Date.getFullYear()` sobre UTC (§3).
//
// Dos findOneAndUpdate atómicos en secuencia, no leer-y-luego-escribir: el
// primero incrementa `ultimo` SI el año guardado coincide con el actual
// (filtro `contadorTurnosPorAnio.anio: añoActual`); si no matchea —porque
// el año cambió o el contador todavía no existe— el segundo resetea sin
// condición. Mongo no permite expresar "incrementá o reseteá según el valor
// actual" en una única operación con $inc/$set puros (sin pipeline update);
// cada paso individual sí es atómico, y ambos corren dentro de la misma
// transacción/documento — no hay ventana de lectura-cálculo-escritura desde
// la aplicación.
async function generarCodigoTurno(session: ClientSession, timezone: string): Promise<string> {
  const anioActual = DateTime.now().setZone(timezone).year;

  let config = await Configuracion.findOneAndUpdate(
    { _id: 'centro', 'contadorTurnosPorAnio.anio': anioActual },
    { $inc: { 'contadorTurnosPorAnio.ultimo': 1 } },
    { new: true, session }
  ).lean();

  if (!config) {
    config = await Configuracion.findOneAndUpdate(
      { _id: 'centro' },
      { $set: { contadorTurnosPorAnio: { anio: anioActual, ultimo: 1 } } },
      { new: true, session }
    ).lean();
  }

  // No debería pasar: intentarCrearTurno ya validó que el singleton existe
  // antes de llegar acá, y la transacción ve una foto consistente. Guardia
  // defensiva, no un camino esperado.
  if (!config?.contadorTurnosPorAnio) {
    throw new ApiError(500, 'CONFIG_FALTANTE', 'Falta configurar el centro');
  }

  const { ultimo } = config.contadorTurnosPorAnio;
  return `TRN-${anioActual}-${ultimo.toString().padStart(4, '0')}`;
}

function esColisionDeCodigo(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: number }).code === 11000 &&
    'codigo' in ((err as { keyPattern?: Record<string, unknown> }).keyPattern ?? {})
  );
}

// Transiciones de turno del panel (aprobar/rechazar/ausente/cancelar) — cada
// una es un findOneAndUpdate filtrando por el estado de origen esperado
// dentro de una transacción, nunca un update ciego (§3).

export interface TurnoLean {
  _id: Types.ObjectId;
  codigo: string;
  estado: EstadoTurno;
  inicio: Date;
  fin: Date;
  finBloqueo: Date;
  expiraEn?: Date;
  clienteSnapshot: IClienteSnapshot;
  profesionalId: Types.ObjectId;
  profesionalNombre: string;
  servicio: IServicioSnapshot;
  origen: OrigenTurno;
  fueraDeHorario: boolean;
  historial: IHistorialEntry[];
}

// Shape canónico único — lo usan las transiciones (§15.4/15.5) y el GET de
// panel (§15.6, detalle). No redefinir en otro lado.
export interface TurnoPanel {
  id: string;
  codigo: string;
  estado: EstadoTurno;
  inicio: string;
  fin: string;
  finBloqueo: string;
  expiraEn: string | null; // sólo poblado en pendiente
  clienteSnapshot: IClienteSnapshot;
  profesional: { id: string; nombre: string };
  servicio: {
    servicioId: string;
    nombre: string;
    duracionMin: number;
    bufferPostMin: number;
    precio: number;
  };
  origen: OrigenTurno;
  fueraDeHorario: boolean;
  historial: {
    estado: EstadoTurno;
    fecha: string;
    porTipo: PorTipoHistorial;
    porId?: string;
    motivo?: string;
  }[];
}

export function mapTurnoParaPanel(turno: TurnoLean): TurnoPanel {
  return {
    id: turno._id.toString(),
    codigo: turno.codigo,
    estado: turno.estado,
    inicio: turno.inicio.toISOString(),
    fin: turno.fin.toISOString(),
    finBloqueo: turno.finBloqueo.toISOString(),
    expiraEn: turno.expiraEn ? turno.expiraEn.toISOString() : null,
    clienteSnapshot: turno.clienteSnapshot,
    profesional: { id: turno.profesionalId.toString(), nombre: turno.profesionalNombre },
    servicio: {
      servicioId: turno.servicio.servicioId.toString(),
      nombre: turno.servicio.nombre,
      duracionMin: turno.servicio.duracionMin,
      bufferPostMin: turno.servicio.bufferPostMin,
      precio: turno.servicio.precio,
    },
    origen: turno.origen,
    fueraDeHorario: turno.fueraDeHorario,
    historial: turno.historial.map((h) => ({
      estado: h.estado,
      fecha: h.fecha.toISOString(),
      porTipo: h.porTipo,
      porId: h.porId?.toString(),
      motivo: h.motivo,
    })),
  };
}

// Fila de listado (§15.6): mismo shape sin historial y con nested recortado.
// Se arma a partir de mapTurnoParaPanel — no se repite el acceso a los
// campos crudos del turno en una segunda proyección.
export interface TurnoPanelLista {
  id: string;
  codigo: string;
  estado: EstadoTurno;
  inicio: string;
  fin: string;
  finBloqueo: string;
  expiraEn: string | null;
  clienteSnapshot: { nombre: string; telefonoE164: string };
  profesional: { id: string; nombre: string };
  servicio: { nombre: string; duracionMin: number; precio: number };
  origen: OrigenTurno;
  fueraDeHorario: boolean;
}

export function mapTurnoParaPanelLista(turno: TurnoLean): TurnoPanelLista {
  const completo = mapTurnoParaPanel(turno);
  return {
    id: completo.id,
    codigo: completo.codigo,
    estado: completo.estado,
    inicio: completo.inicio,
    fin: completo.fin,
    finBloqueo: completo.finBloqueo,
    expiraEn: completo.expiraEn,
    clienteSnapshot: { nombre: completo.clienteSnapshot.nombre, telefonoE164: completo.clienteSnapshot.telefonoE164 },
    profesional: completo.profesional,
    servicio: {
      nombre: completo.servicio.nombre,
      duracionMin: completo.servicio.duracionMin,
      precio: completo.servicio.precio,
    },
    origen: completo.origen,
    fueraDeHorario: completo.fueraDeHorario,
  };
}

export interface TransicionTurnoParams {
  turnoId: string;
  usuario: UsuarioAutenticado;
  motivo?: string;
}

type EncoladorNotificaciones = (turno: TurnoLean, session: ClientSession) => Promise<void>;

async function ejecutarTransicion(
  p: TransicionTurnoParams,
  estadoOrigen: EstadoTurno | EstadoTurno[],
  estadoDestino: EstadoTurno,
  encolarNotificaciones: EncoladorNotificaciones
): Promise<TurnoPanel> {
  if (!Types.ObjectId.isValid(p.turnoId)) {
    throw new ApiError(400, 'ID_INVALIDO', 'turnoId inválido');
  }

  const session = await mongoose.startSession();
  try {
    let resultado: TurnoPanel | undefined;

    await session.withTransaction(async () => {
      // 1. Ownership — antes de intentar la transición: profesionalId no
      // cambia con el estado, así que este read no compite con el update.
      const turnoExistente = await Turno.findById(p.turnoId).session(session).lean();
      if (!turnoExistente) {
        throw new ApiError(404, 'TURNO_NO_ENCONTRADO', 'El turno no existe');
      }
      verificarOwnershipTurno(p.usuario, turnoExistente);

      // 2. Transición atómica: el filtro por estadoOrigen (uno o varios, ver
      // cancelar) es la garantía de concurrencia (nunca un update ciego).
      const actualizado = await Turno.findOneAndUpdate(
        { _id: p.turnoId, estado: Array.isArray(estadoOrigen) ? { $in: estadoOrigen } : estadoOrigen },
        {
          $set: { estado: estadoDestino },
          $push: {
            historial: {
              estado: estadoDestino,
              fecha: new Date(),
              porTipo: 'usuario',
              porId: new Types.ObjectId(p.usuario.id),
              motivo: p.motivo,
            },
          },
        },
        { new: true, session }
      ).lean();

      if (!actualizado) {
        const actual = await Turno.findById(p.turnoId).session(session).lean();
        const esperados = Array.isArray(estadoOrigen) ? estadoOrigen.join("' o '") : estadoOrigen;
        throw new ApiError(409, 'ESTADO_INVALIDO', `El turno no está en estado '${esperados}'`, {
          estadoActual: actual?.estado,
        });
      }

      // 3. Notificaciones en la MISMA transacción — sólo se encolan, el
      // worker (§7) las envía aparte.
      await encolarNotificaciones(actualizado, session);

      resultado = mapTurnoParaPanel(actualizado);
    });

    return resultado as TurnoPanel;
  } finally {
    await session.endSession();
  }
}

// Umbral y offset son el mismo valor a propósito, pero conceptualmente
// distintos de cancelacionMinimaHoras (política de cancelación de la
// clienta): hoy coinciden en 24h, pero no deben leerse de la misma variable
// para no divergir si mañana cambia una sin la otra.
const RECORDATORIO_LEAD_HORAS = 24;

async function encolarConfirmacion(turno: TurnoLean, session: ClientSession): Promise<void> {
  await Notificacion.create(
    [
      {
        turnoId: turno._id,
        tipo: 'confirmacion',
        canal: 'whatsapp',
        destino: turno.clienteSnapshot.telefonoE164,
        programadaPara: new Date(),
      },
    ],
    { session }
  );
  if (turno.clienteSnapshot.email) {
    await Notificacion.create(
      [
        {
          turnoId: turno._id,
          tipo: 'confirmacion',
          canal: 'email',
          destino: turno.clienteSnapshot.email,
          programadaPara: new Date(),
        },
      ],
      { session }
    );
  }

  // §7: si al confirmar faltan menos de RECORDATORIO_LEAD_HORAS, el
  // recordatorio no se crea — no vencida, no al instante: no existe. Mismo
  // umbralMs para el corte y para el offset: no pueden divergir.
  const antelacionMs = turno.inicio.getTime() - Date.now();
  const umbralMs = RECORDATORIO_LEAD_HORAS * 3600_000;
  if (antelacionMs >= umbralMs) {
    await Notificacion.create(
      [
        {
          turnoId: turno._id,
          tipo: 'recordatorio_24h',
          canal: 'whatsapp',
          destino: turno.clienteSnapshot.telefonoE164,
          programadaPara: new Date(turno.inicio.getTime() - umbralMs),
        },
      ],
      { session }
    );
  }
}

// Una notificación que todavía no salió no debe salir después de que el
// turno cambió de estado — incluye el recordatorio_24h programado al aprobar,
// si el turno estaba confirmado. Compartido por rechazar y cancelar.
async function cancelarNotificacionesPendientes(turnoId: Types.ObjectId, session: ClientSession): Promise<void> {
  await Notificacion.updateMany({ turnoId, estado: 'pendiente' }, { $set: { estado: 'cancelada' } }, { session });
}

async function encolarRechazo(turno: TurnoLean, session: ClientSession): Promise<void> {
  // Orden obligatorio (§7): cancelar lo pendiente viejo ANTES de crear la
  // notificación nueva — al revés, la cancelación masiva alcanza también a
  // la que se acaba de crear (nace 'cancelada' sin que nadie lo note; bug
  // real encontrado el 12/08/2026, ver §17).
  await cancelarNotificacionesPendientes(turno._id, session);

  await Notificacion.create(
    [
      {
        turnoId: turno._id,
        tipo: 'rechazo',
        canal: 'whatsapp',
        destino: turno.clienteSnapshot.telefonoE164,
        programadaPara: new Date(),
      },
    ],
    { session }
  );
}

async function encolarCancelacion(turno: TurnoLean, session: ClientSession): Promise<void> {
  // Orden obligatorio (§7): cancelar lo pendiente viejo ANTES de crear las
  // notificaciones nuevas — mismo motivo que encolarRechazo arriba.
  await cancelarNotificacionesPendientes(turno._id, session);

  // Transaccional a propósito: optOut sólo frena recordatorios (le compete al
  // worker que los envía), no la creación de este aviso.
  await Notificacion.create(
    [
      {
        turnoId: turno._id,
        tipo: 'cancelacion',
        canal: 'whatsapp',
        destino: turno.clienteSnapshot.telefonoE164,
        programadaPara: new Date(),
      },
    ],
    { session }
  );
  if (turno.clienteSnapshot.email) {
    await Notificacion.create(
      [
        {
          turnoId: turno._id,
          tipo: 'cancelacion',
          canal: 'email',
          destino: turno.clienteSnapshot.email,
          programadaPara: new Date(),
        },
      ],
      { session }
    );
  }
}

export function aprobarTurno(p: TransicionTurnoParams): Promise<TurnoPanel> {
  return ejecutarTransicion(p, 'pendiente', 'confirmado', encolarConfirmacion);
}

export function rechazarTurno(p: TransicionTurnoParams): Promise<TurnoPanel> {
  return ejecutarTransicion(p, 'pendiente', 'rechazado', encolarRechazo);
}

export function marcarAusente(p: TransicionTurnoParams): Promise<TurnoPanel> {
  return ejecutarTransicion(p, 'confirmado', 'ausente', async () => {});
}

// Sin ventana de cancelación acá: cancelacionMinimaHoras aplica sólo a la
// clienta desde su link público (todavía no existe). Admin/profesional
// cancelan sin límite horario.
export function cancelarTurno(p: TransicionTurnoParams): Promise<TurnoPanel> {
  return ejecutarTransicion(p, ['pendiente', 'confirmado'], 'cancelado', encolarCancelacion);
}
