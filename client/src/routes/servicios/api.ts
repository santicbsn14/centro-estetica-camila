import { http } from '../../lib/http';
import type { CrearServicioInput, EditarServicioInput } from '@shared/schemas/servicio.schema';
import type { CrearCategoriaInput, EditarCategoriaInput } from '@shared/schemas/categoria.schema';
import type { CategoriaPanel, ServicioPanel } from './types';

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

// Categorías (§15.7.1) — viven en la misma pantalla (drawer de gestión desde
// ServiciosPage, frontend.md §4.5), sin ruta ni nav propia.
export function listarCategorias(): Promise<CategoriaPanel[]> {
  return http.get<CategoriaPanel[]>('/api/admin/categorias');
}

export function crearCategoria(input: CrearCategoriaInput): Promise<CategoriaPanel> {
  return http.post<CategoriaPanel>('/api/admin/categorias', input);
}

export function editarCategoria(id: string, input: EditarCategoriaInput): Promise<CategoriaPanel> {
  return http.patch<CategoriaPanel>(`/api/admin/categorias/${id}`, input);
}

export function eliminarCategoria(id: string): Promise<void> {
  return http.delete<void>(`/api/admin/categorias/${id}`);
}
