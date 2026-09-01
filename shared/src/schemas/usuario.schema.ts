import { z } from 'zod';
import { horariosUsuarioSchema } from './common.schema';

// CRUD de usuarios + superficie "lo mío" (modelo-datos-turnos.md §15.9).
// Dos gates distintos consumen estos schemas: /api/admin/usuarios
// (requireRol admin) y /api/mi/* (requireAuth, recurso = sesión). Los campos
// que cada uno acepta son deliberadamente distintos — no hay un solo
// "editarSchema" compartido entre las dos superficies.

const rolSchema = z.enum(['admin', 'profesional']);

// Formato únicamente — NO valida existencia contra la base (sería round-trip
// por poco; un id de servicio inexistente es inocuo, simplemente no se ofrece).
const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'id inválido');

// Alta — única vía, no hay auto-registro. `activo` no se acepta: nace true.
export const crearUsuarioSchema = z.object({
  nombre: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  rol: rolSchema,
  atiende: z.boolean(),
  servicios: z.array(objectIdSchema),
  horarios: horariosUsuarioSchema, // nullable:false (§10)
  telefonoE164: z.string().min(6).optional(), // crudo; se normaliza server-side (§10)
});
export type CrearUsuarioInput = z.infer<typeof crearUsuarioSchema>;

// Editar (admin), parcial y .strict(): password NUNCA acá (canal aparte,
// reset-password); cualquier campo no declarado (incluido password) da 400.
export const editarUsuarioSchema = z
  .object({
    nombre: z.string().min(2).optional(),
    email: z.string().email().optional(),
    rol: rolSchema.optional(),
    atiende: z.boolean().optional(),
    servicios: z.array(objectIdSchema).optional(),
    horarios: horariosUsuarioSchema.optional(),
    telefonoE164: z.string().min(6).optional(),
    activo: z.boolean().optional(),
  })
  .strict();
export type EditarUsuarioInput = z.infer<typeof editarUsuarioSchema>;

// "Lo mío": sólo nombre. rol/atiende/servicios son política del centro, no
// preferencia personal — .strict() los rechaza si vienen.
export const miPerfilSchema = z.object({ nombre: z.string().min(2).optional() }).strict();
export type MiPerfilInput = z.infer<typeof miPerfilSchema>;

export const misHorariosSchema = z.object({ horarios: horariosUsuarioSchema }).strict();
export type MisHorariosInput = z.infer<typeof misHorariosSchema>;

// Password, canal aparte — nunca en los schemas de arriba.
export const cambiarPasswordSchema = z.object({
  actual: z.string().min(1),
  nueva: z.string().min(8),
});
export type CambiarPasswordInput = z.infer<typeof cambiarPasswordSchema>;

// Reset admin: no requiere la vieja.
export const resetPasswordSchema = z.object({
  nueva: z.string().min(8),
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
