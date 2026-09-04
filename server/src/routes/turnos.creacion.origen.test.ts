import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Express } from 'express';
import request from 'supertest';
import { DateTime } from 'luxon';
import { Types } from 'mongoose';
import { createApp } from '../app';
import { Configuracion, Usuario, Servicio, Turno, Notificacion } from '../models';
import { hashPassword } from '../services/password';
import { conectarDbTest, desconectarDbTest, limpiarDbTest } from '../test/dbTestSetup';
import { conCsrf } from '../test/httpTestHelpers';

// Determinación de origen + alta confirmada desde panel — modelo-datos-turnos.md
// §15.1, bloques "Determinación de origen", "respetarGrilla" y "Estado inicial
// y notificación según origen". Archivo dedicado (separado de
// turnos.creacion.test.ts) porque ejercita el recorrido HTTP completo con
// sesión real, no llamadas directas al service.

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

// `login` (rol admin/profesional, con password) — quien hace login y crea el
// turno. Separado de "el target profesional" (a quién se le agenda el
// turno): crearTurno no valida ownership al crear (§15.1 no lo pide), así que
// pueden ser dos usuarios distintos salvo en el test de "profesional que se
// agenda a sí misma" (#5), donde a propósito son el mismo.
async function crearUsuarioLogin(overrides: { email: string; rol: 'admin' | 'profesional' }) {
  const passwordHash = await hashPassword(PASSWORD);
  return Usuario.create({
    nombre: overrides.email,
    email: overrides.email,
    passwordHash,
    rol: overrides.rol,
    atiende: false,
    servicios: [],
    horarios: [],
    activo: true,
  });
}

async function crearProfesionalTarget(overrides: { servicios: Types.ObjectId[] }) {
  return Usuario.create({
    nombre: 'Profesional Target',
    email: `target-${new Types.ObjectId().toString()}@test.com`,
    passwordHash: 'x',
    rol: 'profesional',
    atiende: true,
    servicios: overrides.servicios,
    horarios: horario(),
    activo: true,
  });
}

async function loguearAgente(email: string) {
  const agente = conCsrf(request.agent(app));
  const res = await agente.post('/api/auth/login').send({ email, password: PASSWORD });
  expect(res.status).toBe(200);
  return agente;
}

function enDiasA(dias: number, hora: number, minuto = 0): Date {
  return DateTime.now().setZone(ZONE).startOf('day').plus({ days: dias }).set({ hour: hora, minute: minuto }).toJSDate();
}

const BODY_BASE = {
  nombre: 'Clienta Test',
  telefono: '+54 9 336 4123456',
  email: 'clienta@test.com',
};

