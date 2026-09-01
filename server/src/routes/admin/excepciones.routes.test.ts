import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Express } from 'express';
import request from 'supertest';
import { DateTime } from 'luxon';
import { createApp } from '../../app';
import { Usuario, Excepcion, Configuracion, Servicio } from '../../models';
import { hashPassword } from '../../services/password';
import { consultarDisponibilidad } from '../../services/consultarDisponibilidad';
import { conectarDbTest, desconectarDbTest, limpiarDbTest } from '../../test/dbTestSetup';
import { conCsrf } from '../../test/httpTestHelpers';

const PASSWORD = 'Password123!';
const ZONE = 'America/Argentina/Buenos_Aires';

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

async function crearUsuario(overrides: { email: string; rol: 'admin' | 'profesional' }) {
  const passwordHash = await hashPassword(PASSWORD);
  return Usuario.create({
    nombre: overrides.email,
    email: overrides.email,
    passwordHash,
    rol: overrides.rol,
    atiende: overrides.rol === 'profesional',
    servicios: [],
    horarios: [],
    activo: true,
  });
}

// `app` compartida (arriba): el default de login en test es alto/casi-
// infinito (§15.5, deuda de test cerrada) — ya no hace falta una app nueva
// por login sólo para no agotar el límite real de producción.
// conCsrf (§16, revisión "Dominios separados"): envuelve el agente para que
// post/patch/delete manden el header CSRF automáticamente.
async function loguearAgente(email: string) {
  const agente = conCsrf(request.agent(app));
  const res = await agente.post('/api/auth/login').send({ email, password: PASSWORD });
  expect(res.status).toBe(200);
  return agente;
}

// Contrato de fecha (§15.10): ISO UTC con Z, nunca offset — mismo criterio
// que `inicio` de turnos. `.toUTC().toISO()`, no `.toISO()` a secas.
function isoUTC(dt: DateTime): string {
  return dt.toUTC().toISO()!;
}

function horarioCompleto(desde = '09:00', hasta = '20:00') {
  return Array.from({ length: 7 }, (_, dia) => ({ dia, bloques: [{ desde, hasta }] }));
}

describe('POST /api/admin/excepciones', () => {
  it('feriado del centro (profesionalId:null) ⇒ 201', async () => {
    await crearUsuario({ email: 'admin1@test.com', rol: 'admin' });
    const agente = await loguearAgente('admin1@test.com');

    const desde = DateTime.now().plus({ days: 5 }).startOf('day');
    const hasta = desde.plus({ days: 1 });

    const res = await agente.post('/api/admin/excepciones').send({
      desde: isoUTC(desde),
      hasta: isoUTC(hasta),
      tipo: 'feriado',
      motivo: 'Feriado nacional',
    });

    expect(res.status).toBe(201);
    expect(res.body.profesionalId).toBeNull();
    expect(res.body.tipo).toBe('feriado');
    expect(res.body.motivo).toBe('Feriado nacional');
    expect(res.body).toHaveProperty('id');
    expect(res.body).toHaveProperty('creadoPor');
    expect(res.body).toHaveProperty('creadoEn');
  });

  it('bloqueo de una profesional (profesionalId hex) ⇒ 201', async () => {
    await crearUsuario({ email: 'admin2@test.com', rol: 'admin' });
    const profesional = await crearUsuario({ email: 'prof2@test.com', rol: 'profesional' });
    const agente = await loguearAgente('admin2@test.com');

    const desde = DateTime.now().plus({ days: 3 }).startOf('day');
    const hasta = desde.plus({ days: 2 });

    const res = await agente.post('/api/admin/excepciones').send({
      profesionalId: profesional._id.toString(),
      desde: isoUTC(desde),
      hasta: isoUTC(hasta),
      tipo: 'vacaciones',
    });

    expect(res.status).toBe(201);
    expect(res.body.profesionalId).toBe(profesional._id.toString());
    expect(res.body.tipo).toBe('vacaciones');
  });

  it('hasta <= desde ⇒ 400', async () => {
    await crearUsuario({ email: 'admin3@test.com', rol: 'admin' });
    const agente = await loguearAgente('admin3@test.com');

    const desde = DateTime.now().plus({ days: 1 });
    const hasta = desde.minus({ hours: 1 });

    const res = await agente.post('/api/admin/excepciones').send({
      desde: isoUTC(desde),
      hasta: isoUTC(hasta),
      tipo: 'bloqueo',
    });

    expect(res.status).toBe(400);
    expect(res.body.codigo).toBe('BODY_INVALIDO');
  });

  it('profesionalId malformado (no hex) ⇒ 400, no 500', async () => {
    await crearUsuario({ email: 'admin4@test.com', rol: 'admin' });
    const agente = await loguearAgente('admin4@test.com');

    const desde = DateTime.now().plus({ days: 1 });
    const hasta = desde.plus({ hours: 1 });

    const res = await agente.post('/api/admin/excepciones').send({
      profesionalId: 'no-es-un-id',
      desde: isoUTC(desde),
      hasta: isoUTC(hasta),
      tipo: 'bloqueo',
    });

    expect(res.status).toBe(400);
    expect(res.body.codigo).toBe('BODY_INVALIDO');
  });
});

