import type { HorarioDia } from '@shared/schemas/common.schema';
import type { CrearUsuarioInput } from '@shared/schemas/usuario.schema';

// Espejo de UsuarioPanel (server/src/services/usuarios.service.ts,
// modelo-datos-turnos.md §15.9 — "shape del CRUD, no redefinir"). Sin schema
// Zod de RESPUESTA del lado server (sólo los inputs lo tienen) — mismo
// criterio que routes/turnos/types.ts y routes/servicios/types.ts. NUNCA
// `passwordHash`: no está declarado acá a propósito, el mapper del server ya
// lo excluye por allowlist.
export interface UsuarioPanel {
  id: string;
  nombre: string;
  email: string;
  rol: RolUsuario;
  atiende: boolean;
  servicios: string[]; // ObjectId de servicios, sin validar existencia (§15.9)
  horarios: HorarioDia[]; // nullable:false (§10) — a diferencia de servicios, siempre array
  telefonoE164?: string;
  activo: boolean;
  creadoEn: string; // ISO UTC
  actualizadoEn: string; // ISO UTC
}

// `rol` no se redefine acá: se deriva del propio input de @shared en vez de
// repetir el enum ['admin','profesional'] a mano (ese schema no exporta un
// `rolSchema` propio, sólo lo usa inline).
export type RolUsuario = CrearUsuarioInput['rol'];

// El PATCH de desactivar (§15.9) suma este campo sólo en esa transición — no
// es parte del shape base, así que se modela aparte en vez de hacerlo
// opcional-siempre en UsuarioPanel.
export interface UsuarioPanelConTurnosFuturos extends UsuarioPanel {
  turnosFuturosActivos?: number;
}
