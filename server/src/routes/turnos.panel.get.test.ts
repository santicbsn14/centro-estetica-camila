import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Express } from 'express';
import request from 'supertest';
import { DateTime } from 'luxon';
import { Types } from 'mongoose';
import { createApp } from '../app';
import { Configuracion, Usuario, Servicio, Turno } from '../models';
import { hashPassword } from '../services/password';
import { conectarDbTest, desconectarDbTest, limpiarDbTest } from '../test/dbTestSetup';

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

async function crearConfig(overrides: Partial<{ ventanaMaximaDias: number }> = {}) {
  await Configuracion.create({
    _id: 'centro',
    nombre: 'Centro',
    timezone: ZONE,
    horarios: horario(),
    pasoGrillaMin: 30,
    antelacionMinimaHoras: 0,
    ventanaMaximaDias: overrides.ventanaMaximaDias ?? 30,
    cancelacionMinimaHoras: 24,
    vencimientoPendienteHoras: 12,
    contacto: { telefonoE164: '+5493364000000', email: 'centro@test.com', direccion: 'Calle 1' },
  });
}

async function crearServicio() {
  return Servicio.create({
    nombre: 'Manicura',
    duracionMin: 30,
    bufferPostMin: 15,
    precio: 500000,
    mostrarPrecio: true,
    horarios: null,
    orden: 0,
    activo: true,
  });
}

async function crearUsuario(overrides: { email: string; rol: 'admin' | 'profesional' }) {
  const passwordHash = await hashPassword(PASSWORD);
  return Usuario.create({
    nombre: overrides.email,
    email: overrides.email,
    passwordHash,
    rol: overrides.rol,
    atiende: overrides.rol === 'profesional',
    servicios: [],
    horarios: horario(),
    activo: true,
  });
}

async function crearTurno(opts: {
  profesionalId: Types.ObjectId;
  servicioId: Types.ObjectId;
  inicio: Date;
  estado?: 'pendiente' | 'confirmado' | 'rechazado' | 'cancelado' | 'completado' | 'ausente';
  expiraEn?: Date;
  email?: string;
}) {
  const fin = new Date(opts.inicio.getTime() + 30 * 60_000);
  const finBloqueo = new Date(fin.getTime() + 15 * 60_000);
  return Turno.create({
    codigo: `TRN-${Math.floor(1000 + Math.random() * 9000)}`,
    clienteId: new Types.ObjectId(),
    clienteSnapshot: { nombre: 'Clienta Test', telefonoE164: '+5493364111111', email: opts.email },
    profesionalId: opts.profesionalId,
    profesionalNombre: 'Profesional Test',
    servicio: { servicioId: opts.servicioId, nombre: 'Manicura', duracionMin: 30, bufferPostMin: 15, precio: 500000 },
    inicio: opts.inicio,
    fin,
    finBloqueo,
    estado: opts.estado ?? 'pendiente',
    expiraEn: opts.expiraEn,
    historial: [{ estado: opts.estado ?? 'pendiente', fecha: new Date(), porTipo: 'cliente' }],
    origen: 'web',
    fueraDeHorario: false,
  });
}

// `app` compartida (arriba): el default de login en test es alto/casi-
// infinito (§15.5, deuda de test cerrada) — ya no hace falta una app nueva
// por login sólo para no agotar el límite real de producción.
async function loguearAgente(email: string) {
  const agente = request.agent(app);
  const res = await agente.post('/api/auth/login').send({ email, password: PASSWORD });
  expect(res.status).toBe(200);
  return agente;
}

function mananaA(hora: number, minuto = 0): Date {
  return DateTime.now().setZone(ZONE).startOf('day').plus({ days: 1 }).set({ hour: hora, minute: minuto }).toJSDate();
}

