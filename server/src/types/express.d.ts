import 'express-session';
import { UsuarioAutenticado } from '../middleware/auth';

declare module 'express-session' {
  interface SessionData {
    usuarioId?: string;
  }
}

declare global {
  namespace Express {
    interface Request {
      usuario?: UsuarioAutenticado;
      // Poblado por `detectarSesion` (POST /api/turnos, §15.1) — a diferencia
      // de `usuario` (poblado por requireAuth, que exige sesión), este puede
      // no existir sin que el request falle: la ruta sigue siendo pública.
      usuarioSiHaySesion?: UsuarioAutenticado;
    }
  }
}

export {};
