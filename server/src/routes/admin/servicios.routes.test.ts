import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Express } from 'express';
import request from 'supertest';
import { Types } from 'mongoose';
import { createApp } from '../../app';
import { Servicio, Usuario, Turno } from '../../models';
import { hashPassword } from '../../services/password';
import { conectarDbTest, desconectarDbTest, limpiarDbTest } from '../../test/dbTestSetup';
import { conCsrf } from '../../test/httpTestHelpers';

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

function bodyServicioValido(overrides: Record<string, unknown> = {}) {
  return {
    nombre: 'Manicura',
    descripcion: 'Manicura semipermanente',
    duracionMin: 45,
    bufferPostMin: 15,
    precio: 800000,
    mostrarPrecio: true,
    horarios: null,
    orden: 0,
    ...overrides,
  };
}

describe('POST /api/admin/servicios', () => {
  it('crea válido ⇒ 201 ServicioPanel completo, activo:true', async () => {
    await crearUsuario({ email: 'admin1@test.com', rol: 'admin' });
    const agente = await loguearAgente('admin1@test.com');

    const res = await agente.post('/api/admin/servicios').send(bodyServicioValido());

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      nombre: 'Manicura',
      descripcion: 'Manicura semipermanente',
      duracionMin: 45,
      bufferPostMin: 15,
      precio: 800000,
      mostrarPrecio: true,
      horarios: null,
      orden: 0,
      activo: true,
    });
    expect(res.body).toHaveProperty('id');
    expect(res.body).toHaveProperty('creadoEn');
    expect(res.body).toHaveProperty('actualizadoEn');
  });

  it('nombre duplicado (distinta capitalización) ⇒ 409 NOMBRE_DUPLICADO', async () => {
    await crearUsuario({ email: 'admin2@test.com', rol: 'admin' });
    const agente = await loguearAgente('admin2@test.com');

    const primero = await agente.post('/api/admin/servicios').send(bodyServicioValido({ nombre: 'Uñas' }));
    expect(primero.status).toBe(201);

    const segundo = await agente.post('/api/admin/servicios').send(bodyServicioValido({ nombre: 'UÑAS' }));
    expect(segundo.status).toBe(409);
    expect(segundo.body.codigo).toBe('NOMBRE_DUPLICADO');
  });

  it('horarios solapados ⇒ 400 (validador §10)', async () => {
    await crearUsuario({ email: 'admin3@test.com', rol: 'admin' });
    const agente = await loguearAgente('admin3@test.com');

    const res = await agente.post('/api/admin/servicios').send(
      bodyServicioValido({
        horarios: [{ dia: 1, bloques: [{ desde: '09:00', hasta: '13:00' }, { desde: '12:00', hasta: '15:00' }] }],
      })
    );

    expect(res.status).toBe(400);
  });

  it('horarios:null ⇒ ok (nullable:true)', async () => {
    await crearUsuario({ email: 'admin4@test.com', rol: 'admin' });
    const agente = await loguearAgente('admin4@test.com');

    const res = await agente.post('/api/admin/servicios').send(bodyServicioValido({ horarios: null }));

    expect(res.status).toBe(201);
    expect(res.body.horarios).toBeNull();
  });
});

describe('GET /api/admin/servicios', () => {
  it('lista todos, incluidos inactivos', async () => {
    await crearUsuario({ email: 'admin5@test.com', rol: 'admin' });
    await Servicio.create([
      { nombre: 'Activo', duracionMin: 30, bufferPostMin: 0, precio: 100, mostrarPrecio: true, horarios: null, orden: 0, activo: true },
      { nombre: 'Inactivo', duracionMin: 30, bufferPostMin: 0, precio: 100, mostrarPrecio: true, horarios: null, orden: 1, activo: false },
    ]);

    const agente = await loguearAgente('admin5@test.com');
    const res = await agente.get('/api/admin/servicios');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body.map((s: { nombre: string }) => s.nombre).sort()).toEqual(['Activo', 'Inactivo']);
  });
});

