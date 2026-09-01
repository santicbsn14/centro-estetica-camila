import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Express } from 'express';
import request from 'supertest';
import { createApp } from '../../app';
import { Configuracion, Usuario } from '../../models';
import { hashPassword } from '../../services/password';
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

// Mismos defaults que scripts/seedAdmin.ts (§15.8), reconstruidos acá a mano:
// el test no depende del script, sólo confirma que el endpoint se comporta
// bien sobre el singleton ya sembrado.
async function crearConfigSembrada() {
  return Configuracion.create({
    _id: 'centro',
    nombre: 'Camila González Belleza',
    timezone: ZONE,
    horarios: [
      { dia: 1, bloques: [{ desde: '09:00', hasta: '18:00' }] },
      { dia: 2, bloques: [{ desde: '09:00', hasta: '18:00' }] },
    ],
    pasoGrillaMin: 30,
    antelacionMinimaHoras: 3,
    ventanaMaximaDias: 60,
    cancelacionMinimaHoras: 24,
    vencimientoPendienteHoras: 12,
    contacto: {
      telefonoE164: '+5493364000000',
      email: 'contacto@completar.com',
      direccion: 'Completar dirección',
    },
  });
}

describe('GET /api/admin/configuracion', () => {
  it('tras el seed ⇒ 200 singleton completo con los defaults', async () => {
    await crearConfigSembrada();
    await crearUsuario({ email: 'admin1@test.com', rol: 'admin' });

    const agente = await loguearAgente('admin1@test.com');
    const res = await agente.get('/api/admin/configuracion');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: 'centro',
      nombre: 'Camila González Belleza',
      timezone: ZONE,
      pasoGrillaMin: 30,
      antelacionMinimaHoras: 3,
      ventanaMaximaDias: 60,
      cancelacionMinimaHoras: 24,
      vencimientoPendienteHoras: 12,
    });
    expect(res.body.contacto.telefonoE164).toBe('+5493364000000');
  });
});

describe('PATCH /api/admin/configuracion', () => {
  it('nombre ⇒ cambia sólo nombre', async () => {
    await crearConfigSembrada();
    await crearUsuario({ email: 'admin2@test.com', rol: 'admin' });

    const agente = await loguearAgente('admin2@test.com');
    const res = await agente.patch('/api/admin/configuracion').send({ nombre: 'Camila González Estética' });

    expect(res.status).toBe(200);
    expect(res.body.nombre).toBe('Camila González Estética');
    expect(res.body.pasoGrillaMin).toBe(30);
  });

  it('pasoGrillaMin ⇒ cambia sólo eso, no toca horarios ni contacto', async () => {
    await crearConfigSembrada();
    await crearUsuario({ email: 'admin3@test.com', rol: 'admin' });

    const agente = await loguearAgente('admin3@test.com');
    const res = await agente.patch('/api/admin/configuracion').send({ pasoGrillaMin: 15 });

    expect(res.status).toBe(200);
    expect(res.body.pasoGrillaMin).toBe(15);
    expect(res.body.horarios).toHaveLength(2);
    expect(res.body.contacto.telefonoE164).toBe('+5493364000000');
  });

  it('horarios con solape ⇒ 400 (validador §10)', async () => {
    await crearConfigSembrada();
    await crearUsuario({ email: 'admin4@test.com', rol: 'admin' });

    const agente = await loguearAgente('admin4@test.com');
    const res = await agente.patch('/api/admin/configuracion').send({
      horarios: [{ dia: 1, bloques: [{ desde: '09:00', hasta: '13:00' }, { desde: '12:00', hasta: '15:00' }] }],
    });

    expect(res.status).toBe(400);
  });

  it('horarios:null ⇒ 400 (configuracion es nullable:false)', async () => {
    await crearConfigSembrada();
    await crearUsuario({ email: 'admin5@test.com', rol: 'admin' });

    const agente = await loguearAgente('admin5@test.com');
    const res = await agente.patch('/api/admin/configuracion').send({ horarios: null });

    expect(res.status).toBe(400);
  });

  it('timezone presente ⇒ 400 (.strict() lo rechaza)', async () => {
    await crearConfigSembrada();
    await crearUsuario({ email: 'admin6@test.com', rol: 'admin' });

    const agente = await loguearAgente('admin6@test.com');
    const res = await agente.patch('/api/admin/configuracion').send({ timezone: 'America/Cordoba' });

    expect(res.status).toBe(400);
    expect(res.body.codigo).toBe('BODY_INVALIDO');
  });

  it('contacto con telefonoE164 inválido ⇒ 400 (normalización §10)', async () => {
    await crearConfigSembrada();
    await crearUsuario({ email: 'admin7@test.com', rol: 'admin' });

    const agente = await loguearAgente('admin7@test.com');
    const res = await agente.patch('/api/admin/configuracion').send({
      contacto: { telefonoE164: '15 4123456', email: 'centro@test.com', direccion: 'Calle 1' },
    });

    expect(res.status).toBe(400);
    expect(res.body.codigo).toBe('TELEFONO_INVALIDO');
  });

  it('pasoGrillaMin: 2 (< 5) ⇒ 400', async () => {
    await crearConfigSembrada();
    await crearUsuario({ email: 'admin8@test.com', rol: 'admin' });

    const agente = await loguearAgente('admin8@test.com');
    const res = await agente.patch('/api/admin/configuracion').send({ pasoGrillaMin: 2 });

    expect(res.status).toBe(400);
  });

  it('profesional (no admin) ⇒ 403', async () => {
    await crearConfigSembrada();
    await crearUsuario({ email: 'prof1@test.com', rol: 'profesional' });

    const agente = await loguearAgente('prof1@test.com');

    const resGet = await agente.get('/api/admin/configuracion');
    expect(resGet.status).toBe(403);

    const resPatch = await agente.patch('/api/admin/configuracion').send({ nombre: 'x' });
    expect(resPatch.status).toBe(403);
  });
});
