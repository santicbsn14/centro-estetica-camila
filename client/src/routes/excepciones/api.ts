import { http } from '../../lib/http';
import type { CrearExcepcionInput, EditarExcepcionInput } from '@shared/schemas/excepcion.schema';
import type { ExcepcionPanel } from './types';

// Wrapper delgado sobre el cliente HTTP del panel (credentials + CSRF ya
// resueltos ahí, frontend.md §4.0) — sólo forma las rutas y query strings de
// §15.10. Sin GET /:id: mismo criterio que servicios/usuarios, la edición
// arranca del registro que ya está en memoria desde el listado.

export interface ListarExcepcionesParams {
  desde?: string; // ISO UTC
  hasta?: string; // ISO UTC
  profesionalId?: string;
}

export function listarExcepciones(params: ListarExcepcionesParams = {}): Promise<ExcepcionPanel[]> {
  const query = new URLSearchParams();
  if (params.desde) query.set('desde', params.desde);
  if (params.hasta) query.set('hasta', params.hasta);
  if (params.profesionalId) query.set('profesionalId', params.profesionalId);
  const qs = query.toString();
  return http.get<ExcepcionPanel[]>(`/api/admin/excepciones${qs ? `?${qs}` : ''}`);
}

export function crearExcepcion(input: CrearExcepcionInput): Promise<ExcepcionPanel> {
  return http.post<ExcepcionPanel>('/api/admin/excepciones', input);
}

export function editarExcepcion(id: string, input: EditarExcepcionInput): Promise<ExcepcionPanel> {
  return http.patch<ExcepcionPanel>(`/api/admin/excepciones/${id}`, input);
}

// DELETE físico (§15.10, único recurso del sistema) — 204 sin body, el
// cliente HTTP ya lo mapea a `undefined` (ver lib/http/client.ts).
export function eliminarExcepcion(id: string): Promise<void> {
  return http.delete<void>(`/api/admin/excepciones/${id}`);
}