describe('GET /api/admin/excepciones', () => {
  it('listar con ventana ⇒ sólo las que solapan; sin params ⇒ todas', async () => {
    await crearUsuario({ email: 'admin5@test.com', rol: 'admin' });
    const admin = await Usuario.findOne({ email: 'admin5@test.com' });
    const agente = await loguearAgente('admin5@test.com');

    const base = DateTime.now().startOf('day').plus({ days: 10 });
    const dentro = await Excepcion.create({
      profesionalId: null,
      desde: base.plus({ days: 1 }).toJSDate(),
      hasta: base.plus({ days: 2 }).toJSDate(),
      tipo: 'feriado',
      creadoPor: admin!._id,
    });
    // Solapa sólo el borde inicial de la ventana pedida.
    const solapaBorde = await Excepcion.create({
      profesionalId: null,
      desde: base.minus({ days: 1 }).toJSDate(),
      hasta: base.plus({ hours: 1 }).toJSDate(),
      tipo: 'feriado',
      creadoPor: admin!._id,
    });
    // No solapa la ventana pedida.
    await Excepcion.create({
      profesionalId: null,
      desde: base.plus({ days: 30 }).toJSDate(),
      hasta: base.plus({ days: 31 }).toJSDate(),
      tipo: 'feriado',
      creadoPor: admin!._id,
    });

    const resVentana = await agente.get('/api/admin/excepciones').query({
      desde: isoUTC(base),
      hasta: isoUTC(base.plus({ days: 5 })),
    });

    expect(resVentana.status).toBe(200);
    const idsVentana = resVentana.body.map((e: { id: string }) => e.id).sort();
    expect(idsVentana).toEqual([dentro._id.toString(), solapaBorde._id.toString()].sort());

    const resTodas = await agente.get('/api/admin/excepciones');
    expect(resTodas.status).toBe(200);
    expect(resTodas.body).toHaveLength(3);
  });

  it('listar con profesionalId ⇒ las de ella + las del centro (null)', async () => {
    await crearUsuario({ email: 'admin6@test.com', rol: 'admin' });
    const admin = await Usuario.findOne({ email: 'admin6@test.com' });
    const profA = await crearUsuario({ email: 'profA@test.com', rol: 'profesional' });
    const profB = await crearUsuario({ email: 'profB@test.com', rol: 'profesional' });
    const agente = await loguearAgente('admin6@test.com');

    const desde = DateTime.now().plus({ days: 1 });
    const hasta = desde.plus({ days: 1 });

    const delCentro = await Excepcion.create({
      profesionalId: null,
      desde: desde.toJSDate(),
      hasta: hasta.toJSDate(),
      tipo: 'feriado',
      creadoPor: admin!._id,
    });
    const deA = await Excepcion.create({
      profesionalId: profA._id,
      desde: desde.toJSDate(),
      hasta: hasta.toJSDate(),
      tipo: 'vacaciones',
      creadoPor: admin!._id,
    });
    await Excepcion.create({
      profesionalId: profB._id,
      desde: desde.toJSDate(),
      hasta: hasta.toJSDate(),
      tipo: 'vacaciones',
      creadoPor: admin!._id,
    });

    const res = await agente.get('/api/admin/excepciones').query({ profesionalId: profA._id.toString() });

    expect(res.status).toBe(200);
    const ids = res.body.map((e: { id: string }) => e.id).sort();
    expect(ids).toEqual([delCentro._id.toString(), deA._id.toString()].sort());
  });
});

describe('PATCH /api/admin/excepciones/:id', () => {
  it('cambia el rango ⇒ revalida hasta > desde (también contra el documento si sólo viene un extremo)', async () => {
    await crearUsuario({ email: 'admin7@test.com', rol: 'admin' });
    const admin = await Usuario.findOne({ email: 'admin7@test.com' });
    const agente = await loguearAgente('admin7@test.com');

    const desde = DateTime.now().plus({ days: 2 }).startOf('day');
    const hasta = desde.plus({ days: 1 });
    const excepcion = await Excepcion.create({
      profesionalId: null,
      desde: desde.toJSDate(),
      hasta: hasta.toJSDate(),
      tipo: 'feriado',
      creadoPor: admin!._id,
    });

    // PATCH válido que no toca el rango.
    const resOk = await agente.patch(`/api/admin/excepciones/${excepcion._id}`).send({ motivo: 'Cambió', tipo: 'bloqueo' });
    expect(resOk.status).toBe(200);
    expect(resOk.body.motivo).toBe('Cambió');
    expect(resOk.body.tipo).toBe('bloqueo');

    // Invierte el rango mandando los dos extremos ⇒ 400 (Zod .refine()).
    const resInvertido = await agente.patch(`/api/admin/excepciones/${excepcion._id}`).send({
      desde: isoUTC(hasta),
      hasta: isoUTC(desde),
    });
    expect(resInvertido.status).toBe(400);

    // Sólo manda `desde`, posterior al `hasta` existente en la base ⇒ 400
    // (Zod no puede ver el `hasta` existente; la revalidación final es del service).
    const resSoloDesde = await agente.patch(`/api/admin/excepciones/${excepcion._id}`).send({
      desde: isoUTC(hasta.plus({ days: 1 })),
    });
    expect(resSoloDesde.status).toBe(400);
  });
});

