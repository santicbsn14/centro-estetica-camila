import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Express } from 'express';
import request from 'supertest';
import { DateTime } from 'luxon';
import { Types } from 'mongoose';
import { createApp } from '../app';
import { Configuracion, Usuario, Servicio, Turno, Notificacion, Cliente } from '../models';
import { hashPassword } from '../services/password';
import { consultarDisponibilidad } from '../services/consultarDisponibilidad';
import { conectarDbTest, desconectarDbTest, limpiarDbTest } from '../test/dbTestSetup';
import { conCsrf } from '../test/httpTestHelpers';

const ZONE = 'America/Argentina/Buenos_Aires';
const PASSWORD = 'Password123!';

let mongoUrl: string;
let app: Express;

beforeAll(async () => {
  mongoUrl = await conectarDbTest();
  app = createApp({ mongoUrl, sessionSecret: 'test-secret', panelOrigin: 'http://localhost:5173' });
}, 300_000);

afterEach(async () => {
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

async function crearServicio() {
  return Servicio.create({
    nombre: 'Manicura',
    duracionMin: 30,
    bufferPostMin: 0,
    precio: 500000,
    mostrarPrecio: true,
    horarios: null,
    orden: 0,
    activo: true,
  });
}

async function crearUsuario(overrides: { email: string; rol: 'admin' | 'profesional'; servicios?: Types.ObjectId[] }) {
  const passwordHash = await hashPassword(PASSWORD);
  return Usuario.create({
    nombre: overrides.email,
    email: overrides.email,
    passwordHash,
    rol: overrides.rol,
    atiende: overrides.rol === 'profesional',
    servicios: overrides.servicios ?? [],
    horarios: horario(),
    activo: true,
  });
}

async function crearTurno(opts: {
  profesionalId: Types.ObjectId;
  servicioId: Types.ObjectId;
  inicio: Date;
  estado?: 'pendiente' | 'confirmado' | 'rechazado' | 'cancelado' | 'completado' | 'ausente';
  email?: string;
  clienteId?: Types.ObjectId;
}) {
  const fin = new Date(opts.inicio.getTime() + 30 * 60_000);
  return Turno.create({
    codigo: `TRN-${Math.floor(1000 + Math.random() * 9000)}`,
    clienteId: opts.clienteId ?? new Types.ObjectId(),
    clienteSnapshot: { nombre: 'Clienta Test', telefonoE164: '+5493364111111', email: opts.email },
    profesionalId: opts.profesionalId,
    profesionalNombre: 'Profesional Test',
    servicio: { servicioId: opts.servicioId, nombre: 'Manicura', duracionMin: 30, bufferPostMin: 0, precio: 500000 },
    inicio: opts.inicio,
    fin,
    finBloqueo: fin,
    estado: opts.estado ?? 'pendiente',
    historial: [],
    origen: 'web',
    fueraDeHorario: false,
  });
}

// `app` compartida (arriba): el default de login en test es alto/casi-
// infinito (§15.5, deuda de test cerrada) — ya no hace falta una app nueva
// por login sólo para no agotar el límite real de producción.
// conCsrf (§16, revisión "Dominios separados"): envuelve el agente para que
// post/patch/delete manden el header CSRF automáticamente — todas las
// transiciones de panel de este archivo son mutantes y autenticadas.
async function loguearAgente(email: string) {
  const agente = conCsrf(request.agent(app));
  const res = await agente.post('/api/auth/login').send({ email, password: PASSWORD });
  expect(res.status).toBe(200);
  return agente;
}

describe('POST /api/turnos/:id/aprobar', () => {
  it('aprueba un pendiente → 200 confirmado + notificación confirmacion encolada', async () => {
    await crearConfig();
    const servicio = await crearServicio();
    const profesional = await crearUsuario({ email: 'prof1@test.com', rol: 'profesional', servicios: [servicio._id] });
    const turno = await crearTurno({
      profesionalId: profesional._id,
      servicioId: servicio._id,
      inicio: new Date(Date.now() + 72 * 3600_000),
    });

    const agente = await loguearAgente('prof1@test.com');
    const res = await agente.post(`/api/turnos/${turno._id}/aprobar`);

    expect(res.status).toBe(200);
    expect(res.body.estado).toBe('confirmado');

    const notifs = await Notificacion.find({ turnoId: turno._id, tipo: 'confirmacion' }).lean();
    expect(notifs).toHaveLength(1);
    expect(notifs[0].canal).toBe('whatsapp');
  });

  it('con inicio a menos de 24hs: confirmado SIN recordatorio_24h', async () => {
    await crearConfig();
    const servicio = await crearServicio();
    const profesional = await crearUsuario({ email: 'prof2@test.com', rol: 'profesional', servicios: [servicio._id] });
    const turno = await crearTurno({
      profesionalId: profesional._id,
      servicioId: servicio._id,
      inicio: new Date(Date.now() + 2 * 3600_000), // en 2hs
    });

    const agente = await loguearAgente('prof2@test.com');
    const res = await agente.post(`/api/turnos/${turno._id}/aprobar`);
    expect(res.status).toBe(200);

    const recordatorios = await Notificacion.find({ turnoId: turno._id, tipo: 'recordatorio_24h' }).lean();
    expect(recordatorios).toHaveLength(0);
  });

  it('con inicio a más de 24hs: CON recordatorio_24h, programadaPara = inicio - 24h', async () => {
    await crearConfig();
    const servicio = await crearServicio();
    const profesional = await crearUsuario({ email: 'prof3@test.com', rol: 'profesional', servicios: [servicio._id] });
    const inicio = new Date(Date.now() + 72 * 3600_000); // en 3 días
    const turno = await crearTurno({ profesionalId: profesional._id, servicioId: servicio._id, inicio });

    const agente = await loguearAgente('prof3@test.com');
    const res = await agente.post(`/api/turnos/${turno._id}/aprobar`);
    expect(res.status).toBe(200);

    const recordatorios = await Notificacion.find({ turnoId: turno._id, tipo: 'recordatorio_24h' }).lean();
    expect(recordatorios).toHaveLength(1);
    expect(recordatorios[0].programadaPara.getTime()).toBe(inicio.getTime() - 24 * 3600_000);
  });

  it('aprobar un turno ya confirmado ⇒ 409 ESTADO_INVALIDO', async () => {
    await crearConfig();
    const servicio = await crearServicio();
    const profesional = await crearUsuario({ email: 'prof4@test.com', rol: 'profesional', servicios: [servicio._id] });
    const turno = await crearTurno({
      profesionalId: profesional._id,
      servicioId: servicio._id,
      inicio: new Date(Date.now() + 72 * 3600_000),
      estado: 'confirmado',
    });

    const agente = await loguearAgente('prof4@test.com');
    const res = await agente.post(`/api/turnos/${turno._id}/aprobar`);

    expect(res.status).toBe(409);
    expect(res.body.codigo).toBe('ESTADO_INVALIDO');
    expect(res.body.detalle.estadoActual).toBe('confirmado');
  });

  it('ownership: una profesional no puede aprobar el turno de otra ⇒ 403; el admin sí puede', async () => {
    await crearConfig();
    const servicio = await crearServicio();
    const profesionalA = await crearUsuario({ email: 'profA@test.com', rol: 'profesional', servicios: [servicio._id] });
    await crearUsuario({ email: 'profB@test.com', rol: 'profesional', servicios: [servicio._id] });
    await crearUsuario({ email: 'admin1@test.com', rol: 'admin' });

    const turnoDeA = await crearTurno({
      profesionalId: profesionalA._id,
      servicioId: servicio._id,
      inicio: new Date(Date.now() + 72 * 3600_000),
    });

    const agenteB = await loguearAgente('profB@test.com');
    const resB = await agenteB.post(`/api/turnos/${turnoDeA._id}/aprobar`);
    expect(resB.status).toBe(403);
    expect(resB.body.codigo).toBe('SIN_PERMISO');

    const agenteAdmin = await loguearAgente('admin1@test.com');
    const resAdmin = await agenteAdmin.post(`/api/turnos/${turnoDeA._id}/aprobar`);
    expect(resAdmin.status).toBe(200);
    expect(resAdmin.body.estado).toBe('confirmado');
  });
});

describe('POST /api/turnos/:id/rechazar', () => {
  it('rechaza un pendiente → 200 rechazado + notificación rechazo con historial porTipo usuario', async () => {
    await crearConfig();
    const servicio = await crearServicio();
    const profesional = await crearUsuario({ email: 'prof5@test.com', rol: 'profesional', servicios: [servicio._id] });
    const turno = await crearTurno({
      profesionalId: profesional._id,
      servicioId: servicio._id,
      inicio: new Date(Date.now() + 72 * 3600_000),
    });

    const agente = await loguearAgente('prof5@test.com');
    const res = await agente.post(`/api/turnos/${turno._id}/rechazar`);

    expect(res.status).toBe(200);
    expect(res.body.estado).toBe('rechazado');
    const entradaHistorial = res.body.historial.find((h: { estado: string }) => h.estado === 'rechazado');
    expect(entradaHistorial.porTipo).toBe('usuario');

    const notifs = await Notificacion.find({ turnoId: turno._id, tipo: 'rechazo' }).lean();
    expect(notifs).toHaveLength(1);
  });

  it('regresión: la notificación de rechazo queda pendiente, no se auto-cancela al crearse (§7)', async () => {
    // Bug real encontrado el 12/08/2026: cancelarNotificacionesPendientes()
    // corría DESPUÉS de crear la notificación 'rechazo', y como ésta nace
    // 'pendiente', la cancelación masiva se la llevaba puesta — el worker
    // nunca la veía. Fix: invertir el orden (cancelar primero, crear
    // después). Este test cubre lo que el de arriba no cubría (sólo
    // chequeaba toHaveLength, no el estado).
    await crearConfig();
    const servicio = await crearServicio();
    const profesional = await crearUsuario({ email: 'prof5b@test.com', rol: 'profesional', servicios: [servicio._id] });
    const turno = await crearTurno({
      profesionalId: profesional._id,
      servicioId: servicio._id,
      inicio: new Date(Date.now() + 72 * 3600_000),
    });

    const agente = await loguearAgente('prof5b@test.com');
    const res = await agente.post(`/api/turnos/${turno._id}/rechazar`);
    expect(res.status).toBe(200);

    const notif = await Notificacion.findOne({ turnoId: turno._id, tipo: 'rechazo' }).lean();
    expect(notif?.estado).toBe('pendiente');
  });

  it('libera el slot: el horario del turno rechazado vuelve a aparecer disponible', async () => {
    await crearConfig();
    const servicio = await crearServicio();
    const profesional = await crearUsuario({ email: 'prof6@test.com', rol: 'profesional', servicios: [servicio._id] });
    await crearUsuario({ email: 'admin2@test.com', rol: 'admin' });

    const diaObjetivo = DateTime.now().setZone(ZONE).startOf('day').plus({ days: 1 });
    const inicioTurno = diaObjetivo.set({ hour: 10, minute: 0 }).toJSDate();
    const desde = diaObjetivo.set({ hour: 9 }).toJSDate();
    const hasta = diaObjetivo.set({ hour: 20 }).toJSDate();

    const turno = await crearTurno({ profesionalId: profesional._id, servicioId: servicio._id, inicio: inicioTurno });

    const antes = await consultarDisponibilidad({
      servicioId: servicio._id.toString(),
      profesionalId: profesional._id.toString(),
      desde,
      hasta,
    });
    expect(antes.slots.map((s) => DateTime.fromISO(s.inicio, { zone: ZONE }).toFormat('HH:mm'))).not.toContain('10:00');

    const agenteAdmin = await loguearAgente('admin2@test.com');
    const resRechazo = await agenteAdmin.post(`/api/turnos/${turno._id}/rechazar`);
    expect(resRechazo.status).toBe(200);

    const despues = await consultarDisponibilidad({
      servicioId: servicio._id.toString(),
      profesionalId: profesional._id.toString(),
      desde,
      hasta,
    });
    expect(despues.slots.map((s) => DateTime.fromISO(s.inicio, { zone: ZONE }).toFormat('HH:mm'))).toContain('10:00');
  });
});

describe('POST /api/turnos/:id/ausente', () => {
  it('marca ausente sobre un confirmado → 200, sin notificación nueva', async () => {
    await crearConfig();
    const servicio = await crearServicio();
    const profesional = await crearUsuario({ email: 'prof7@test.com', rol: 'profesional', servicios: [servicio._id] });
    const turno = await crearTurno({
      profesionalId: profesional._id,
      servicioId: servicio._id,
      inicio: new Date(Date.now() + 72 * 3600_000),
      estado: 'confirmado',
    });

    const agente = await loguearAgente('prof7@test.com');
    const res = await agente.post(`/api/turnos/${turno._id}/ausente`);

    expect(res.status).toBe(200);
    expect(res.body.estado).toBe('ausente');

    const notifs = await Notificacion.find({ turnoId: turno._id }).lean();
    expect(notifs).toHaveLength(0);
  });

  it('marcar ausente sobre un pendiente ⇒ 409 ESTADO_INVALIDO', async () => {
    await crearConfig();
    const servicio = await crearServicio();
    const profesional = await crearUsuario({ email: 'prof8@test.com', rol: 'profesional', servicios: [servicio._id] });
    const turno = await crearTurno({
      profesionalId: profesional._id,
      servicioId: servicio._id,
      inicio: new Date(Date.now() + 72 * 3600_000),
      estado: 'pendiente',
    });

    const agente = await loguearAgente('prof8@test.com');
    const res = await agente.post(`/api/turnos/${turno._id}/ausente`);

    expect(res.status).toBe(409);
    expect(res.body.codigo).toBe('ESTADO_INVALIDO');
  });
});

describe('POST /api/turnos/:id/cancelar', () => {
  it('cancela un pendiente → 200 cancelado + notificación cancelacion encolada', async () => {
    await crearConfig();
    const servicio = await crearServicio();
    const profesional = await crearUsuario({ email: 'prof9@test.com', rol: 'profesional', servicios: [servicio._id] });
    const turno = await crearTurno({
      profesionalId: profesional._id,
      servicioId: servicio._id,
      inicio: new Date(Date.now() + 72 * 3600_000),
      estado: 'pendiente',
    });

    const agente = await loguearAgente('prof9@test.com');
    const res = await agente.post(`/api/turnos/${turno._id}/cancelar`).send({ motivo: 'la clienta avisó por WhatsApp' });

    expect(res.status).toBe(200);
    expect(res.body.estado).toBe('cancelado');
    const entrada = res.body.historial.find((h: { estado: string }) => h.estado === 'cancelado');
    expect(entrada.porTipo).toBe('usuario');
    expect(entrada.motivo).toBe('la clienta avisó por WhatsApp');

    const notifs = await Notificacion.find({ turnoId: turno._id, tipo: 'cancelacion' }).lean();
    expect(notifs).toHaveLength(1);
    expect(notifs[0].canal).toBe('whatsapp');
  });

  it('cancela un confirmado con recordatorio_24h programado → el recordatorio queda cancelada, y la notificación cancelacion queda pendiente (§7)', async () => {
    await crearConfig();
    const servicio = await crearServicio();
    const profesional = await crearUsuario({ email: 'prof10@test.com', rol: 'profesional', servicios: [servicio._id] });
    const turno = await crearTurno({
      profesionalId: profesional._id,
      servicioId: servicio._id,
      inicio: new Date(Date.now() + 72 * 3600_000),
      estado: 'confirmado',
    });
    // Simula el recordatorio que ya se creó al aprobar (§15.4).
    const recordatorio = await Notificacion.create({
      turnoId: turno._id,
      tipo: 'recordatorio_24h',
      canal: 'whatsapp',
      destino: '+5493364111111',
      programadaPara: new Date(turno.inicio.getTime() - 24 * 3600_000),
      estado: 'pendiente',
    });

    const agente = await loguearAgente('prof10@test.com');
    const res = await agente.post(`/api/turnos/${turno._id}/cancelar`).send({});

    expect(res.status).toBe(200);
    expect(res.body.estado).toBe('cancelado');

    // Lo viejo (recordatorio ya encolado antes de esta transición) se
    // cancela — comportamiento correcto, no lo toca el fix.
    const recordatorioActualizado = await Notificacion.findById(recordatorio._id).lean();
    expect(recordatorioActualizado!.estado).toBe('cancelada');

    // Regresión (12/08/2026): lo nuevo (la notificación 'cancelacion' que
    // esta misma transición acaba de crear) NO debe auto-cancelarse —
    // cancelarNotificacionesPendientes() debe correr antes de crearla, no
    // después.
    const notifCancelacion = await Notificacion.findOne({ turnoId: turno._id, tipo: 'cancelacion' }).lean();
    expect(notifCancelacion?.estado).toBe('pendiente');
  });

  it('cancelar un turno ya cancelado o completado ⇒ 409 ESTADO_INVALIDO', async () => {
    await crearConfig();
    const servicio = await crearServicio();
    const profesional = await crearUsuario({ email: 'prof11@test.com', rol: 'profesional', servicios: [servicio._id] });

    const turnoCancelado = await crearTurno({
      profesionalId: profesional._id,
      servicioId: servicio._id,
      inicio: new Date(Date.now() + 72 * 3600_000),
      estado: 'cancelado',
    });
    const turnoCompletado = await crearTurno({
      profesionalId: profesional._id,
      servicioId: servicio._id,
      inicio: new Date(Date.now() + 96 * 3600_000),
      estado: 'completado',
    });

    const agente = await loguearAgente('prof11@test.com');

    const resCancelado = await agente.post(`/api/turnos/${turnoCancelado._id}/cancelar`);
    expect(resCancelado.status).toBe(409);
    expect(resCancelado.body.codigo).toBe('ESTADO_INVALIDO');

    const resCompletado = await agente.post(`/api/turnos/${turnoCompletado._id}/cancelar`);
    expect(resCompletado.status).toBe(409);
    expect(resCompletado.body.codigo).toBe('ESTADO_INVALIDO');
  });

  it('ownership: una profesional no puede cancelar el turno de otra ⇒ 403; el admin sí puede', async () => {
    await crearConfig();
    const servicio = await crearServicio();
    const profesionalA = await crearUsuario({ email: 'profC@test.com', rol: 'profesional', servicios: [servicio._id] });
    await crearUsuario({ email: 'profD@test.com', rol: 'profesional', servicios: [servicio._id] });
    await crearUsuario({ email: 'admin3@test.com', rol: 'admin' });

    const turnoDeC = await crearTurno({
      profesionalId: profesionalA._id,
      servicioId: servicio._id,
      inicio: new Date(Date.now() + 72 * 3600_000),
      estado: 'pendiente',
    });

    const agenteD = await loguearAgente('profD@test.com');
    const resD = await agenteD.post(`/api/turnos/${turnoDeC._id}/cancelar`);
    expect(resD.status).toBe(403);
    expect(resD.body.codigo).toBe('SIN_PERMISO');

    const agenteAdmin = await loguearAgente('admin3@test.com');
    const resAdmin = await agenteAdmin.post(`/api/turnos/${turnoDeC._id}/cancelar`);
    expect(resAdmin.status).toBe(200);
    expect(resAdmin.body.estado).toBe('cancelado');
  });

  it('cliente con optOut:true → la notificación cancelacion se encola igual (transaccional)', async () => {
    await crearConfig();
    const servicio = await crearServicio();
    const profesional = await crearUsuario({ email: 'prof12@test.com', rol: 'profesional', servicios: [servicio._id] });
    const cliente = await Cliente.create({
      telefonoE164: '+5493364222222',
      telefonoCrudo: '3364222222',
      nombre: 'Clienta OptOut',
      optOut: true,
    });
    const turno = await crearTurno({
      profesionalId: profesional._id,
      servicioId: servicio._id,
      inicio: new Date(Date.now() + 72 * 3600_000),
      estado: 'pendiente',
      clienteId: cliente._id,
    });

    const agente = await loguearAgente('prof12@test.com');
    const res = await agente.post(`/api/turnos/${turno._id}/cancelar`);

    expect(res.status).toBe(200);
    const notifs = await Notificacion.find({ turnoId: turno._id, tipo: 'cancelacion' }).lean();
    expect(notifs).toHaveLength(1);
  });

  it('libera el slot: el horario del turno cancelado vuelve a aparecer disponible', async () => {
    await crearConfig();
    const servicio = await crearServicio();
    const profesional = await crearUsuario({ email: 'prof13@test.com', rol: 'profesional', servicios: [servicio._id] });

    const diaObjetivo = DateTime.now().setZone(ZONE).startOf('day').plus({ days: 1 });
    const inicioTurno = diaObjetivo.set({ hour: 14, minute: 0 }).toJSDate();
    const desde = diaObjetivo.set({ hour: 9 }).toJSDate();
    const hasta = diaObjetivo.set({ hour: 20 }).toJSDate();

    const turno = await crearTurno({
      profesionalId: profesional._id,
      servicioId: servicio._id,
      inicio: inicioTurno,
      estado: 'confirmado',
    });

    const antes = await consultarDisponibilidad({
      servicioId: servicio._id.toString(),
      profesionalId: profesional._id.toString(),
      desde,
      hasta,
    });
    expect(antes.slots.map((s) => DateTime.fromISO(s.inicio, { zone: ZONE }).toFormat('HH:mm'))).not.toContain('14:00');

    const agente = await loguearAgente('prof13@test.com');
    const resCancelar = await agente.post(`/api/turnos/${turno._id}/cancelar`);
    expect(resCancelar.status).toBe(200);

    const despues = await consultarDisponibilidad({
      servicioId: servicio._id.toString(),
      profesionalId: profesional._id.toString(),
      desde,
      hasta,
    });
    expect(despues.slots.map((s) => DateTime.fromISO(s.inicio, { zone: ZONE }).toFormat('HH:mm'))).toContain('14:00');
  });
});
