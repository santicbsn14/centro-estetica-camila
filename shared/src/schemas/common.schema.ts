import { z } from 'zod';

// Sub-esquema de horarios, compartido entre configuracion, usuarios y servicios
// (ver modelo-datos-turnos.md §4). Sin cruce de medianoche: limitación conocida y aceptada.

export const diaSemanaSchema = z.number().int().min(0).max(6);

export const bloqueHorarioSchema = z
  .object({
    desde: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'formato esperado HH:mm'),
    hasta: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'formato esperado HH:mm'),
  })
  .refine((b) => b.hasta > b.desde, { message: 'hasta debe ser mayor que desde' });

export const horarioDiaSchema = z.object({
  dia: diaSemanaSchema,
  bloques: z.array(bloqueHorarioSchema),
});

export type BloqueHorario = z.infer<typeof bloqueHorarioSchema>;
export type HorarioDia = z.infer<typeof horarioDiaSchema>;

export const estadoTurnoSchema = z.enum([
  'pendiente',
  'confirmado',
  'rechazado',
  'cancelado',
  'completado',
  'ausente',
]);
export type EstadoTurno = z.infer<typeof estadoTurnoSchema>;

export const tipoNotificacionSchema = z.enum([
  'solicitud',
  'confirmacion',
  'recordatorio_24h',
  'cancelacion',
  'rechazo',
  'autorespuesta',
]);
export type TipoNotificacion = z.infer<typeof tipoNotificacionSchema>;

export const canalNotificacionSchema = z.enum(['whatsapp', 'email']);
export type CanalNotificacion = z.infer<typeof canalNotificacionSchema>;

export const errorApiSchema = z.object({
  codigo: z.string(),
  mensaje: z.string(),
  detalle: z.unknown().optional(),
});
export type ErrorApi = z.infer<typeof errorApiSchema>;
