// Espejo de ExperienciaPanel (server/src/services/experiencias.service.ts,
// modelo-datos-turnos.md §15.7.2). Sólo se tipa, no se valida en runtime —
// mismo criterio que routes/servicios/types.ts.
export interface ExperienciaPanel {
  id: string;
  nombre: string;
  descripcion?: string;
  incluye: string[]; // texto libre, 2..8
  precio: number; // centavos
  mostrarPrecio: boolean;
  imagenUrl?: string;
  orden: number;
  activo: boolean;
  creadoEn: string; // ISO UTC
  actualizadoEn: string; // ISO UTC
}
