import { z } from 'zod';

// Lo que NO está acá es lo importante: precio, duracionMin, fin, finBloqueo,
// y también `origen` — se deriva de la sesión en el server, nunca del body
// (§15.1, "Determinación de origen" — DECISIÓN CERRADA). Un `origen` en el
// JSON simplemente se ignora porque el campo no existe acá.
export const crearTurnoSchema = z.object({
  servicioId: z.string(),
  profesionalId: z.string(),
  inicio: z.string().datetime(), // ISO UTC
  nombre: z.string().min(2).max(80),
  telefono: z.string().min(6), // crudo, se normaliza en el server
  email: z.string().email().optional(),
  // Separado de `origen` a propósito (§15.1, "respetarGrilla" — DECISIÓN
  // CERRADA): `origen` dice QUIÉN crea el turno, esto dice si se valida el
  // horario. Opcional, default true cuando se omite (server, no acá con
  // `.default()`: así el tipo inferido `CrearTurnoInput` deja el campo
  // opcional para quien arma el body, en vez de forzar un `true` explícito
  // en cada request público que nunca lo necesita). Sólo `origen:'admin'`
  // puede pasar `false` para saltarse la grilla; `origen:'web'` (la
  // pública) nunca manda este campo, así que el default no le cambia nada.
  respetarGrilla: z.boolean().optional(),
});
export type CrearTurnoInput = z.infer<typeof crearTurnoSchema>;

// El tokenGestion es la única puerta pública con permiso de escritura,
// alcance a un solo turno y solo permite cancelar (ver §10).
export const cancelarTurnoSchema = z.object({
  token: z.string().min(1),
});
export type CancelarTurnoInput = z.infer<typeof cancelarTurnoSchema>;

// Cancelar desde el panel (admin/profesional autenticados, §15.4) — no
// confundir con cancelarTurnoSchema de arriba, que es la puerta pública por
// token. Acá no hay token: la sesión ya identifica a quién cancela.
export const cancelarTurnoPanelSchema = z.object({
  motivo: z.string().max(200).optional(),
});
export type CancelarTurnoPanelInput = z.infer<typeof cancelarTurnoPanelSchema>;
