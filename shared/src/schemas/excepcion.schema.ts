import { z } from 'zod';

// CRUD administrativo de excepciones (modelo-datos-turnos.md §15.10). Cierra
// el CRUD del panel. Sin superficie "mía" — v1 las carga la dueña para todos.

// Formato únicamente — mismo criterio que en usuario.schema.ts: NO valida
// existencia contra la base (un profesionalId inexistente da una excepción
// que no aplica a nadie, inocuo).
const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'id inválido');

const tipoExcepcionSchema = z.enum(['feriado', 'vacaciones', 'bloqueo']);

// desde/hasta: ISO UTC armado por el panel (`.toUTC().toISO()`), NUNCA
// offset — z.string().datetime() rechaza formato con offset por diseño.
// Tercer punto del sistema con este contrato (turnos, listado de panel,
// excepciones).
export const crearExcepcionSchema = z
  .object({
    profesionalId: objectIdSchema.nullable().optional(), // null/ausente = todo el centro
    desde: z.string().datetime(),
    hasta: z.string().datetime(),
    tipo: tipoExcepcionSchema,
    motivo: z.string().optional(),
    // creadoPor NO va acá — lo pone el server desde req.usuario.id.
  })
  .refine((data) => new Date(data.hasta) > new Date(data.desde), {
    message: 'hasta debe ser posterior a desde',
    path: ['hasta'],
  });
export type CrearExcepcionInput = z.infer<typeof crearExcepcionSchema>;

// Parcial, .strict(): cualquier campo no declarado (p.ej. creadoPor) da 400.
// Si el body trae los dos extremos del rango, se revalida acá mismo. Si sólo
// trae uno, la revalidación final contra el extremo existente en la base
// corre en el service (acá no hay forma de saberlo sin el documento).
export const editarExcepcionSchema = z
  .object({
    profesionalId: objectIdSchema.nullable().optional(),
    desde: z.string().datetime().optional(),
    hasta: z.string().datetime().optional(),
    tipo: tipoExcepcionSchema.optional(),
    motivo: z.string().optional(),
  })
  .strict()
  .refine(
    (data) => data.desde === undefined || data.hasta === undefined || new Date(data.hasta) > new Date(data.desde),
    { message: 'hasta debe ser posterior a desde', path: ['hasta'] }
  );
export type EditarExcepcionInput = z.infer<typeof editarExcepcionSchema>;
