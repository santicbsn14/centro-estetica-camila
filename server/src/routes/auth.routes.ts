import crypto from 'node:crypto';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { loginSchema } from '@shared/schemas/auth.schema';
import { Usuario } from '../models';
import { hashPassword, verifyPassword } from '../services/password';
import { requireAuth } from '../middleware/auth';
import { ApiError } from '../utils/apiError';

// Hash "señuelo": si el email no existe o el usuario está inactivo, igual se
// corre un argon2.verify contra este hash (nunca válido) en vez de saltear la
// verificación — evita que el tiempo de respuesta filtre si el email existe.
let hashSenueloPromise: Promise<string> | undefined;
function obtenerHashSenuelo(): Promise<string> {
  if (!hashSenueloPromise) {
    hashSenueloPromise = hashPassword(crypto.randomBytes(24).toString('hex'));
  }
  return hashSenueloPromise;
}

export interface AuthRouterOptions {
  // Inyectable (§15.5, deuda de test cerrada): createApp() pisa este default
  // con uno alto/casi-infinito bajo NODE_ENV=test, salvo que el caller pase
  // el propio (lo hace el único test que ejercita el 429 real). Sin
  // override, producción/dev usan el límite real de siempre.
  loginRateLimit?: { windowMs: number; limit: number };
}

const LOGIN_RATE_LIMIT_DEFAULT = { windowMs: 15 * 60 * 1000, limit: 10 };

// Factory en vez de Router singleton: cada llamada arma su propio rate
// limiter en memoria, con contador propio (relevante sobre todo para tests
// que crean varias apps en el mismo proceso).
export function crearAuthRouter(options: AuthRouterOptions = {}): Router {
  const authRouter = Router();
  const { windowMs, limit } = options.loginRateLimit ?? LOGIN_RATE_LIMIT_DEFAULT;

  const loginRateLimit = rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
      res
        .status(429)
        .json({ codigo: 'DEMASIADOS_INTENTOS', mensaje: 'Demasiados intentos, probá de nuevo en unos minutos' });
    },
  });

  authRouter.post('/login', loginRateLimit, async (req, res, next) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      next(new ApiError(400, 'BODY_INVALIDO', 'Datos de login inválidos', parsed.error.flatten()));
      return;
    }

    try {
      const { email, password } = parsed.data;
      const usuario = await Usuario.findOne({ email: email.toLowerCase() });

      const hashParaVerificar = usuario?.activo ? usuario.passwordHash : await obtenerHashSenuelo();
      const passwordOk = await verifyPassword(hashParaVerificar, password);

      if (!usuario || !usuario.activo || !passwordOk) {
        next(new ApiError(401, 'CREDENCIALES_INVALIDAS', 'Email o contraseña incorrectos'));
        return;
      }

      await new Promise<void>((resolve, reject) => {
        req.session.regenerate((err) => (err ? reject(err) : resolve()));
      });
      req.session.usuarioId = usuario._id.toString();

      res.json({
        id: usuario._id.toString(),
        nombre: usuario.nombre,
        rol: usuario.rol,
        atiende: usuario.atiende,
      });
    } catch (err) {
      next(err);
    }
  });

  authRouter.post('/logout', requireAuth, (req, res, next) => {
    req.session.destroy((err) => {
      if (err) {
        next(err);
        return;
      }
      res.clearCookie('sid');
      res.status(204).end();
    });
  });

  authRouter.get('/me', requireAuth, (req, res) => {
    res.json(req.usuario);
  });

  return authRouter;
}
