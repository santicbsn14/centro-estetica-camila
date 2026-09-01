import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { crearTurnoSchema } from '@shared/schemas/turno.schema';
import { crearTurnosRouter } from './routes/turnos.routes';
import { crearDisponibilidadRouter } from './routes/disponibilidad.routes';
import { crearServiciosRouter } from './routes/servicios.routes';
import { crearAuthRouter } from './routes/auth.routes';
import { adminRouter } from './routes/admin';
import { miRouter } from './routes/mi.routes';
import { errorHandler } from './middleware/errorHandler';
import { crearMiddlewareSesion } from './middleware/session';

export interface CreateAppOptions {
  mongoUrl?: string;
  sessionSecret?: string | string[];
  panelOrigin?: string;
  loginRateLimit?: { windowMs: number; limit: number };
}

export function createApp(options: CreateAppOptions = {}): Express {
  const app = express();

  // Detrás de un proxy TLS (Render): necesario para que `cookie.secure`
  // reconozca la conexión como https vía X-Forwarded-Proto.
  app.set('trust proxy', 1);

  // /healthz: registrado ANTES de cors/helmet/sesión a propósito — es el
  // endpoint que un ping externo golpea cada 5-10min para mantener despierta
  // la instancia (§11), no debe depender de ningún middleware global ni
  // tocar la DB (el store de sesión sí la toca). Público, sin auth, no vive
  // bajo /api (no es un recurso de la API, es una sonda de infra).
  app.get('/healthz', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.use(cors({ origin: crearValidadorOrigen(resolverOrigenesPermitidos(options.panelOrigin)), credentials: true }));
  app.use(helmet());
  app.use(express.json());
  app.use(crearMiddlewareSesion({ mongoUrl: options.mongoUrl, secret: options.sessionSecret }));

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      sharedAliasCampos: Object.keys(crearTurnoSchema.shape).length,
    });
  });

  app.use('/api/auth', crearAuthRouter({ loginRateLimit: options.loginRateLimit ?? resolverLoginRateLimitDeTest() }));
  app.use('/api/turnos', crearTurnosRouter());
  app.use('/api/disponibilidad', crearDisponibilidadRouter());
  app.use('/api/servicios', crearServiciosRouter());
  app.use('/api/admin', adminRouter);
  app.use('/api/mi', miRouter);

  app.use(errorHandler); // último: traduce errores a { codigo, mensaje, detalle? }

  return app;
}

// Deuda de test cerrada (§15.5): el límite real de login (10/15min,
// auth.routes.ts) es demasiado bajo para archivos de test que comparten una
// sola `app` entre varios logins — antes cada uno de esos archivos esquivaba
// el problema creando una `app` nueva por login sólo para no agotar el cupo
// (turnos.panel.test.ts, admin/*.test.ts, mi.routes.test.ts). Bajo
// NODE_ENV=test (Vitest lo setea solo) el default pasa a ser alto/casi-
// infinito, salvo que quien llama a createApp() pase su propio
// `loginRateLimit` — lo hace el único test que quiere ejercitar el 429 real.
function resolverLoginRateLimitDeTest(): { windowMs: number; limit: number } | undefined {
  if (process.env.NODE_ENV !== 'test') {
    return undefined; // producción/dev: usa el default real de crearAuthRouter
  }
  return { windowMs: 15 * 60 * 1000, limit: 1_000_000 };
}

// Dominios del front, configurables por env (§16, revisión "Dominios
// separados"; ampliado a lista el 2026-08-25 al cerrar el ⚠ REVISAR EN WEB
// del scaffolding de client-publico — panel y web pública son dos orígenes
// distintos, uno solo ya no alcanza). Todavía no hay dominios pagos
// definitivos, así que el default sin CORS_ORIGINS ni PANEL_ORIGIN son los
// dos puertos de Vite en dev, no un valor hardcodeado que haya que volver a
// tocar acá cuando los dominios reales estén decididos. Nunca '*': es
// incompatible con credentials:true (cookie cross-site) y dejaría pasar
// cualquier origen.
const CORS_ORIGINS_DEV_DEFAULT = ['http://localhost:5173', 'http://localhost:5174'];

// `override` es `panelOrigin` (CreateAppOptions) — un único origen, como lo
// usan hoy todos los tests y smoke-manual.ts. Se admite igual que siempre,
// sólo que ahora también pasa por el split/trim (lista de un elemento).
function resolverOrigenesPermitidos(override: string | undefined): string[] {
  const lista = override ?? process.env.CORS_ORIGINS ?? process.env.PANEL_ORIGIN;
  if (!lista) {
    console.warn(
      `CORS_ORIGINS no está definida (ni PANEL_ORIGIN, compat) — CORS usa el default de dev (${CORS_ORIGINS_DEV_DEFAULT.join(', ')}).`,
    );
    return CORS_ORIGINS_DEV_DEFAULT;
  }
  return lista
    .split(',')
    .map((origen) => origen.trim())
    .filter(Boolean);
}

// cors admite `origin` como función para validar contra una lista en vez de
// un string fijo. Sin header Origin (curl, healthcheck, server-to-server) se
// deja pasar: no hay cookie cross-site en juego en esos casos.
function crearValidadorOrigen(origenesPermitidos: string[]) {
  return (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    callback(null, !origin || origenesPermitidos.includes(origin));
  };
}
