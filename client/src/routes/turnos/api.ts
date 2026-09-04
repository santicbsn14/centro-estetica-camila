import type { CrearTurnoInput } from '@shared/schemas/turno.schema';
import { http } from '../../lib/http';
import type {
  CrearTurnoResultado,
  ProfesionalFiltro,
  ServicioOpcion,
  SlotDisponible,
  TurnoPanel,
  TurnoPanelLista,
} from './types';

// Wrapper delgado sobre el cliente HTTP del panel (credentials + CSRF ya
// resueltos ahí, frontend.md §4.0) — nada de lógica de negocio acá, sólo
// forma las rutas y query strings de §15.4/§15.5/§15.6.

export interface ListarTurnosParams {
  desde: string; // ISO UTC
  hasta: string; // ISO UTC
  profesionalId?: string; // sólo lo honra el admin (§15.6, filtro forzado del server para profesional)
}

export function listarTurnos(params: ListarTurnosParams): Promise<TurnoPanelLista[]> {
  const query = new URLSearchParams({ desde: params.desde, hasta: params.hasta });
  if (params.profesionalId) query.set('profesionalId', params.profesionalId);
  return http.get<TurnoPanelLista[]>(`/api/turnos?${query.toString()}`);
}

export function obtenerTurno(id: string): Promise<TurnoPanel> {
  return http.get<TurnoPanel>(`/api/turnos/${id}`);
}

export function aprobarTurno(id: string): Promise<TurnoPanel> {
  return http.post<TurnoPanel>(`/api/turnos/${id}/aprobar`);
}

// ⚠ ver frontend.md §5 (bitácora de esta tarea) — la ruta server de rechazar
// NO parsea body/motivo (server/src/routes/turnos.routes.ts), a diferencia de
// cancelar. Mandarlo igual acá no rompe nada (el server simplemente lo
// ignora), pero el motivo NUNCA llega al historial — por eso el front no
// ofrece el campo motivo en el flujo de rechazar (ver DetalleTurno.tsx).
export function rechazarTurno(id: string): Promise<TurnoPanel> {
  return http.post<TurnoPanel>(`/api/turnos/${id}/rechazar`);
}

export function marcarAusente(id: string): Promise<TurnoPanel> {
  return http.post<TurnoPanel>(`/api/turnos/${id}/ausente`);
}

export function cancelarTurno(id: string, motivo?: string): Promise<TurnoPanel> {
  return http.post<TurnoPanel>(`/api/turnos/${id}/cancelar`, { motivo: motivo || undefined });
}

// Recorte de UsuarioPanel (server/src/services/usuarios.service.ts) para el
// filtro de profesional del admin (frontend.md §4.4). /api/admin/usuarios es
// admin-only (§15.7 namespace) — sólo se llama cuando usuario.rol==='admin'.
interface UsuarioPanelCompleto {
  id: string;
  nombre: string;
  rol: 'admin' | 'profesional';
  activo: boolean;
}

export async function listarProfesionales(): Promise<ProfesionalFiltro[]> {
  const usuarios = await http.get<UsuarioPanelCompleto[]>('/api/admin/usuarios');
  return usuarios
    .filter((u) => u.rol === 'profesional')
    .map((u) => ({ id: u.id, nombre: u.nombre, activo: u.activo }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

// --- Alta manual — "Nuevo turno" (frontend.md §4.4) ---

// GET público (§15.1), no admin-only: lo necesitan AMBOS roles del form (una
// profesional no puede pegarle a /api/admin/servicios, §15.7 es admin-only).
// Activos y ordenados, mismo shape que consume client-publico.
export function listarServiciosActivos(signal?: AbortSignal): Promise<ServicioOpcion[]> {
  return http.get<ServicioOpcion[]>('/api/servicios', { signal });
}

export interface ParamsDisponibilidad {
  servicioId: string;
  profesionalId: string;
  desde: string; // ISO UTC
  hasta: string; // ISO UTC
}

// GET público (§15.2) — mismo endpoint que la grilla de la reserva pública.
export function listarDisponibilidad(
  params: ParamsDisponibilidad,
  signal?: AbortSignal
): Promise<{ slots: SlotDisponible[] }> {
  const query = new URLSearchParams({
    servicioId: params.servicioId,
    profesionalId: params.profesionalId,
    desde: params.desde,
    hasta: params.hasta,
  }).toString();
  return http.get<{ slots: SlotDisponible[] }>(`/api/disponibilidad?${query}`, { signal });
}

// MISMO POST /api/turnos público (§15.1) — el server deriva origen:'admin' de
// la sesión (cookie, ya viaja por credentials:'include' del cliente HTTP del
// panel), nada especial acá. `respetarGrilla:false` sólo lo honra si detectó
// sesión admin/profesional; en request público (sin sesión) el campo se
// ignora — no aplica a este wrapper, que siempre corre autenticado.
export function crearTurnoManual(input: CrearTurnoInput): Promise<CrearTurnoResultado> {
  return http.post<CrearTurnoResultado>('/api/turnos', input);
}
