import { z } from 'zod';

// Lo que NO está acá es lo importante: precio, duracionMin, fin, finBloqueo.
// Nada calculable viaja desde el cliente — el server los deriva leyendo la base
// (ver modelo-datos-turnos.md §3 y §10).
export const crearTurnoSchema = z.object({
  servicioId: z.string(),
  profesionalId: z.string(),
  inicio: z.string().datetime(), // ISO UTC
  nombre: z.string().min(2).max(80),
  telefono: z.string().min(6), // crudo, se normaliza en el server
  email: z.string().email().optional(),
});
export type CrearTurnoInput = z.infer<typeof crearTurnoSchema>;

// El tokenGestion es la única puerta pública con permiso de escritura,
// alcance a un solo turno y solo permite cancelar (ver §10).
export const cancelarTurnoSchema = z.object({
  token: z.string().min(1),
});
export type CancelarTurnoInput = z.infer<typeof cancelarTurnoSchema>;
