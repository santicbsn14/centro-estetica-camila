import { z } from 'zod';

// CRUD administrativo de categorías de servicio (modelo-datos-turnos.md §4
// `categorias`, §15.7.1). El nombre se guarda como lo escribe Camila — el
// catálogo público lo pasa a mayúsculas por CSS, no acá.
export const crearCategoriaSchema = z.object({
  nombre: z.string().trim().min(2).max(40),
  orden: z.number().int(),
});
export type CrearCategoriaInput = z.infer<typeof crearCategoriaSchema>;

// PATCH parcial, .strict(): cualquier campo no declarado da 400 BODY_INVALIDO.
export const editarCategoriaSchema = crearCategoriaSchema.partial().strict();
export type EditarCategoriaInput = z.infer<typeof editarCategoriaSchema>;