describe('GET /api/admin/servicios/:id', () => {
  it('inexistente ⇒ 404', async () => {
    await crearUsuario({ email: 'admin6@test.com', rol: 'admin' });
    const agente = await loguearAgente('admin6@test.com');

    const res = await agente.get(`/api/admin/servicios/${new Types.ObjectId()}`);

    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/admin/servicios/:id', () => {
  it('sólo precio ⇒ cambia precio, no toca el resto', async () => {
    await crearUsuario({ email: 'admin7@test.com', rol: 'admin' });
    const servicio = await Servicio.create({
      nombre: 'Pedicura',
      descripcion: 'Pedicura spa',
      duracionMin: 60,
      bufferPostMin: 10,
      precio: 900000,
      mostrarPrecio: true,
      horarios: null,
      orden: 2,
      activo: true,
    });

    const agente = await loguearAgente('admin7@test.com');
    const res = await agente.patch(`/api/admin/servicios/${servicio._id}`).send({ precio: 950000 });

    expect(res.status).toBe(200);
    expect(res.body.precio).toBe(950000);
    expect(res.body.nombre).toBe('Pedicura');
    expect(res.body.duracionMin).toBe(60);
    expect(res.body.descripcion).toBe('Pedicura spa');
  });

  it('horarios ⇒ reemplaza el array entero, no hace merge', async () => {
    await crearUsuario({ email: 'admin8@test.com', rol: 'admin' });
    const servicio = await Servicio.create({
      nombre: 'Depilación',
      duracionMin: 30,
      bufferPostMin: 0,
      precio: 500000,
      mostrarPrecio: true,
      horarios: [
        { dia: 1, bloques: [{ desde: '09:00', hasta: '12:00' }] },
        { dia: 3, bloques: [{ desde: '14:00', hasta: '18:00' }] },
      ],
      orden: 0,
      activo: true,
    });

    const agente = await loguearAgente('admin8@test.com');
    const nuevoHorario = [{ dia: 5, bloques: [{ desde: '10:00', hasta: '16:00' }] }];
    const res = await agente.patch(`/api/admin/servicios/${servicio._id}`).send({ horarios: nuevoHorario });

    expect(res.status).toBe(200);
    expect(res.body.horarios).toEqual(nuevoHorario); // reemplazó, no mezcló con dia:1/dia:3
  });

  it('activo:false ⇒ borrado lógico, desaparece del público, turno futuro intacto', async () => {
    await crearUsuario({ email: 'admin9@test.com', rol: 'admin' });
    const profesional = await crearUsuario({ email: 'prof9@test.com', rol: 'profesional' });
    const servicio = await Servicio.create({
      nombre: 'Masaje',
      duracionMin: 60,
      bufferPostMin: 0,
      precio: 700000,
      mostrarPrecio: true,
      horarios: null,
      orden: 0,
      activo: true,
    });
    const turno = await Turno.create({
      codigo: 'TRN-1234',
      clienteId: new Types.ObjectId(),
      clienteSnapshot: { nombre: 'Clienta', telefonoE164: '+5493364111111' },
      profesionalId: profesional._id,
      profesionalNombre: 'prof9@test.com',
      servicio: { servicioId: servicio._id, nombre: 'Masaje', duracionMin: 60, bufferPostMin: 0, precio: 700000 },
      inicio: new Date(Date.now() + 72 * 3600_000),
      fin: new Date(Date.now() + 73 * 3600_000),
      finBloqueo: new Date(Date.now() + 73 * 3600_000),
      estado: 'confirmado',
      historial: [],
      origen: 'web',
      fueraDeHorario: false,
    });

    const agente = await loguearAgente('admin9@test.com');
    const resPatch = await agente.patch(`/api/admin/servicios/${servicio._id}`).send({ activo: false });
    expect(resPatch.status).toBe(200);
    expect(resPatch.body.activo).toBe(false);

    const resPublico = await request(createApp({ mongoUrl })).get('/api/servicios');
    expect(resPublico.body.find((s: { nombre: string }) => s.nombre === 'Masaje')).toBeUndefined();

    const turnoIntacto = await Turno.findById(turno._id).lean();
    expect(turnoIntacto!.servicio.nombre).toBe('Masaje');
    expect(turnoIntacto!.servicio.precio).toBe(700000);
  });

  it('activo:true sobre uno inactivo ⇒ reactiva', async () => {
    await crearUsuario({ email: 'admin10@test.com', rol: 'admin' });
    const servicio = await Servicio.create({
      nombre: 'Reflexología',
      duracionMin: 45,
      bufferPostMin: 0,
      precio: 600000,
      mostrarPrecio: true,
      horarios: null,
      orden: 0,
      activo: false,
    });

    const agente = await loguearAgente('admin10@test.com');
    const res = await agente.patch(`/api/admin/servicios/${servicio._id}`).send({ activo: true });

    expect(res.status).toBe(200);
    expect(res.body.activo).toBe(true);
  });
});

describe('namespace /api/admin — ownership por rol', () => {
  it('profesional (no admin) sobre cualquier ruta del namespace ⇒ 403', async () => {
    await crearUsuario({ email: 'profX@test.com', rol: 'profesional' });
    const servicio = await Servicio.create({
      nombre: 'Cejas',
      duracionMin: 20,
      bufferPostMin: 0,
      precio: 300000,
      mostrarPrecio: true,
      horarios: null,
      orden: 0,
      activo: true,
    });

    const agente = await loguearAgente('profX@test.com');

    const resPost = await agente.post('/api/admin/servicios').send(bodyServicioValido({ nombre: 'Otro' }));
    expect(resPost.status).toBe(403);
    expect(resPost.body.codigo).toBe('SIN_PERMISO');

    const resGetLista = await agente.get('/api/admin/servicios');
    expect(resGetLista.status).toBe(403);

    const resGetUno = await agente.get(`/api/admin/servicios/${servicio._id}`);
    expect(resGetUno.status).toBe(403);

    const resPatch = await agente.patch(`/api/admin/servicios/${servicio._id}`).send({ precio: 1 });
    expect(resPatch.status).toBe(403);
  });
});
