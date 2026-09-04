import { NextFunction, Request, Response } from 'express';
import { Usuario, RolUsuario } from '../models';
import { ApiError } from '../utils/apiError';

// Autenticación del panel — sesiones server-side, sin JWT. La sesión sólo
// guarda usuarioId (ver middleware/session.ts); acá se resuelve a un usuario
// público en cada request.

export interface UsuarioAutenticado {
  id: string;
  nombre: string;
  rol: RolUsuario;
  atiende: boolean;
}

// CSRF liviano (§16, revisión "Dominios separados" — DECISIÓN CERRADA: header
// custom, no token dedicado). Con SameSite=None la protección CSRF que daba
// Lax gratis se pierde; se repone acá, adentro de requireAuth, así que
// aplica a TODO endpoint autenticado sin repetirse por ruta ni por router —
// mismo criterio de "se monta una vez" que requireAuth/requireRol. No toca
// rutas públicas (no pasan por requireAuth, ej. POST /api/turnos).
//
// GET/HEAD/OPTIONS no lo necesitan (no mutan estado). El resto sí, aunque
// hoy el mapa de rutas sólo usa POST/PATCH/DELETE (§16). `detectarSesion`
// (más abajo) reusa estas mismas constantes para aplicar el mismo chequeo en
// POST /api/turnos cuando detecta una sesión — esa ruta sigue sin
// `requireAuth` (sigue pública), así que el check ahí es condicional, no
// incondicional como acá.
const METODOS_SEGUROS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Header que el front tiene que mandar en cada request mutante autenticado.
// Un CSRF clásico (form auto-submit, <img>, tag cross-site) no puede setear
// headers custom — sólo JS ejecutando same-origin puede. No es tan fuerte
// como un token criptográfico, pero cierra el vector real a esta escala
// (2-6 usuarios de confianza, panel administrativo).
export const HEADER_CSRF = 'x-requested-with';
export const VALOR_CSRF = 'XMLHttpRequest';

export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const usuarioId = req.session.usuarioId;
  if (!usuarioId) {
    next(new ApiError(401, 'NO_AUTENTICADO', 'Se requiere iniciar sesión'));
    return;
  }

  if (!METODOS_SEGUROS.has(req.method) && req.get(HEADER_CSRF) !== VALOR_CSRF) {
    next(
      new ApiError(
        403,
        'CSRF_HEADER_FALTANTE',
        `Falta el header ${HEADER_CSRF}: ${VALOR_CSRF} en requests mutantes autenticados`
      )
    );
    return;
  }

  const usuario = await Usuario.findById(usuarioId).lean();
  if (!usuario || !usuario.activo) {
    // Sesión de un usuario que ya no existe o fue desactivado: no queda viva.
    await new Promise<void>((resolve) => req.session.destroy(() => resolve()));
    next(new ApiError(401, 'NO_AUTENTICADO', 'Se requiere iniciar sesión'));
    return;
  }

  req.usuario = {
    id: usuario._id.toString(),
    nombre: usuario.nombre,
    rol: usuario.rol,
    atiende: usuario.atiende,
  };
  next();
}

// Detección de sesión SIN exigirla — a diferencia de requireAuth, que corta
// con 401 si no hay sesión. Usada por POST /api/turnos (§15.1, "Determinación
// de origen" — DECISIÓN CERRADA): el endpoint sigue siendo público (sin
// requireAuth), pero si HAY una sesión válida de admin/profesional, el
// turno nace como origen:'admin' en vez de 'web'. Adrede otro campo del
// request (`req.usuarioSiHaySesion`, no `req.usuario`) para no confundir los
// dos casos: un handler que lee `req.usuario` después de requireAuth puede
// asumir que existe; acá NO — sigue siendo opcional.
export async function detectarSesion(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const usuarioId = req.session.usuarioId;
  if (!usuarioId) {
    next();
    return;
  }

  const usuario = await Usuario.findById(usuarioId).lean();
  if (!usuario || !usuario.activo) {
    // Sesión de un usuario que ya no existe o fue desactivado: a diferencia
    // de requireAuth, acá no es un error — el request sigue como público
    // (sin sesión detectada), no corta con 401.
    next();
    return;
  }

  // Mismo CSRF liviano que requireAuth (§16): si hay sesión válida, este
  // request deja de ser "sólo público" — puede crear un turno confirmado
  // saltándose 'pendiente' (origen:'admin'). Sin este chequeo, un POST
  // cross-site con la cookie de un admin logueado podría crear turnos a su
  // nombre sin que lo pida. Sin sesión (el caso público de siempre) esto ni
  // se evalúa.
  if (!METODOS_SEGUROS.has(req.method) && req.get(HEADER_CSRF) !== VALOR_CSRF) {
    next(
      new ApiError(
        403,
        'CSRF_HEADER_FALTANTE',
        `Falta el header ${HEADER_CSRF}: ${VALOR_CSRF} en requests mutantes autenticados`
      )
    );
    return;
  }

  req.usuarioSiHaySesion = {
    id: usuario._id.toString(),
    nombre: usuario.nombre,
    rol: usuario.rol,
    atiende: usuario.atiende,
  };
  next();
}

// El ownership (profesional actuando sólo sobre sus propios turnos) NO va acá:
// vive en la capa de servicio de turnos (ver turnos.service.ts), porque
// depende del recurso puntual, no del rol.
export function requireRol(...roles: RolUsuario[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.usuario || !roles.includes(req.usuario.rol)) {
      next(new ApiError(403, 'SIN_PERMISO', 'No tenés permiso para esta acción'));
      return;
    }
    next();
  };
}
