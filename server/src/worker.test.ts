import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Types } from 'mongoose';
import { Configuracion, Servicio, Usuario, Turno, Notificacion } from './models';
import { crearTurno } from './services/turnos.service';
import { arrancarWorker, detenerWorker, cicloWorker } from './worker';
import { ClienteWhatsApp } from './services/whatsapp';
import { conectarDbTest, desconectarDbTest, limpiarDbTest } from './test/dbTestSetup';

// Ciclo real del worker — modelo-datos-turnos.md §7. Cada test arma su
// propio turno (vía crearTurno, para que la notificación 'solicitud'
// pendiente salga con el shape real) y manipula Notificacion/Turno
// directamente donde hace falta forzar un escenario puntual.

const ZONE = 'America/Argentina/Buenos_Aires';

beforeAll(async () => {
  await conectarDbTest();
}, 300_000);

afterEach(async () => {
  detenerWorker();
  vi.useRealTimers();
  await limpiarDbTest();
});

afterAll(async () => {
  await desconectarDbTest();
});

function horario(desde = '09:00', hasta = '20:00') {
  return Array.from({ length: 7 }, (_, dia) => ({ dia, bloques: [{ desde, hasta }] }));
}

async function crearConfig() {
  await Configuracion.create({
    _id: 'centro',
    nombre: 'Centro',
    timezone: ZONE,
    horarios: horario(),
    pasoGrillaMin: 30,
    antelacionMinimaHoras: 0,
    ventanaMaximaDias: 30,
    cancelacionMinimaHoras: 24,
    vencimientoPendienteHoras: 12,
    contacto: { telefonoE164: '+5493364000000', email: 'centro@test.com', direccion: 'Calle 1' },
  });
}

// Turno real (vía el servicio, origen 'admin' para no depender de la grilla
// de disponibilidad) — deja una notificación 'solicitud'/'whatsapp'
// pendiente con programadaPara=ahora, lista para que el worker la tome.
async function crearTurnoParaTest() {
  const sufijo = new Types.ObjectId().toString();
  const servicio = await Servicio.create({
    nombre: `Manicura-${sufijo}`,
    duracionMin: 30,
    bufferPostMin: 0,
    precio: 500000,
    mostrarPrecio: true,
    horarios: null,
    orden: 0,
    activo: true,
  });
  const profesional = await Usuario.create({
    nombre: 'Profesional Test',
    email: `prof-${sufijo}@test.com`,
    passwordHash: 'x',
    rol: 'profesional',
    atiende: true,
    servicios: [servicio._id],
    horarios: horario(),
    activo: true,
  });

  const resultado = await crearTurno({
    servicioId: servicio._id.toString(),
    profesionalId: profesional._id.toString(),
    inicio: new Date(Date.now() + 72 * 3600_000).toISOString(),
    nombre: 'Clienta Test',
    telefono: '3364123456',
    origen: 'admin',
  });

  const turno = await Turno.findOne({ codigo: resultado.codigo });
  if (!turno) throw new Error('turno de test no se creó');
  return turno;
}

describe('cicloWorker — claim atómico', () => {
  it('toma UNA notificación pendiente por vez: dos ciclos solapados no la envían dos veces', async () => {
    await crearConfig();
    const turno = await crearTurnoParaTest();

    const enviar = vi.fn().mockResolvedValue({ exito: true, proveedorSid: 'sid-1' });
    const cliente: ClienteWhatsApp = { enviar };

    // Dos ciclos "solapados" a propósito (Render despertándose puede
    // disparar esto, §11) sobre la misma notificación pendiente.
    await Promise.all([cicloWorker(cliente), cicloWorker(cliente)]);

    expect(enviar).toHaveBeenCalledTimes(1);
    const notif = await Notificacion.findOne({ turnoId: turno._id, tipo: 'solicitud' }).lean();
    expect(notif?.estado).toBe('enviada');
    expect(notif?.proveedorSid).toBe('sid-1');
  });
});

