import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import express, { Express } from 'express';
import request from 'supertest';
import { Types } from 'mongoose';
import { createApp } from '../app';
import { Usuario } from '../models';
import { hashPassword } from '../services/password';
import { requireAuth, requireRol, UsuarioAutenticado, HEADER_CSRF, VALOR_CSRF } from '../middleware/auth';
import { crearAuthRouter } from './auth.routes';
import { crearMiddlewareSesion } from '../middleware/session';
import { errorHandler } from '../middleware/errorHandler';
import { verificarOwnershipTurno } from '../services/turnos.service';
import { ApiError } from '../utils/apiError';
import { conectarDbTest, desconectarDbTest, limpiarDbTest } from '../test/dbTestSetup';

const PASSWORD = 'Password123!';
const SESSION_SECRET = 'test-secret-no-usar-en-produccion';

let mongoUrl: string;
let app: Express;

beforeAll(async () => {
  mongoUrl = await conectarDbTest();
  app = createApp({ mongoUrl, sessionSecret: SESSION_SECRET, panelOrigin: 'http://localhost:5173' });
}, 300_000);

afterEach(async () => {
  await limpiarDbTest();
});

afterAll(async () => {
  await desconectarDbTest();
});

async function crearUsuario(overrides: Partial<{
  email: string;
  rol: 'admin' | 'profesional';
  activo: boolean;
  nombre: string;
}> = {}) {
  const passwordHash = await hashPassword(PASSWORD);
  return Usuario.create({
    nombre: overrides.nombre ?? 'Usuaria Test',
    email: overrides.email ?? 'test@test.com',
    passwordHash,
    rol: overrides.rol ?? 'profesional',
    atiende: true,
    servicios: [],
    horarios: [],
    activo: overrides.activo ?? true,
  });
}

