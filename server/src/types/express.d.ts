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
    }
  }
}

export {};
