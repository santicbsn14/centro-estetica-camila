import { http } from '../../lib/http';
import type { MiPerfilInput, MisHorariosInput, CambiarPasswordInput } from '@shared/schemas/usuario.schema';
import type { MiPerfil } from './types';

// Wrapper delgado sobre el cliente HTTP del panel (credentials + CSRF ya
// resueltos ahí, frontend.md §4.0) — sólo forma las rutas de §15.9 "lo mío".
// Recurso = sesión, SIN :id en ningún request (el server lo saca de
// req.usuario.id, nunca de la URL).

export function obtenerMiPerfil(): Promise<MiPerfil> {
  return http.get<MiPerfil>('/api/mi/perfil');
}

export function editarMiPerfil(input: MiPerfilInput): Promise<MiPerfil> {
  return http.patch<MiPerfil>('/api/mi/perfil', input);
}

export function editarMisHorarios(input: MisHorariosInput): Promise<MiPerfil> {
  return http.patch<MiPerfil>('/api/mi/horarios', input);
}

// POST /api/mi/password devuelve { ok: true } (mi.routes.ts) — el caller no
// necesita el body, sólo que no haya tirado.
export function cambiarMiPassword(input: CambiarPasswordInput): Promise<void> {
  return http.post<{ ok: true }>('/api/mi/password', input).then(() => undefined);
}
