import { z } from 'zod';

// Combos y experiencias (modelo-datos-turnos.md §4 `experiencias`, §15.7.2).
// NO se agendan: el día y el pago se coordinan por WhatsApp. `incluye` es
// texto libre a propósito — no referencia servicios.

const incluyeSchema = z.array(z.string().trim().min(2).max(80)).min(2).max(8);

// `activo` NO se acepta al crear — nace true (default del modelo).
export const crearExperienciaSchema = z.object({
  nombre: z.string().trim().min(2).max(80),
  descripcion: z.string().max(500).optional(),
  incluye: incluyeSchema,
  precio: z.number().int().min(0), // centavos (§3). Lo fija Camila, NO es la suma
  mostrarPrecio: z.boolean(),
  imagenUrl: z.string().url().optional(), // mismo criterio que servicios (§15.7)
  orden: z.number().int(),
});
export type CrearExperienciaInput = z.infer<typeof crearExperienciaSchema>;

// PATCH parcial, .strict(): un campo no declarado da 400. Incluye `activo`
// (borrado lógico/reactivación). Si viene `incluye`, reemplaza el array entero.
export const editarExperienciaSchema = crearExperienciaSchema
  .extend({ activo: z.boolean() })
  .partial()
  .strict();
export type EditarExperienciaInput = z.infer<typeof editarExperienciaSchema>;