describe('GET /api/turnos — listado', () => {
  it('admin sin filtros ⇒ ventana default, todos los estados, orden inicio asc', async () => {
    await crearConfig();
    const servicio = await crearServicio();
    const profesional = await crearUsuario({ email: 'prof1@test.com', rol: 'profesional' });
    await crearUsuario({ email: 'admin1@test.com', rol: 'admin' });

    const turnoTarde = await crearTurno({
      profesionalId: profesional._id,
      servicioId: servicio._id,
      inicio: mananaA(15),
      estado: 'confirmado',
    });
    const turnoTemprano = await crearTurno({
      profesionalId: profesional._id,
      servicioId: servicio._id,
      inicio: mananaA(9),
      estado: 'pendiente',
    });

    const agente = await loguearAgente('admin1@test.com');
    const res = await agente.get('/api/turnos');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].id).toBe(turnoTemprano._id.toString()); // inicio asc
    expect(res.body[1].id).toBe(turnoTarde._id.toString());
  });

  it("estado=pendiente ⇒ sólo pendientes, con expiraEn poblado", async () => {
    await crearConfig();
    const servicio = await crearServicio();
    const profesional = await crearUsuario({ email: 'prof2@test.com', rol: 'profesional' });
    await crearUsuario({ email: 'admin2@test.com', rol: 'admin' });

    const expiraEn = new Date(Date.now() + 12 * 3600_000);
    await crearTurno({
      profesionalId: profesional._id,
      servicioId: servicio._id,
      inicio: mananaA(9),
      estado: 'pendiente',
      expiraEn,
    });
    await crearTurno({
      profesionalId: profesional._id,
      servicioId: servicio._id,
      inicio: mananaA(11),
      estado: 'confirmado',
    });

    const agente = await loguearAgente('admin2@test.com');
    const res = await agente.get('/api/turnos').query({ estado: 'pendiente' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].estado).toBe('pendiente');
    expect(res.body[0].expiraEn).toBe(expiraEn.toISOString());
  });

  it('profesional ⇒ sólo sus turnos aunque pase profesionalId de otro (filtro forzado)', async () => {
    await crearConfig();
    const servicio = await crearServicio();
    const profesionalA = await crearUsuario({ email: 'profA@test.com', rol: 'profesional' });
    const profesionalB = await crearUsuario({ email: 'profB@test.com', rol: 'profesional' });

    const turnoDeA = await crearTurno({ profesionalId: profesionalA._id, servicioId: servicio._id, inicio: mananaA(9) });
    await crearTurno({ profesionalId: profesionalB._id, servicioId: servicio._id, inicio: mananaA(10) });

    const agenteA = await loguearAgente('profA@test.com');
    const res = await agenteA.get('/api/turnos').query({ profesionalId: profesionalB._id.toString() });

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe(turnoDeA._id.toString());
  });

  it("'desde' explícito en el pasado ⇒ devuelve históricos, sin clamp a ahora", async () => {
    await crearConfig();
    const servicio = await crearServicio();
    const profesional = await crearUsuario({ email: 'prof3@test.com', rol: 'profesional' });
    await crearUsuario({ email: 'admin3@test.com', rol: 'admin' });

    const inicioHistorico = DateTime.now().setZone(ZONE).minus({ days: 10 }).set({ hour: 10, minute: 0 }).toJSDate();
    await crearTurno({
      profesionalId: profesional._id,
      servicioId: servicio._id,
      inicio: inicioHistorico,
      estado: 'completado',
    });

    const agente = await loguearAgente('admin3@test.com');
    const res = await agente.get('/api/turnos').query({
      desde: DateTime.now().setZone(ZONE).minus({ days: 15 }).toUTC().toISO(),
      hasta: DateTime.now().setZone(ZONE).minus({ days: 5 }).toUTC().toISO(),
    });

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].estado).toBe('completado');
  });

  it("'desde' > 'hasta' ⇒ 400", async () => {
    await crearConfig();
    await crearUsuario({ email: 'admin4@test.com', rol: 'admin' });

    const agente = await loguearAgente('admin4@test.com');
    const res = await agente.get('/api/turnos').query({
      desde: DateTime.now().plus({ days: 5 }).toUTC().toISO(),
      hasta: DateTime.now().plus({ days: 1 }).toUTC().toISO(),
    });

    expect(res.status).toBe(400);
    expect(res.body.codigo).toBe('RANGO_INVALIDO');
  });

  it('la fila no filtra email / bufferPostMin / servicioId / tokenHash', async () => {
    await crearConfig();
    const servicio = await crearServicio();
    const profesional = await crearUsuario({ email: 'prof5@test.com', rol: 'profesional' });
    await crearUsuario({ email: 'admin5@test.com', rol: 'admin' });

    await crearTurno({
      profesionalId: profesional._id,
      servicioId: servicio._id,
      inicio: mananaA(9),
      email: 'clienta@test.com',
    });

    const agente = await loguearAgente('admin5@test.com');
    const res = await agente.get('/api/turnos');

    expect(res.status).toBe(200);
    const fila = res.body[0];
    expect(fila).not.toHaveProperty('historial');
    expect(fila).not.toHaveProperty('tokenHash');
    expect(fila.clienteSnapshot).not.toHaveProperty('email');
    expect(fila.servicio).not.toHaveProperty('bufferPostMin');
    expect(fila.servicio).not.toHaveProperty('servicioId');
    expect(fila.clienteSnapshot.telefonoE164).toBe('+5493364111111'); // sí va en la fila
  });
});

describe('GET /api/turnos/:id — detalle', () => {
  it('devuelve TurnoPanel completo con historial, sin tokenHash', async () => {
    await crearConfig();
    const servicio = await crearServicio();
    const profesional = await crearUsuario({ email: 'prof6@test.com', rol: 'profesional' });

    const turno = await crearTurno({
      profesionalId: profesional._id,
      servicioId: servicio._id,
      inicio: mananaA(9),
      email: 'clienta@test.com',
    });

    const agente = await loguearAgente('prof6@test.com');
    const res = await agente.get(`/api/turnos/${turno._id}`);

    expect(res.status).toBe(200);
    expect(res.body).not.toHaveProperty('tokenHash');
    expect(Array.isArray(res.body.historial)).toBe(true);
    expect(res.body.historial.length).toBeGreaterThan(0);
    expect(res.body.clienteSnapshot.email).toBe('clienta@test.com');
    expect(res.body.servicio.servicioId).toBe(servicio._id.toString());
    expect(res.body.profesional).toEqual({ id: profesional._id.toString(), nombre: 'Profesional Test' });
  });

  it('detalle de turno ajeno por profesional ⇒ 403; admin ⇒ ok', async () => {
    await crearConfig();
    const servicio = await crearServicio();
    const profesionalA = await crearUsuario({ email: 'profC@test.com', rol: 'profesional' });
    await crearUsuario({ email: 'profD@test.com', rol: 'profesional' });
    await crearUsuario({ email: 'admin6@test.com', rol: 'admin' });

    const turnoDeA = await crearTurno({ profesionalId: profesionalA._id, servicioId: servicio._id, inicio: mananaA(9) });

    const agenteB = await loguearAgente('profD@test.com');
    const resB = await agenteB.get(`/api/turnos/${turnoDeA._id}`);
    expect(resB.status).toBe(403);
    expect(resB.body.codigo).toBe('SIN_PERMISO');

    const agenteAdmin = await loguearAgente('admin6@test.com');
    const resAdmin = await agenteAdmin.get(`/api/turnos/${turnoDeA._id}`);
    expect(resAdmin.status).toBe(200);
    expect(resAdmin.body.id).toBe(turnoDeA._id.toString());
  });
});
