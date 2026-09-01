import type { EstadoTurno } from '@shared/schemas/common.schema';

// Espejo de TurnoPanel / TurnoPanelLista (server/src/services/turnos.service.ts,
// modelo-datos-turnos.md §15.6 — "shape canónico, no redefinir"). No hay schema
// Zod del lado server para las RESPUESTAS de GET (sólo los inputs tienen
// schema en @shared/schemas/turno.schema.ts), así que acá sólo se tipa, no se
// valida en runtime — mismo criterio que lib/auth/types.ts (SesionUsuario).
//
// origen/porTipo tampoco viven en @shared (son tipos del modelo Mongoose,
// server/src/models/turno.model.ts) — se repiten acá como unions literales,
// a mano, para no importar del server. Mantener en sync si el modelo cambia.
export type OrigenTurno = 'web' | 'admin';
export type PorTipoHistorial = 'cliente' | 'usuario' | 'sistema';

export interface ClienteSnapshotLista {
  nombre: string;
  telefonoE164: string;
}

export interface ClienteSnapshotDetalle extends ClienteSnapshotLista {
  email?: string;
}

export interface ProfesionalRef {
  id: string;
  nombre: string;
}

export interface HistorialEntry {
  estado: EstadoTurno;
  fecha: string; // ISO UTC
  porTipo: PorTipoHistorial;
  porId?: string;
  motivo?: string;
}

// Fila de listado — GET /api/turnos. Sin historial, nested recortado
// (§15.6: "mismos nombres de key para mapeo uniforme del front").
export interface TurnoPanelLista {
  id: string;
  codigo: string;
  estado: EstadoTurno;
  inicio: string; // ISO UTC
  fin: string; // ISO UTC
  finBloqueo: string; // ISO UTC
  expiraEn: string | null; // sólo poblado en pendiente
  clienteSnapshot: ClienteSnapshotLista;
  profesional: ProfesionalRef;
  servicio: { nombre: string; duracionMin: number; precio: number };
  origen: OrigenTurno;
  fueraDeHorario: boolean;
}

// Detalle — GET /api/turnos/:id (y respuesta de las 4 transiciones). NUNCA
// tokenHash ni clientes.notas (§15.6) — ninguno de los dos existe en este tipo
// a propósito, no es un recorte de una interfaz más grande.
export interface TurnoPanel {
  id: string;
  codigo: string;
  estado: EstadoTurno;
  inicio: string;
  fin: string;
  finBloqueo: string;
  expiraEn: string | null;
  clienteSnapshot: ClienteSnapshotDetalle;
  profesional: ProfesionalRef;
  servicio: {
    servicioId: string;
    nombre: string;
    duracionMin: number;
    bufferPostMin: number;
    precio: number;
  };
  origen: OrigenTurno;
  fueraDeHorario: boolean;
  historial: HistorialEntry[];
}

// Profesional mínimo para el filtro admin (recortado de UsuarioPanel,
// server/src/services/usuarios.service.ts — GET /api/admin/usuarios).
export interface ProfesionalFiltro {
  id: string;
  nombre: string;
  activo: boolean;
}

export type FiltroEstado = EstadoTurno | 'todos';

export const ESTADOS_TURNO: EstadoTurno[] = [
  'pendiente',
  'confirmado',
  'rechazado',
  'cancelado',
  'completado',
  'ausente',
];
