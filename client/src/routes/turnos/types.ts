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

// --- Alta manual — "Nuevo turno" (frontend.md §4.4, agregado 2026-09-04) ---
// Espejo de los reads públicos que también consume client-publico/src/routes/
// reserva/types.ts (servicios/disponibilidad, §15.1/15.2/15.3 backend). No se
// comparte 1:1 entre las dos apps (dos proyectos Vite separados, sin alias
// cruzado) — se replica la forma acá, mismo criterio que el resto de este
// archivo (sin schema Zod de RESPUESTA del lado server).

// Recorte de ServicioPublico (GET /api/servicios) — sólo lo que necesita el
// selector del form. `_id` (no `id`) porque así lo devuelve esa ruta pública,
// sin el mapeo a `id` que sí hacen las rutas de panel (§15.6/15.7/15.9).
export interface ServicioOpcion {
  _id: string;
  nombre: string;
  duracionMin: number;
  precio?: number; // ausente si !mostrarPrecio (igual que la reserva pública)
}

// GET /api/disponibilidad → {slots: SlotDisponible[]}.
export interface SlotDisponible {
  inicio: string; // ISO UTC
  fin: string; // ISO UTC
}

// Respuesta de POST /api/turnos (201) — server/src/services/turnos.service.ts
// CrearTurnoResultado. Sin `id`: el alta manual no navega al detalle, sólo
// muestra el toast y vuelve al listado (frontend.md §4.4).
export interface CrearTurnoResultado {
  codigo: string;
  estado: 'pendiente' | 'confirmado';
  inicio: string;
  fin: string;
  servicio: {
    nombre: string;
    duracionMin: number;
    precio: number;
  };
  fueraDeHorario: boolean;
}

// Resultado de crearTurnoManual (TurnosPage → NuevoTurnoDrawer), mismo
// criterio que ResultadoGuardar en servicios/profesionales: el padre hace el
// request y decide qué le devuelve al drawer. `slotsOcupado` presente ⇒ 409
// SLOT_OCUPADO — el drawer refresca su propia grilla con esos slots (mismo
// criterio que client-publico §4.11, "manejarSlotOcupado"). Ausente ⇒ error
// genérico, ya mostrado por el padre vía toast (igual que ServiciosPage).
export type ResultadoCrearTurno = { ok: true } | { ok: false; slotsOcupado?: SlotDisponible[] };
