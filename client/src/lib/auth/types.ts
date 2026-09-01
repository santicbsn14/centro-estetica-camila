// Espejo de UsuarioAutenticado (server/src/middleware/auth.ts) y del shape
// que devuelven POST /api/auth/login y GET /api/auth/me. No viene de @shared
// porque ese paquete sólo tiene el schema de INPUT del login
// (shared/src/schemas/auth.schema.ts) — la respuesta de sesión no tiene
// schema propio del lado backend, es un tipo, no algo que se valide con Zod.
export type Rol = 'admin' | 'profesional';

export interface SesionUsuario {
  id: string;
  nombre: string;
  rol: Rol;
  atiende: boolean;
}