describe('DELETE /api/admin/excepciones/:id', () => {
  it('borra físicamente — un GET posterior no lo trae', async () => {
    await crearUsuario({ email: 'admin8@test.com', rol: 'admin' });
    const admin = await Usuario.findOne({ email: 'admin8@test.com' });
    const agente = await loguearAgente('admin8@test.com');

    const desde = DateTime.now().plus({ days: 1 });
    const hasta = desde.plus({ days: 1 });
    const excepcion = await Excepcion.create({
      profesionalId: null,
      desde: desde.toJSDate(),
      hasta: hasta.toJSDate(),
      tipo: 'feriado',
      creadoPor: admin!._id,
    });

    const resDelete = await agente.delete(`/api/admin/excepciones/${excepcion._id}`);
    expect(resDelete.status).toBe(204);

    const enBase = await Excepcion.findById(excepcion._id).lean();
    expect(enBase).toBeNull();

    const resGet = await agente.get('/api/admin/excepciones');
    expect(resGet.body).toEqual([]);
  });
});

describe('efecto en disponibilidad', () => {
  it('una excepción borrada deja de restar (el horario vuelve)', async () => {
    const admin = await crearUsuario({ email: 'admin9@test.com', rol: 'admin' });
    const agente = await loguearAgente('admin9@test.com');

    await Configuracion.create({
      _id: 'centro',
      nombre: 'Centro',
      timezone: ZONE,
      horarios: horarioCompleto(),
      pasoGrillaMin: 30,
      antelacionMinimaHoras: 0,
      ventanaMaximaDias: 7,
      cancelacionMinimaHoras: 24,
      vencimientoPendienteHoras: 12,
      contacto: { telefonoE164: '+5493364000000', email: 'centro@test.com', direccion: 'Calle 1' },
    });

    const servicio = await Servicio.create({
      nombre: 'Manicura',
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
      email: 'profDisp@test.com',
      passwordHash: 'x',
      rol: 'profesional',
      atiende: true,
      servicios: [servicio._id],
      horarios: horarioCompleto(),
      activo: true,
    });

    const diaObjetivo = DateTime.now().setZone(ZONE).startOf('day').plus({ days: 1 });
    const desdeVentana = diaObjetivo.set({ hour: 9 }).toJSDate();
    const hastaVentana = diaObjetivo.set({ hour: 20 }).toJSDate();

    const excepcion = await Excepcion.create({
      profesionalId: null,
      desde: desdeVentana,
      hasta: hastaVentana,
      tipo: 'bloqueo',
      creadoPor: admin._id,
    });

    const conExcepcion = await consultarDisponibilidad({
      servicioId: servicio._id.toString(),
      profesionalId: profesional._id.toString(),
      desde: desdeVentana,
      hasta: hastaVentana,
    });
    expect(conExcepcion.slots).toEqual([]);

    const resDelete = await agente.delete(`/api/admin/excepciones/${excepcion._id}`);
    expect(resDelete.status).toBe(204);

    const sinExcepcion = await consultarDisponibilidad({
      servicioId: servicio._id.toString(),
      profesionalId: profesional._id.toString(),
      desde: desdeVentana,
      hasta: hastaVentana,
    });
    expect(sinExcepcion.slots.length).toBeGreaterThan(0);
  });
});

describe('namespace /api/admin/excepciones — ownership por rol', () => {
  it('profesional (no admin) ⇒ 403 en cualquier ruta', async () => {
    await crearUsuario({ email: 'profX@test.com', rol: 'profesional' });
    const admin = await crearUsuario({ email: 'adminAux@test.com', rol: 'admin' });
    const excepcion = await Excepcion.create({
      profesionalId: null,
      desde: new Date(Date.now() + 24 * 3600_000),
      hasta: new Date(Date.now() + 48 * 3600_000),
      tipo: 'feriado',
      creadoPor: admin._id,
    });
    const agente = await loguearAgente('profX@test.com');

    const resPost = await agente.post('/api/admin/excepciones').send({
      desde: isoUTC(DateTime.now().plus({ days: 1 })),
      hasta: isoUTC(DateTime.now().plus({ days: 2 })),
      tipo: 'feriado',
    });
    expect(resPost.status).toBe(403);

    const resGet = await agente.get('/api/admin/excepciones');
    expect(resGet.status).toBe(403);

    const resPatch = await agente.patch(`/api/admin/excepciones/${excepcion._id}`).send({ motivo: 'x' });
    expect(resPatch.status).toBe(403);

    const resDelete = await agente.delete(`/api/admin/excepciones/${excepcion._id}`);
    expect(resDelete.status).toBe(403);
  });
});