describe('cicloWorker — recuperación de lo colgado', () => {
  it("vuelve a 'pendiente' y reprocesa lo que quedó en 'enviando' con el lease vencido, sin tocar leases vigentes", async () => {
    await crearConfig();
    const turnoColgado = await crearTurnoParaTest();
    const turnoActivo = await crearTurnoParaTest();

    // Limpia las notificaciones 'solicitud' auto-creadas — este test arma
    // el escenario a mano sobre notificaciones 'confirmacion'.
    await Notificacion.deleteMany({});

    const colgada = await Notificacion.create({
      turnoId: turnoColgado._id,
      tipo: 'confirmacion',
      canal: 'whatsapp',
      destino: '+5493364123456',
      programadaPara: new Date(),
      estado: 'enviando',
      proximoIntento: new Date(Date.now() - 1), // lease vencido: quedó colgada
    });
    const activa = await Notificacion.create({
      turnoId: turnoActivo._id,
      tipo: 'confirmacion',
      canal: 'whatsapp',
      destino: '+5493364123456',
      programadaPara: new Date(),
      estado: 'enviando',
      proximoIntento: new Date(Date.now() + 10 * 60_000), // lease vigente: la está procesando "otro" ciclo
    });

    const enviar = vi.fn().mockResolvedValue({ exito: true, proveedorSid: 'sid-recuperada' });
    await cicloWorker({ enviar });

    const colgadaFinal = await Notificacion.findById(colgada._id).lean();
    expect(colgadaFinal?.estado).toBe('enviada'); // recuperada a 'pendiente' y reprocesada en el mismo tick

    const activaFinal = await Notificacion.findById(activa._id).lean();
    expect(activaFinal?.estado).toBe('enviando'); // intacta
    expect(activaFinal?.proximoIntento?.getTime()).toBe(activa.proximoIntento?.getTime());

    expect(enviar).toHaveBeenCalledTimes(1);
  });
});

describe('cicloWorker — revalidación del turno', () => {
  it('si el turno ya no corresponde (se canceló) entre el encolado y el envío, cancela la notificación sin mandarla', async () => {
    await crearConfig();
    const turno = await crearTurnoParaTest();

    // Se fuerza el estado directo sobre el documento — sin pasar por
    // cancelarTurno(), que ya cancela notificaciones pendientes por su
    // cuenta (primera defensa, en turnos.service.ts). Este test ejercita
    // puntualmente la SEGUNDA defensa: el worker relee el turno antes de
    // enviar (§7).
    await Turno.updateOne({ _id: turno._id }, { $set: { estado: 'cancelado' } });

    const enviar = vi.fn().mockResolvedValue({ exito: true, proveedorSid: 'no-deberia-enviarse' });
    await cicloWorker({ enviar });

    expect(enviar).not.toHaveBeenCalled();
    const notif = await Notificacion.findOne({ turnoId: turno._id, tipo: 'solicitud' }).lean();
    expect(notif?.estado).toBe('cancelada');
  });

  it('una notificación de rechazo SÍ sale aunque el turno esté rechazado — anuncia esa misma transición', async () => {
    await crearConfig();
    const turno = await crearTurnoParaTest();
    await Notificacion.deleteMany({});
    await Turno.updateOne({ _id: turno._id }, { $set: { estado: 'rechazado' } });
    await Notificacion.create({
      turnoId: turno._id,
      tipo: 'rechazo',
      canal: 'whatsapp',
      destino: '+5493364123456',
      programadaPara: new Date(),
    });

    const enviar = vi.fn().mockResolvedValue({ exito: true, proveedorSid: 'sid-rechazo' });
    await cicloWorker({ enviar });

    expect(enviar).toHaveBeenCalledTimes(1);
    const notif = await Notificacion.findOne({ turnoId: turno._id, tipo: 'rechazo' }).lean();
    expect(notif?.estado).toBe('enviada');
  });
});

