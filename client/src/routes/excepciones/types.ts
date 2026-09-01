import type { CrearExcepcionInput } from '@shared/schemas/excepcion.schema';

// Espejo de ExcepcionPanel (server/src/services/excepciones.service.ts,
// modelo-datos-turnos.md §15.10 — "shape del CRUD, no redefinir"). Sin schema
// Zod de RESPUESTA del lado server (sólo los inputs tienen schema en
// @shared/schemas/excepcion.schema.ts), así que acá sólo se tipa, no se
// valida en runtime — mismo criterio que routes/servicios/types.ts y
// routes/profesionales/types.ts.
export interface ExcepcionPanel {
  id: string;
  profesionalId: string | null; // null = todo el centro (§4)
  desde: string; // ISO UTC
  hasta: string; // ISO UTC
  tipo: TipoExcepcion;
  motivo?: string;
  creadoPor: string;
  creadoEn: string; // ISO UTC
}

// `tipo` no se redefine acá: se deriva del propio input de @shared en vez de
// repetir el enum ['feriado','vacaciones','bloqueo'] a mano (mismo criterio
// que RolUsuario en routes/profesionales/types.ts).
export type TipoExcepcion = CrearExcepcionInput['tipo'];

export const TIPOS_EXCEPCION: TipoExcepcion[] = ['feriado', 'vacaciones', 'bloqueo'];
