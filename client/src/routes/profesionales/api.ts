import { http } from '../../lib/http';
import type { CrearUsuarioInput, EditarUsuarioInput } from '@shared/schemas/usuario.schema';
import type { UsuarioPanel, UsuarioPanelConTurnosFuturos } from './types';

// Wrapper delgado sobre el cliente HTTP del panel (credentials + CSRF ya
// resueltos ahí, frontend.md §4.0) — sólo forma las rutas de §15.9. Sin
// GET /:id: mismo criterio que servicios, la edición arranca del registro
// que ya está en memoria desde el listado.

export function listarUsuarios(): Promise<UsuarioPanel[]> {
  return http.get<UsuarioPanel[]>('/api/admin/usuarios');
}

export function crearUsuario(input: CrearUsuarioInput): Promise<UsuarioPanel> {
  return http.post<UsuarioPanel>('/api/admin/usuarios', input);
}

// El PATCH devuelve `turnosFuturosActivos` SÓLO cuando la transición es
// activo:false (§15.9) — el tipo de retorno lo modela como opcional, no un
// UsuarioPanel aparte.
export function editarUsuario(id: string, input: EditarUsuarioInput): Promise<UsuarioPanelConTurnosFuturos> {
  return http.patch<UsuarioPanelConTurnosFuturos>(`/api/admin/usuarios/${id}`, input);
}

export function resetearPassword(id: string, nueva: string): Promise<UsuarioPanel> {
  return http.post<UsuarioPanel>(`/api/admin/usuarios/${id}/reset-password`, { nueva });
}
