import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { http, EVENTO_NO_AUTENTICADO } from '../http';
import type { SesionUsuario } from './types';

// Contexto de auth del panel (frontend.md §4.0). Se alimenta de
// GET /api/auth/me al montar la app — esa es la ÚNICA fuente de verdad de
// sesión en el front, no hay token que decodificar localmente.
interface AuthContextValue {
  usuario: SesionUsuario | null;
  loading: boolean;
  // Para después del login (tarea 2): setea la sesión sin volver a pegarle a
  // /me (POST /api/auth/login ya devuelve el mismo shape).
  establecerSesion: (usuario: SesionUsuario) => void;
  // Vuelve a consultar /api/auth/me (ej. después de un refresh manual).
  refrescar: () => Promise<void>;
  // Logout (frontend.md §4.0/tarea logout): POST /api/auth/logout, limpia el
  // usuario del contexto y redirige a /login. Si el request falla (red caída,
  // 5xx, o la sesión ya estaba muerta del lado del server) igual limpia el
  // estado local y redirige — nunca deja una sesión "colgada" en el front.
  cerrarSesion: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<SesionUsuario | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const cargarSesion = useCallback(async () => {
    try {
      const data = await http.get<SesionUsuario>('/api/auth/me');
      setUsuario(data);
    } catch {
      // 401 NO_AUTENTICADO es el camino esperado sin sesión — no es un error
      // a mostrar, sólo "no hay usuario". Cualquier otro fallo (red caída,
      // 5xx) también deja usuario:null: sin sesión confirmada, se trata igual
      // que sin sesión (fail-closed, nunca fail-open en un panel admin).
      setUsuario(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargarSesion();
  }, [cargarSesion]);

  const cerrarSesion = useCallback(async () => {
    try {
      await http.post('/api/auth/logout');
    } catch {
      // Si POST /api/auth/logout no volvió por cualquier motivo (5xx, sin
      // sesión ya, red caída), igual tratamos el logout como hecho del lado
      // del front — el 401 NO_AUTENTICADO en particular ya dispara el
      // interceptor global (abajo), esto sólo cubre el resto de los casos.
    } finally {
      setUsuario(null);
      navigate('/login', { replace: true });
    }
  }, [navigate]);

  // Interceptor 401 global (frontend.md §4.0): lib/http dispara este evento
  // cuando CUALQUIER request autenticado vuelve NO_AUTENTICADO. Un solo
  // listener acá, no repetido por pantalla.
  useEffect(() => {
    function onNoAutenticado() {
      setUsuario(null);
      setLoading(false);
      navigate('/login', { replace: true });
    }
    window.addEventListener(EVENTO_NO_AUTENTICADO, onNoAutenticado);
    return () => window.removeEventListener(EVENTO_NO_AUTENTICADO, onNoAutenticado);
  }, [navigate]);

  const value = useMemo<AuthContextValue>(
    () => ({
      usuario,
      loading,
      establecerSesion: setUsuario,
      refrescar: cargarSesion,
      cerrarSesion,
    }),
    [usuario, loading, cargarSesion, cerrarSesion]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth() usado fuera de <AuthProvider>');
  }
  return ctx;
}
