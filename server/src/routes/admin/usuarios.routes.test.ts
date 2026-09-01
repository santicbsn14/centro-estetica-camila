import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Express } from 'express';
import request from 'supertest';
import { Types } from 'mongoose';
import { createApp } from '../../app';
import { Usuario, Turno } from '../../models';
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

async function crearUsuario(overrides: { email: string; rol: 'admin' | 'profesional'; password?: string }) {
  const passwordHash = await hashPassword(overrides.password ?? PASSWORD);
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
async function loguearAgente(email: string, password = PASSWORD) {
  const agente = conCsrf(request.agent(app));
  const res = await agente.post('/api/auth/login').send({ email, password });
  return { agente, res };
}

async function loguearAgenteOk(email: string, password = PASSWORD) {
  const { agente, res } = await loguearAgente(email, password);
  expect(res.status).toBe(200);
  return agente;
}

function horarioValido() {
  return [{ dia: 1, bloques: [{ desde: '09:00', hasta: '18:00' }] }];
}

function bodyUsuarioValido(overrides: Record<string, unknown> = {}) {
  return {
    nombre: 'Nueva Profesional',
    email: 'nueva@test.com',
    password: 'ClaveInicial123',
    rol: 'profesional',
    atiende: true,
    servicios: [],
    horarios: horarioValido(),
    ...overrides,
  };
}

describe('POST /api/admin/usuarios', () => {
  it('alta válida ⇒ 201 UsuarioPanel, activo:true, sin passwordHash', async () => {
    await crearUsuario({ email: 'admin1@test.com', rol: 'admin' });
    const agente = await loguearAgenteOk('admin1@test.com');

    const res = await agente.post('/api/admin/usuarios').send(bodyUsuarioValido());

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      nombre: 'Nueva Profesional',
      email: 'nueva@test.com',
      rol: 'profesional',
      atiende: true,
      activo: true,
    });
    expect(res.body).not.toHaveProperty('passwordHash');
    expect(res.body).not.toHaveProperty('password');
  });

  it('email duplicado ⇒ 409 EMAIL_DUPLICADO', async () => {
    await crearUsuario({ email: 'admin2@test.com', rol: 'admin' });
    const agente = await loguearAgenteOk('admin2@test.com');

    const primera = await agente.post('/api/admin/usuarios').send(bodyUsuarioValido({ email: 'repetida@test.com' }));
    expect(primera.status).toBe(201);

    const segunda = await agente
      .post('/api/admin/usuarios')
      .send(bodyUsuarioValido({ email: 'repetida@test.com', nombre: 'Otra' }));
    expect(segunda.status).toBe(409);
    expect(segunda.body.codigo).toBe('EMAIL_DUPLICADO');
  });

  it('horarios solapados ⇒ 400 (validador §10)', async () => {
    await crearUsuario({ email: 'admin3@test.com', rol: 'admin' });
    const agente = await loguearAgenteOk('admin3@test.com');

    const res = await agente.post('/api/admin/usuarios').send(
      bodyUsuarioValido({
        horarios: [{ dia: 1, bloques: [{ desde: '09:00', hasta: '13:00' }, { desde: '12:00', hasta: '15:00' }] }],
      })
    );

    expect(res.status).toBe(400);
  });

  it('horarios:null ⇒ 400 (usuarios es nullable:false)', async () => {
    await crearUsuario({ email: 'admin4@test.com', rol: 'admin' });
    const agente = await loguearAgenteOk('admin4@test.com');

    const res = await agente.post('/api/admin/usuarios').send(bodyUsuarioValido({ horarios: null }));

    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/admin/usuarios/:id', () => {
  it('con password en el body ⇒ 400 (.strict() lo rechaza)', async () => {
    await crearUsuario({ email: 'admin5@test.com', rol: 'admin' });
    const profesional = await crearUsuario({ email: 'prof5@test.com', rol: 'profesional' });
    const agente = await loguearAgenteOk('admin5@test.com');

    const res = await agente.patch(`/api/admin/usuarios/${profesional._id}`).send({ password: 'OtraClave123' });

    expect(res.status).toBe(400);
    expect(res.body.codigo).toBe('BODY_INVALIDO');
  });

  it('email a uno existente ⇒ 409 EMAIL_DUPLICADO', async () => {
    await crearUsuario({ email: 'admin6@test.com', rol: 'admin' });
    await crearUsuario({ email: 'ocupado@test.com', rol: 'profesional' });
    const profesional = await crearUsuario({ email: 'prof6@test.com', rol: 'profesional' });
    const agente = await loguearAgenteOk('admin6@test.com');

    const res = await agente.patch(`/api/admin/usuarios/${profesional._id}`).send({ email: 'ocupado@test.com' });

    expect(res.status).toBe(409);
    expect(res.body.codigo).toBe('EMAIL_DUPLICADO');
  });

  it('activo:false sobre profesional con 2 turnos futuros ⇒ 200 + turnosFuturosActivos:2', async () => {
    await crearUsuario({ email: 'admin7@test.com', rol: 'admin' });
    const profesional = await crearUsuario({ email: 'prof7@test.com', rol: 'profesional' });

    const baseTurno = {
      clienteId: new Types.ObjectId(),
      clienteSnapshot: { nombre: 'Clienta', telefonoE164: '+5493364111111' },
      profesionalId: profesional._id,
      profesionalNombre: 'prof7@test.com',
      servicio: { servicioId: new Types.ObjectId(), nombre: 'Manicura', duracionMin: 30, bufferPostMin: 0, precio: 100 },
      historial: [],
      origen: 'web' as const,
      fueraDeHorario: false,
    };
    await Turno.create([
      {
        ...baseTurno,
        codigo: 'TRN-0001',
        inicio: new Date(Date.now() + 24 * 3600_000),
        fin: new Date(Date.now() + 25 * 3600_000),
        finBloqueo: new Date(Date.now() + 25 * 3600_000),
        estado: 'pendiente',
      },
      {
        ...baseTurno,
        codigo: 'TRN-0002',
        inicio: new Date(Date.now() + 48 * 3600_000),
        fin: new Date(Date.now() + 49 * 3600_000),
        finBloqueo: new Date(Date.now() + 49 * 3600_000),
        estado: 'confirmado',
      },
      {
        ...baseTurno,
        codigo: 'TRN-0003',
        inicio: new Date(Date.now() - 48 * 3600_000), // pasado: no cuenta
        fin: new Date(Date.now() - 47 * 3600_000),
        finBloqueo: new Date(Date.now() - 47 * 3600_000),
        estado: 'confirmado',
      },
      {
        ...baseTurno,
        codigo: 'TRN-0004',
        inicio: new Date(Date.now() + 72 * 3600_000),
        fin: new Date(Date.now() + 73 * 3600_000),
        finBloqueo: new Date(Date.now() + 73 * 3600_000),
        estado: 'cancelado', // no cuenta: no ocupa agenda
      },
    ]);

    const agente = await loguearAgenteOk('admin7@test.com');
    const res = await agente.patch(`/api/admin/usuarios/${profesional._id}`).send({ activo: false });

    expect(res.status).toBe(200);
    expect(res.body.activo).toBe(false);
    expect(res.body.turnosFuturosActivos).toBe(2);
  });
});

describe('POST /api/admin/usuarios/:id/reset-password', () => {
  it('resetea ⇒ 200; la profesional loguea con la nueva, no con la vieja', async () => {
    await crearUsuario({ email: 'admin8@test.com', rol: 'admin' });
    const profesional = await crearUsuario({ email: 'prof8@test.com', rol: 'profesional', password: 'ViejaClave123' });

    const agente = await loguearAgenteOk('admin8@test.com');
    const res = await agente.post(`/api/admin/usuarios/${profesional._id}/reset-password`).send({ nueva: 'NuevaClave123' });
    expect(res.status).toBe(200);

    const conVieja = await loguearAgente('prof8@test.com', 'ViejaClave123');
    expect(conVieja.res.status).toBe(401);

    const conNueva = await loguearAgente('prof8@test.com', 'NuevaClave123');
    expect(conNueva.res.status).toBe(200);
  });

  it('invalida las sesiones vivas de la profesional (§13): la cookie vieja da 401 después del reset', async () => {
    await crearUsuario({ email: 'admin8b@test.com', rol: 'admin' });
    await crearUsuario({ email: 'prof8b@test.com', rol: 'profesional', password: 'ViejaClave123' });

    const agenteProfesional = await loguearAgenteOk('prof8b@test.com', 'ViejaClave123');
    const meAntes = await agenteProfesional.get('/api/auth/me');
    expect(meAntes.status).toBe(200); // sesión viva antes del reset

    const profesional = await Usuario.findOne({ email: 'prof8b@test.com' });
    const agenteAdmin = await loguearAgenteOk('admin8b@test.com');
    const resReset = await agenteAdmin
      .post(`/api/admin/usuarios/${profesional!._id}/reset-password`)
      .send({ nueva: 'NuevaClave123' });
    expect(resReset.status).toBe(200);

    // Misma cookie de antes del reset — la sesión ya no existe en el store.
    const meDespues = await agenteProfesional.get('/api/auth/me');
    expect(meDespues.status).toBe(401);
  });
});

describe('namespace /api/admin/usuarios — ownership por rol', () => {
  it('profesional (no admin) ⇒ 403 en cualquier ruta', async () => {
    await crearUsuario({ email: 'profX@test.com', rol: 'profesional' });
    const otro = await crearUsuario({ email: 'otro@test.com', rol: 'profesional' });
    const agente = await loguearAgenteOk('profX@test.com');

    const resPost = await agente.post('/api/admin/usuarios').send(bodyUsuarioValido());
    expect(resPost.status).toBe(403);

    const resGetLista = await agente.get('/api/admin/usuarios');
    expect(resGetLista.status).toBe(403);

    const resGetUno = await agente.get(`/api/admin/usuarios/${otro._id}`);
    expect(resGetUno.status).toBe(403);

    const resPatch = await agente.patch(`/api/admin/usuarios/${otro._id}`).send({ nombre: 'x' });
    expect(resPatch.status).toBe(403);

    const resReset = await agente.post(`/api/admin/usuarios/${otro._id}/reset-password`).send({ nueva: 'Otra12345' });
    expect(resReset.status).toBe(403);
  });
});

describe('ninguna respuesta de usuarios incluye passwordHash', () => {
  it('en listado ni en detalle', async () => {
    await crearUsuario({ email: 'admin9@test.com', rol: 'admin' });
    const profesional = await crearUsuario({ email: 'prof9@test.com', rol: 'profesional' });
    const agente = await loguearAgenteOk('admin9@test.com');

    const resLista = await agente.get('/api/admin/usuarios');
    expect(resLista.status).toBe(200);
    for (const u of resLista.body) {
      expect(u).not.toHaveProperty('passwordHash');
    }

    const resDetalle = await agente.get(`/api/admin/usuarios/${profesional._id}`);
    expect(resDetalle.status).toBe(200);
    expect(resDetalle.body).not.toHaveProperty('passwordHash');
  });
});