describe('POST /api/turnos — determinación de origen (§15.1)', () => {
  it('sin sesión ⇒ origen web, pendiente, notificación solicitud', async () => {
    await crearConfig();
    const servicio = await crearServicio();
    const profesional = await crearProfesionalTarget({ servicios: [servicio._id] });

    const res = await request(app)
      .post('/api/turnos')
      .send({
        ...BODY_BASE,
        servicioId: servicio._id.toString(),
        profesionalId: profesional._id.toString(),
        inicio: enDiasA(3, 10).toISOString(),
      });

    expect(res.status).toBe(201);
    expect(res.body.estado).toBe('pendiente');

    const turno = await Turno.findOne({ codigo: res.body.codigo }).lean();
    expect(turno!.origen).toBe('web');

    const solicitud = await Notificacion.find({ turnoId: turno!._id, tipo: 'solicitud' }).lean();
    expect(solicitud).toHaveLength(1);
    const confirmacion = await Notificacion.find({ turnoId: turno!._id, tipo: 'confirmacion' }).lean();
    expect(confirmacion).toHaveLength(0);
  });

  it('con sesión de admin, sin respetarGrilla en el body ⇒ origen admin, confirmado, confirmacion + recordatorio_24h, sin solicitud', async () => {
    await crearConfig();
    const servicio = await crearServicio();
    const profesional = await crearProfesionalTarget({ servicios: [servicio._id] });
    await crearUsuarioLogin({ email: 'admin@test.com', rol: 'admin' });

    const agente = await loguearAgente('admin@test.com');
    // 3 días adelante: siempre > 24hs de antelación, dispara el recordatorio.
    const res = await agente.post('/api/turnos').send({
      ...BODY_BASE,
      servicioId: servicio._id.toString(),
      profesionalId: profesional._id.toString(),
      inicio: enDiasA(3, 10).toISOString(),
    });

    expect(res.status).toBe(201);
    expect(res.body.estado).toBe('confirmado');

    const turno = await Turno.findOne({ codigo: res.body.codigo }).lean();
    expect(turno!.origen).toBe('admin');
    expect(turno!.fueraDeHorario).toBe(false);
    expect(turno!.expiraEn).toBeUndefined();

    const solicitud = await Notificacion.find({ turnoId: turno!._id, tipo: 'solicitud' }).lean();
    expect(solicitud).toHaveLength(0);

    const confirmacion = await Notificacion.find({ turnoId: turno!._id, tipo: 'confirmacion' }).lean();
    expect(confirmacion).toHaveLength(2); // whatsapp + email (BODY_BASE trae email)

    const recordatorio = await Notificacion.find({ turnoId: turno!._id, tipo: 'recordatorio_24h' }).lean();
    expect(recordatorio).toHaveLength(1);
  });

  it('con sesión de admin, respetarGrilla:false, fuera del horario del centro ⇒ 201, fueraDeHorario:true, sólo valida solape', async () => {
    await crearConfig();
    const servicio = await crearServicio();
    const profesional = await crearProfesionalTarget({ servicios: [servicio._id] });
    await crearUsuarioLogin({ email: 'admin@test.com', rol: 'admin' });

    const agente = await loguearAgente('admin@test.com');
    const res = await agente.post('/api/turnos').send({
      ...BODY_BASE,
      servicioId: servicio._id.toString(),
      profesionalId: profesional._id.toString(),
      inicio: enDiasA(1, 3, 0).toISOString(), // 03:00 — fuera del horario 09-20 y fuera de grilla
      respetarGrilla: false,
    });

    expect(res.status).toBe(201);
    expect(res.body.estado).toBe('confirmado');

    const turno = await Turno.findOne({ codigo: res.body.codigo }).lean();
    expect(turno!.origen).toBe('admin');
    expect(turno!.fueraDeHorario).toBe(true);
  });

  it.each([
    ['respetarGrilla ausente (default true)', undefined],
    ['respetarGrilla:true explícito', true],
  ])(
    'con sesión de admin, %s, fuera de grilla ⇒ 400 (las cinco capas se aplican igual que web)',
    async (_label, respetarGrilla) => {
      await crearConfig();
      const servicio = await crearServicio();
      const profesional = await crearProfesionalTarget({ servicios: [servicio._id] });
      await crearUsuarioLogin({ email: 'admin@test.com', rol: 'admin' });

      const agente = await loguearAgente('admin@test.com');
      const body: Record<string, unknown> = {
        ...BODY_BASE,
        servicioId: servicio._id.toString(),
        profesionalId: profesional._id.toString(),
        inicio: enDiasA(1, 9, 7).toISOString(), // 09:07 — no es múltiplo de 30
      };
      if (respetarGrilla !== undefined) body.respetarGrilla = respetarGrilla;

      const res = await agente.post('/api/turnos').send(body);

      expect(res.status).toBe(400);
      expect(res.body.codigo).toBe('GRILLA_INVALIDA');

      const turnos = await Turno.find({ profesionalId: profesional._id }).lean();
      expect(turnos).toHaveLength(0); // el default no agujerea la grilla
    }
  );

  it('con sesión de profesional (no admin) creando turno ⇒ también origen admin', async () => {
    await crearConfig();
    const servicio = await crearServicio();
    // La misma profesional se agenda a sí misma — tiene password propia para
    // loguear y a la vez es el target del turno.
    const passwordHash = await hashPassword(PASSWORD);
    const profesional = await Usuario.create({
      nombre: 'Profesional Login',
      email: 'profesional@test.com',
      passwordHash,
      rol: 'profesional',
      atiende: true,
      servicios: [servicio._id],
      horarios: horario(),
      activo: true,
    });

    const agente = await loguearAgente('profesional@test.com');
    const res = await agente.post('/api/turnos').send({
      ...BODY_BASE,
      servicioId: servicio._id.toString(),
      profesionalId: profesional._id.toString(),
      inicio: enDiasA(3, 10).toISOString(),
    });

    expect(res.status).toBe(201);
    expect(res.body.estado).toBe('confirmado');

    const turno = await Turno.findOne({ codigo: res.body.codigo }).lean();
    // Documentado a propósito: origen sólo tiene 'web'|'admin' (turno.model.ts)
    // — no distingue admin de profesional. Sesión de profesional también cae
    // en 'admin' a estos efectos.
    expect(turno!.origen).toBe('admin');
  });

  it('con sesión de admin, profesionalId de cualquier profesional válida ⇒ sigue 201 sin restricción (no-regresión)', async () => {
    await crearConfig();
    const servicio = await crearServicio();
    const profesional = await crearProfesionalTarget({ servicios: [servicio._id] });
    await crearUsuarioLogin({ email: 'admin@test.com', rol: 'admin' });

    const agente = await loguearAgente('admin@test.com');
    const res = await agente.post('/api/turnos').send({
      ...BODY_BASE,
      servicioId: servicio._id.toString(),
      profesionalId: profesional._id.toString(), // ninguna relación con quien loguea
      inicio: enDiasA(3, 10).toISOString(),
    });

    expect(res.status).toBe(201);
    expect(res.body.estado).toBe('confirmado');
  });

  describe('ownership de profesionalId en sesión de profesional (§15.1, "Ownership de profesionalId" — DECISIÓN CERRADA)', () => {
    it('profesionalId del body === su propio _id ⇒ 201, se crea normal', async () => {
      await crearConfig();
      const servicio = await crearServicio();
      const passwordHash = await hashPassword(PASSWORD);
      const profesional = await Usuario.create({
        nombre: 'Profesional Login',
        email: 'propia@test.com',
        passwordHash,
        rol: 'profesional',
        atiende: true,
        servicios: [servicio._id],
        horarios: horario(),
        activo: true,
      });

      const agente = await loguearAgente('propia@test.com');
      const res = await agente.post('/api/turnos').send({
        ...BODY_BASE,
        servicioId: servicio._id.toString(),
        profesionalId: profesional._id.toString(),
        inicio: enDiasA(3, 10).toISOString(),
      });

      expect(res.status).toBe(201);
      expect(res.body.estado).toBe('confirmado');
    });

    it('profesionalId del body ≠ su propio _id (otra profesional) ⇒ 403 SIN_PERMISO, no crea nada', async () => {
      await crearConfig();
      const servicio = await crearServicio();
      const passwordHash = await hashPassword(PASSWORD);
      const profesionalLogin = await Usuario.create({
        nombre: 'Profesional Login',
        email: 'logueada@test.com',
        passwordHash,
        rol: 'profesional',
        atiende: true,
        servicios: [servicio._id],
        horarios: horario(),
        activo: true,
      });
      // Otra profesional, distinta de quien loguea — también presta el
      // servicio para que la única razón de un eventual rechazo sea el
      // ownership, no una precondición de catálogo.
      const otraProfesional = await crearProfesionalTarget({ servicios: [servicio._id] });

      const agente = await loguearAgente('logueada@test.com');
      const res = await agente.post('/api/turnos').send({
        ...BODY_BASE,
        servicioId: servicio._id.toString(),
        profesionalId: otraProfesional._id.toString(),
        inicio: enDiasA(3, 10).toISOString(),
      });

      expect(res.status).toBe(403);
      expect(res.body.codigo).toBe('SIN_PERMISO');

      // Nada huérfano: ni el turno (rechazado antes de la transacción) ni
      // ninguna notificación asociada a esa profesional.
      const turnos = await Turno.find({ profesionalId: otraProfesional._id }).lean();
      expect(turnos).toHaveLength(0);
      const turnosLogin = await Turno.find({ profesionalId: profesionalLogin._id }).lean();
      expect(turnosLogin).toHaveLength(0);
      const notifs = await Notificacion.find({}).lean();
      expect(notifs).toHaveLength(0);
    });
  });

  it('body con un campo origen inventado (spoofing) ⇒ se ignora, origen real sale de la sesión', async () => {
    await crearConfig();
    const servicio = await crearServicio();
    const profesional = await crearProfesionalTarget({ servicios: [servicio._id] });

    // Sin sesión — el spoofing en el body no puede convertir esto en 'admin'.
    const res = await request(app)
      .post('/api/turnos')
      .send({
        ...BODY_BASE,
        servicioId: servicio._id.toString(),
        profesionalId: profesional._id.toString(),
        inicio: enDiasA(3, 10).toISOString(),
        origen: 'admin', // no existe en crearTurnoSchema — debe ser stripeado
      });

    expect(res.status).toBe(201);
    expect(res.body.estado).toBe('pendiente');

    const turno = await Turno.findOne({ codigo: res.body.codigo }).lean();
    expect(turno!.origen).toBe('web');
  });
});
