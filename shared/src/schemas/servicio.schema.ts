import { z } from 'zod';
import { horariosServicioSchema } from './common.schema';

// CRUD administrativo de servicios (modelo-datos-turnos.md §15.7).
// `activo` NO se acepta al crear — nace true (default del modelo); no está
// declarado acá a propósito, así un body manipulado no puede pisarlo.
export const crearServicioSchema = z.object({
  nombre: z.string().min(2),
  descripcion: z.string().optional(),
  duracionMin: z.number().int().positive(),
  bufferPostMin: z.number().int().min(0),
  precio: z.number().int().min(0), // centavos, entero (§3)
  mostrarPrecio: z.boolean(),
  horarios: horariosServicioSchema, // nullable:true — null = hereda de la profesional (§10)
  orden: z.number().int(),
});
export type CrearServicioInput = z.infer<typeof crearServicioSchema>;

// PATCH parcial: todo opcional, incluido `activo` (borrado lógico/reactivación,
// §15.7). Si viene `horarios`, reemplaza el array entero — sin merge por día.
export const editarServicioSchema = z.object({
  nombre: z.string().min(2).optional(),
  descripcion: z.string().optional(),
  duracionMin: z.number().int().positive().optional(),
  bufferPostMin: z.number().int().min(0).optional(),
  precio: z.number().int().min(0).optional(),
  mostrarPrecio: z.boolean().optional(),
  horarios: horariosServicioSchema.optional(),
  orden: z.number().int().optional(),
  activo: z.boolean().optional(),
});
export type EditarServicioInput = z.infer<typeof editarServicioSchema>;