describe('POST /api/auth/login', () => {
  it('credenciales correctas: setea cookie httpOnly y la sesión persiste entre requests', async () => {
    await crearUsuario({ email: 'ok@test.com' });
    const agent = request.agent(app);

    const resLogin = await agent.post('/api/auth/login').send({ email: 'ok@test.com', password: PASSWORD });

    expect(resLogin.status).toBe(200);
    expect(resLogin.body).toMatchObject({ nombre: 'Usuaria Test', rol: 'profesional', atiende: true });
    expect(resLogin.body).not.toHaveProperty('passwordHash');

    const setCookie = resLogin.headers['set-cookie'];
    expect(setCookie?.[0]).toMatch(/^sid=/);
    expect(setCookie?.[0]).toMatch(/HttpOnly/i);

    const resMe = await agent.get('/api/auth/me');
    expect(resMe.status).toBe(200);
    expect(resMe.body.rol).toBe('profesional');
  });

  it('cookie con SameSite=None y Secure (§16, revisión "Dominios separados" — front y API en dominios distintos)', async () => {
    await crearUsuario({ email: 'cookie-atributos@test.com' });

    // cookie.secure:'auto' (session.ts) resuelve por request vía
    // issecure()/trust proxy — en test, sobre http plano sin este header, la
    // cookie sale IGUAL pero sin Secure (necesario para no romper el resto de
    // la suite, que corre sobre http). X-Forwarded-Proto:https simula estar
    // detrás del proxy TLS de Render (trust proxy ya seteado en app.ts) y
    // reproduce el Set-Cookie real de producción.
    const resLogin = await request(app)
      .post('/api/auth/login')
      .set('X-Forwarded-Proto', 'https')
      .send({ email: 'cookie-atributos@test.com', password: PASSWORD });

    expect(resLogin.status).toBe(200);
    const setCookie = resLogin.headers['set-cookie'];
    expect(setCookie?.[0]).toMatch(/SameSite=None/i);
    expect(setCookie?.[0]).toMatch(/Secure/i);
  });

  it('password incorrecta ⇒ 401 genérico (mismo código que usuario inexistente)', async () => {
    await crearUsuario({ email: 'malapass@test.com' });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'malapass@test.com', password: 'noesesta' });

    expect(res.status).toBe(401);
    expect(res.body.codigo).toBe('CREDENCIALES_INVALIDAS');
  });

  it('usuario con activo:false ⇒ 401', async () => {
    await crearUsuario({ email: 'inactiva@test.com', activo: false });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'inactiva@test.com', password: PASSWORD });

    expect(res.status).toBe(401);
    expect(res.body.codigo).toBe('CREDENCIALES_INVALIDAS');
  });

  it('rate limit: corta después del límite de intentos por IP', async () => {
    // Bajo NODE_ENV=test el default de createApp() es alto/casi-infinito
    // (§15.5, deuda de test cerrada) — este es el único test que quiere el
    // límite real, así que lo pasa explícito. App aparte igual, para no
    // pisarle el cupo estricto a los demás tests de este archivo (que sí
    // corren con el default alto, sobre `app`).
    const appConLimiteReal = createApp({
      mongoUrl,
      sessionSecret: SESSION_SECRET,
      panelOrigin: 'http://localhost:5173',
      loginRateLimit: { windowMs: 15 * 60 * 1000, limit: 10 },
    });

    let ultimaRespuesta;
    for (let i = 0; i < 11; i++) {
      ultimaRespuesta = await request(appConLimiteReal)
        .post('/api/auth/login')
        .send({ email: 'no-existe@test.com', password: 'x' });
    }

    expect(ultimaRespuesta!.status).toBe(429);
    expect(ultimaRespuesta!.body.codigo).toBe('DEMASIADOS_INTENTOS');
  });

  it('con el default de test (alto), muchos intentos en el mismo archivo NO interfieren entre sí', async () => {
    // Confirma la deuda cerrada (§15.5): sobre la `app` COMPARTIDA de este
    // archivo (la de beforeAll, ya usada por varios tests de login antes que
    // este) más de 10 intentos seguidos siguen sin dar 429 — ya no hace
    // falta una app nueva por login para evitar el límite real de
    // producción (10/15min) en tests que no tienen nada que ver con rate
    // limiting.
    let ultimaRespuesta;
    for (let i = 0; i < 15; i++) {
      ultimaRespuesta = await request(app)
        .post('/api/auth/login')
        .send({ email: 'no-existe-tampoco@test.com', password: 'x' });
    }

    expect(ultimaRespuesta!.status).toBe(401);
    expect(ultimaRespuesta!.body.codigo).toBe('CREDENCIALES_INVALIDAS');
  });
});

describe('POST /api/auth/logout', () => {
  it('destruye la sesión: un request posterior con la misma cookie da 401', async () => {
    await crearUsuario({ email: 'logout@test.com' });
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email: 'logout@test.com', password: PASSWORD });

    // Mutante autenticado ⇒ requiere el header CSRF (§16, revisión
    // "Dominios separados") — ver describe 'CSRF' más abajo para el 403 sin
    // header.
    const resLogout = await agent.post('/api/auth/logout').set(HEADER_CSRF, VALOR_CSRF);
    expect(resLogout.status).toBe(204);

    const resMe = await agent.get('/api/auth/me');
    expect(resMe.status).toBe(401);
  });
});

