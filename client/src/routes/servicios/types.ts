import type { HorarioDia } from '@shared/schemas/common.schema';

// Espejo de ServicioPanel (server/src/services/servicios.service.ts,
// modelo-datos-turnos.md §15.7 — "shape del CRUD, no redefinir"). No hay
// schema Zod del lado server para la RESPUESTA de GET/POST/PATCH (sólo los
// inputs tienen schema en @shared/schemas/servicio.schema.ts), así que acá
// sólo se tipa, no se valida en runtime — mismo criterio que
// routes/turnos/types.ts (TurnoPanel).
export interface ServicioPanel {
  id: string;
  nombre: string;
  descripcion?: string;
  duracionMin: number;
  bufferPostMin: number;
  precio: number; // centavos (§2/CLAUDE.md)
  mostrarPrecio: boolean;
  horarios: HorarioDia[] | null; // null = hereda de la profesional (§4.5/§10)
  orden: number;
  imagenUrl?: string;
  categoriaId: string | null; // null = sin categoría ("Otros" en la web, §15.7.1)
  activo: boolean;
  creadoEn: string; // ISO UTC
  actualizadoEn: string; // ISO UTC
}

// Espejo de CategoriaPanel (server/src/services/categorias.service.ts,
// modelo-datos-turnos.md §15.7.1). Mismo criterio que ServicioPanel: sólo se
// tipa, no se valida en runtime.
export interface CategoriaPanel {
  id: string;
  nombre: string;
  orden: number;
  serviciosActivos: number;
  creadoEn: string; // ISO UTC
  actualizadoEn: string; // ISO UTC
}
