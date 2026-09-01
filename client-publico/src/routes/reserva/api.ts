import type { CrearTurnoInput } from '@shared/schemas/turno.schema';
import { http } from '../../lib/http';
import type { ServicioPublico, ProfesionalPublico, Slot, TurnoCreado } from './types';

// Wrapper delgado sobre lib/http — todos los reads son públicos, sin auth
// (modelo-datos-turnos.md §15.1/15.2/15.3).

export function listarServicios(signal?: AbortSignal): Promise<ServicioPublico[]> {
  return http.get<ServicioPublico[]>('/api/servicios', { signal });
}

export function listarProfesionales(servicioId: string, signal?: AbortSignal): Promise<ProfesionalPublico[]> {
  return http.get<ProfesionalPublico[]>(`/api/servicios/${servicioId}/profesionales`, { signal });
}

export interface ParamsDisponibilidad {
  servicioId: string;
  profesionalId: string;
  desde: string; // ISO UTC
  hasta: string; // ISO UTC
}

export function listarDisponibilidad(params: ParamsDisponibilidad, signal?: AbortSignal): Promise<{ slots: Slot[] }> {
  const query = new URLSearchParams({
    servicioId: params.servicioId,
    profesionalId: params.profesionalId,
    desde: params.desde,
    hasta: params.hasta,
  }).toString();
  return http.get<{ slots: Slot[] }>(`/api/disponibilidad?${query}`, { signal });
}

export function crearTurno(input: CrearTurnoInput): Promise<TurnoCreado> {
  return http.post<TurnoCreado>('/api/turnos', input);
}