describe('CSRF: header custom en requests mutantes autenticados (§16, revisión "Dominios separados")', () => {
  it('sin el header ⇒ 403 CSRF_HEADER_FALTANTE, la sesión sigue viva', async () => {
    await crearUsuario({ email: 'csrf-falta@test.com' });
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email: 'csrf-falta@test.com', password: PASSWORD });

    const resSinHeader = await agent.post('/api/auth/logout'); // sin .set(HEADER_CSRF, ...)
    expect(resSinHeader.status).toBe(403);
    expect(resSinHeader.body.codigo).toBe('CSRF_HEADER_FALTANTE');

    // El rechazo no destruyó la sesión (pasa por requireAuth antes de tocar
    // req.session.destroy) — la cookie sigue autenticando.
    const resMe = await agent.get('/api/auth/me');
    expect(resMe.status).toBe(200);
  });

  it('con el header ⇒ pasa normal', async () => {
    await crearUsuario({ email: 'csrf-ok@test.com' });
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email: 'csrf-ok@test.com', password: PASSWORD });

    const resConHeader = await agent.post('/api/auth/logout').set(HEADER_CSRF, VALOR_CSRF);
    expect(resConHeader.status).toBe(204);
  });

  it('no aplica a GET autenticado (método seguro)', async () => {
    await crearUsuario({ email: 'csrf-get@test.com' });
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email: 'csrf-get@test.com', password: PASSWORD });

    const resMe = await agent.get('/api/auth/me'); // sin header, GET no lo necesita
    expect(resMe.status).toBe(200);
  });

  it('no aplica a rutas públicas sin requireAuth (login sigue sin header)', async () => {
    await crearUsuario({ email: 'csrf-publica@test.com' });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'csrf-publica@test.com', password: PASSWORD }); // sin agente, sin header

    expect(res.status).toBe(200);
  });
});

describe('GET /api/auth/me', () => {
  it('sin cookie ⇒ 401', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.codigo).toBe('NO_AUTENTICADO');
  });
});

describe('requireRol', () => {
  it('bloquea con 403 a un profesional en una ruta admin-only; deja pasar a un admin', async () => {
    // Ruta de prueba mínima montada aparte, con los middlewares reales
    // (requireAuth/requireRol/session/errorHandler) — no se toca app.ts ni se
    // agrega un endpoint de panel real todavía.
    const appDePrueba = express();
    appDePrueba.use(express.json());
    appDePrueba.use(crearMiddlewareSesion({ mongoUrl, secret: SESSION_SECRET }));
    appDePrueba.use('/api/auth', crearAuthRouter());
    appDePrueba.get('/api/_test/solo-admin', requireAuth, requireRol('admin'), (_req, res) => {
      res.json({ ok: true });
    });
    appDePrueba.use(errorHandler);

    await crearUsuario({ email: 'prof@test.com', rol: 'profesional' });
    await crearUsuario({ email: 'admin@test.com', rol: 'admin' });

    const agenteProfesional = request.agent(appDePrueba);
    await agenteProfesional.post('/api/auth/login').send({ email: 'prof@test.com', password: PASSWORD });
    const resProfesional = await agenteProfesional.get('/api/_test/solo-admin');
    expect(resProfesional.status).toBe(403);
    expect(resProfesional.body.codigo).toBe('SIN_PERMISO');

    const agenteAdmin = request.agent(appDePrueba);
    await agenteAdmin.post('/api/auth/login').send({ email: 'admin@test.com', password: PASSWORD });
    const resAdmin = await agenteAdmin.get('/api/_test/solo-admin');
    expect(resAdmin.status).toBe(200);
  });
});

describe('verificarOwnershipTurno (capa de servicio, no middleware)', () => {
  it('un profesional no puede actuar sobre un turno de otra profesional; el admin sí', () => {
    const profesionalA: UsuarioAutenticado = {
      id: new Types.ObjectId().toString(),
      nombre: 'Profesional A',
      rol: 'profesional',
      atiende: true,
    };
    const admin: UsuarioAutenticado = {
      id: new Types.ObjectId().toString(),
      nombre: 'Admin',
      rol: 'admin',
      atiende: false,
    };
    const turnoDeOtraProfesional = { profesionalId: new Types.ObjectId() };

    expect(() => verificarOwnershipTurno(profesionalA, turnoDeOtraProfesional)).toThrow(ApiError);
    expect(() => verificarOwnershipTurno(admin, turnoDeOtraProfesional)).not.toThrow();

    const turnoPropio = { profesionalId: new Types.ObjectId(profesionalA.id) };
    expect(() => verificarOwnershipTurno(profesionalA, turnoPropio)).not.toThrow();
  });
});
