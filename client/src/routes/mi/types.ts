import type { HorarioDia } from '@shared/schemas/common.schema';
import type { Rol } from '../../lib/auth';

// Espejo de UsuarioPanel (server/src/services/usuarios.service.ts,
// obtenerUsuarioPanel) — GET /api/mi/perfil devuelve el MISMO mapper que el
// CRUD admin (modelo-datos-turnos.md §15.9: "Lo mío" reusa el mapper, sólo
// cambia qué campos puede TOCAR cada superficie, no la forma de lo que
// devuelve). Se mirrorea acá en vez de importar el tipo de
// routes/profesionales/types.ts: ese endpoint es admin-only
// (/api/admin/usuarios) y una profesional no puede pegarle — cada carpeta de
// ruta mantiene su propio espejo del shape que SU endpoint devuelve, mismo
// criterio que routes/servicios/types.ts y routes/excepciones/types.ts.
// `Rol` se reusa de lib/auth (ya es el mismo par ['admin','profesional'] que
// usa la sesión) en vez de redefinir el enum a mano.
export interface MiPerfil {
  id: string;
  nombre: string;
  email: string;
  rol: Rol;
  atiende: boolean;
  servicios: string[]; // ids de servicios que presta — sin resolver a nombre acá (§4.9: sólo contexto)
  horarios: HorarioDia[]; // nullable:false (§10) — siempre array
  telefonoE164?: string;
  activo: boolean;
  creadoEn: string; // ISO UTC
  actualizadoEn: string; // ISO UTC
}
