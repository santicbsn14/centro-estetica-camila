import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Express } from 'express';
import request from 'supertest';
import { createApp } from '../app';
import { Usuario } from '../models';
import { hashPassword } from '../services/password';
import { conectarDbTest, desconectarDbTest, limpiarDbTest } from '../test/dbTestSetup';
import { conCsrf } from '../test/httpTestHelpers';

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

async function crearProfesional(overrides: { email: string; horarios?: unknown[] }) {
  const passwordHash = await hashPassword(PASSWORD);
  return Usuario.create({
    nombre: overrides.email,
    email: overrides.email,
    passwordHash,
    rol: 'profesional',
    atiende: true,
    servicios: [],
    horarios: overrides.horarios ?? [{ dia: 1, bloques: [{ desde: '09:00', hasta: '18:00' }] }],
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

describe('POST /api/mi/password', () => {
  it('actual incorrecta ⇒ 401; correcta ⇒ 200', async () => {
    await crearProfesional({ email: 'prof1@test.com' });
    const agente = await loguearAgente('prof1@test.com');

    const conIncorrecta = await agente.post('/api/mi/password').send({ actual: 'noesesta', nueva: 'NuevaClave123' });
    expect(conIncorrecta.status).toBe(401);
    expect(conIncorrecta.body.codigo).toBe('CREDENCIALES_INVALIDAS');

    const conCorrecta = await agente.post('/api/mi/password').send({ actual: PASSWORD, nueva: 'NuevaClave123' });
    expect(conCorrecta.status).toBe(200);
  });
});

describe('PATCH /api/mi/perfil', () => {
  it('con rol en el body ⇒ 400 (no editable acá)', async () => {
    await crearProfesional({ email: 'prof2@test.com' });
    const agente = await loguearAgente('prof2@test.com');

    const res = await agente.patch('/api/mi/perfil').send({ nombre: 'Nuevo Nombre', rol: 'admin' });

    expect(res.status).toBe(400);
    expect(res.body.codigo).toBe('BODY_INVALIDO');
  });

  it('sólo nombre ⇒ 200, cambia el nombre propio', async () => {
    await crearProfesional({ email: 'prof3@test.com' });
    const agente = await loguearAgente('prof3@test.com');

    const res = await agente.patch('/api/mi/perfil').send({ nombre: 'Nombre Actualizado' });

    expect(res.status).toBe(200);
    expect(res.body.nombre).toBe('Nombre Actualizado');
  });
});

describe('PATCH /api/mi/horarios', () => {
  it('edita los propios; no toca los de otra profesional (sin :id)', async () => {
    await crearProfesional({ email: 'profA@test.com' });
    await crearProfesional({ email: 'profB@test.com' });

    const agenteA = await loguearAgente('profA@test.com');
    const nuevoHorario = [{ dia: 3, bloques: [{ desde: '10:00', hasta: '16:00' }] }];
    const res = await agenteA.patch('/api/mi/horarios').send({ horarios: nuevoHorario });

    expect(res.status).toBe(200);
    expect(res.body.horarios).toEqual(nuevoHorario);

    const profB = await Usuario.findOne({ email: 'profB@test.com' }).lean();
    expect(profB!.horarios).toEqual([{ dia: 1, bloques: [{ desde: '09:00', hasta: '18:00' }] }]);
  });

  it('horarios solapados ⇒ 400 (validador §10)', async () => {
    await crearProfesional({ email: 'prof4@test.com' });
    const agente = await loguearAgente('prof4@test.com');

    const res = await agente.patch('/api/mi/horarios').send({
      horarios: [{ dia: 1, bloques: [{ desde: '09:00', hasta: '13:00' }, { desde: '12:00', hasta: '15:00' }] }],
    });

    expect(res.status).toBe(400);
  });
});

describe('GET /api/mi/perfil', () => {
  it('devuelve mis datos sin passwordHash', async () => {
    await crearProfesional({ email: 'prof5@test.com' });
    const agente = await loguearAgente('prof5@test.com');

    const res = await agente.get('/api/mi/perfil');

    expect(res.status).toBe(200);
    expect(res.body.email).toBe('prof5@test.com');
    expect(res.body).not.toHaveProperty('passwordHash');
  });

  it('sin sesión ⇒ 401', async () => {
    const res = await request(app).get('/api/mi/perfil'); // sin agent: sin cookie
    expect(res.status).toBe(401);
  });
});
