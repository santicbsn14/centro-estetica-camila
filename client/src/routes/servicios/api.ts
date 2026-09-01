import { http } from '../../lib/http';
import type { CrearServicioInput, EditarServicioInput } from '@shared/schemas/servicio.schema';
import type { ServicioPanel } from './types';

// Wrapper delgado sobre el cliente HTTP del panel (credentials + CSRF ya
// resueltos ahí, frontend.md §4.0) — sólo forma las rutas de §15.7. Sin
// GET /:id: el listado ya trae el shape completo (ServicioPanel), la edición
// arranca del registro que ya está en memoria (mismo criterio que el mockup,
// que edita a partir de S.find(id) en vez de refetchear).

export function listarServicios(): Promise<ServicioPanel[]> {
  return http.get<ServicioPanel[]>('/api/admin/servicios');
}

export function crearServicio(input: CrearServicioInput): Promise<ServicioPanel> {
  return http.post<ServicioPanel>('/api/admin/servicios', input);
}

export function editarServicio(id: string, input: EditarServicioInput): Promise<ServicioPanel> {
  return http.patch<ServicioPanel>(`/api/admin/servicios/${id}`, input);
}
