import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../lib/auth';

// Guard de sesión (frontend.md §4.0): todo lo que NO sea /login vive detrás
// de esto. loading = todavía no volvió GET /api/auth/me (bootstrap); no hay
// usuario ⇒ nunca hubo sesión o el interceptor 401 ya la limpió ⇒ /login.
export function RequireSesion() {
  const { usuario, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    // Placeholder mínimo: la pantalla de carga con marca es tarea de pantallas,
    // no de fundaciones (frontend.md §4.0 no la especifica).
    return (
      <div role="status" aria-live="polite" style={{ padding: '2rem' }}>
        Cargando…
      </div>
    );
  }

  if (!usuario) {
    // Se lleva la ruta pedida en location.state.from — LoginPage (§4.3, tarea
    // 2) la usa para volver ahí después de un login exitoso, en vez de
    // mandar siempre a /turnos.
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}
