import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import type { Rol } from '../../lib/auth';

// Guard de rol (frontend.md §4.0 / §4.4): secciones admin-only. Sólo se monta
// DENTRO de <RequireSesion/>, así que acá `usuario` ya está garantizado no-null
// en el camino feliz — el chequeo extra es sólo defensivo (orden de rutas).
// "profesional NO accede a /servicios /profesionales /configuracion
// /excepciones (redirect a /turnos)" — nunca un 403 visual, sólo se lo saca
// de la pantalla.
export function RequireRol({ roles }: { roles: Rol[] }) {
  const { usuario } = useAuth();

  if (!usuario || !roles.includes(usuario.rol)) {
    return <Navigate to="/turnos" replace />;
  }

  return <Outlet />;
}
