import { http } from '../../lib/http';
import type { CrearExperienciaInput, EditarExperienciaInput } from '@shared/schemas/experiencia.schema';
import type { ExperienciaPanel } from './types';

// Combos y experiencias (§15.7.2). Sin GET /:id: el listado ya trae el shape
// completo y la edición arranca del registro en memoria (igual que servicios).

export function listarExperiencias(): Promise<ExperienciaPanel[]> {
  return http.get<ExperienciaPanel[]>('/api/admin/experiencias');
}

export function crearExperiencia(input: CrearExperienciaInput): Promise<ExperienciaPanel> {
  return http.post<ExperienciaPanel>('/api/admin/experiencias', input);
}

export function editarExperiencia(id: string, input: EditarExperienciaInput): Promise<ExperienciaPanel> {
  return http.patch<ExperienciaPanel>(`/api/admin/experiencias/${id}`, input);
}