describe('cicloWorker — reintentos con backoff', () => {
  it('reintenta con backoff (1, 5, 15 min) y marca fallida con el error visible al 4to intento', async () => {
    await crearConfig();
    const turno = await crearTurnoParaTest();

    const enviar = vi.fn().mockResolvedValue({
      exito: false,
      error: { codigo: 'TWILIO_ERROR', mensaje: 'fallo simulado' },
    });
    const cliente: ClienteWhatsApp = { enviar };
    const backoffEsperadoMin = [1, 5, 15];

    // Sólo se fakea Date — el worker usa `new Date()`/`Date.now()` para
    // programadaPara/proximoIntento, y avanzarlo así deja pasar los minutos
    // de backoff sin esperarlos de verdad ni tocar el documento a mano.
    // setInterval/setTimeout quedan reales: cicloWorker() se invoca directo
    // (no vía arrancarWorker), así que no hay timers de por medio que fakear
    // y el driver de Mongo no se entera de este reloj.
    vi.useFakeTimers({ toFake: ['Date'] });

    for (let intento = 1; intento <= 4; intento++) {
      const antes = Date.now();
      await cicloWorker(cliente);

      const notif = await Notificacion.findOne({ turnoId: turno._id, tipo: 'solicitud' }).lean();
      expect(notif?.intentos).toBe(intento);

      if (intento < 4) {
        expect(notif?.estado).toBe('pendiente');
        expect(notif?.error?.codigo).toBe('TWILIO_ERROR');

        const deltaMin = (notif!.proximoIntento!.getTime() - antes) / 60_000;
        expect(deltaMin).toBeCloseTo(backoffEsperadoMin[intento - 1], 5);

        vi.advanceTimersByTime(backoffEsperadoMin[intento - 1] * 60_000 + 1); // pasa el backoff, sin tocar el documento
      } else {
        expect(notif?.estado).toBe('fallida');
        expect(notif?.error?.codigo).toBe('TWILIO_ERROR');
        expect(notif?.proximoIntento).toBeUndefined();
      }
    }

    expect(enviar).toHaveBeenCalledTimes(4);
  });
});

describe('cicloWorker — idempotencia', () => {
  it('el índice único {turnoId, tipo, canal} rechaza una notificación duplicada', async () => {
    await crearConfig();
    const turno = await crearTurnoParaTest(); // ya tiene 'solicitud'/'whatsapp' pendiente

    await expect(
      Notificacion.create({
        turnoId: turno._id,
        tipo: 'solicitud',
        canal: 'whatsapp',
        destino: '+5493364123456',
        programadaPara: new Date(),
      })
    ).rejects.toMatchObject({ code: 11000 });
  });
});

describe('arrancarWorker — programación periódica', () => {
  it('dispara cicloWorker cada WORKER_INTERVAL_MS con el cliente inyectado', async () => {
    await crearConfig();
    const turno = await crearTurnoParaTest();

    const enviar = vi.fn().mockResolvedValue({ exito: true, proveedorSid: 'sid-interval' });

    // Sólo se fakean los timers (no Date): alcanza para disparar el interval
    // sin esperar 60s reales. cicloWorker() queda corriendo en segundo plano
    // (fire-and-forget, igual que en producción) contra la DB real de test,
    // así que se vuelve a reloj real ANTES de esperar el resultado — si
    // Mongo también quedara bajo el reloj falso, su propio manejo interno de
    // timers/sockets se cuelga esperando un avance que nunca llega.
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] });
    arrancarWorker({ clienteWhatsApp: { enviar } });
    vi.advanceTimersByTime(60_000); // WORKER_INTERVAL_MS
    vi.useRealTimers();

    await vi.waitFor(() => expect(enviar).toHaveBeenCalledTimes(1), { timeout: 5000 });

    const notif = await Notificacion.findOne({ turnoId: turno._id, tipo: 'solicitud' }).lean();
    expect(notif?.estado).toBe('enviada');
  });
});
