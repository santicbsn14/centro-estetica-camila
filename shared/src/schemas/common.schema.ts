import { z } from 'zod';
import { Intervalo, solapan } from '../utils/intervalos';

// Sub-esquema de horarios, compartido entre configuracion, usuarios y servicios
// (ver modelo-datos-turnos.md §4 y §10). Sin cruce de medianoche: limitación
// conocida y aceptada.

export const diaSemanaSchema = z.number().int().min(0).max(6);

const HHMM_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

// Sólo formato acá — el "hasta > desde" y el no-solape se validan juntos en
// horariosSchema, con mensajes coordinados (partirlo en dos capas duplicaba
// el error del mismo bloque con distinta redacción).
export const bloqueHorarioSchema = z.object({
  desde: z.string().regex(HHMM_REGEX, 'formato esperado HH:mm'),
  hasta: z.string().regex(HHMM_REGEX, 'formato esperado HH:mm'),
});

export const horarioDiaSchema = z.object({
  dia: diaSemanaSchema,
  bloques: z.array(bloqueHorarioSchema),
});

export type BloqueHorario = z.infer<typeof bloqueHorarioSchema>;
export type HorarioDia = z.infer<typeof horarioDiaSchema>;

function minutosDesdeMedianoche(hhmm: string): number {
  const [horas, minutos] = hhmm.split(':').map(Number);
  return horas * 60 + minutos;
}

/**
 * Factory de Zod para el sub-esquema horarios (modelo-datos-turnos.md §10,
 * "Validación de horarios"). Un solo lugar, parametrizado por `nullable`:
 * - servicios ⇒ { nullable: true }  (null = hereda de la profesional)
 * - usuarios, configuracion ⇒ { nullable: false } (siempre tienen horario)
 *
 * Reglas (superRefine): null sólo si nullable; array top [] siempre inválido
 * (aunque nullable — [] no es lo mismo que "no aplica"); día con bloques:[]
 * inválido; día duplicado inválido; hasta > desde por bloque; bloques del
 * mismo día no se solapan (vía la primitiva `solapan`, no reimplementada).
 *
 * transform (después del superRefine): ordena días por `dia` asc y bloques
 * por `desde` asc — el invariante "va ordenado" lo garantiza la escritura,
 * no se exige al input. Idempotente: correr el schema sobre su propio output
 * no cambia nada.
 */
// No depende de `nullable` — sólo el "¿se permite null?" varía; se construye
// una sola vez y horariosSchema elige envolverla o no.
const horariosArraySchema = z
  .array(horarioDiaSchema)
  .superRefine((dias, ctx) => {
    if (dias.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'horarios no puede ser un array vacío — usar null para "no aplica" donde esté permitido',
      });
      return;
    }

    const diasVistos = new Set<number>();

    dias.forEach((diaEntry, indexDia) => {
      if (diasVistos.has(diaEntry.dia)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `el día ${diaEntry.dia} está duplicado`,
          path: [indexDia, 'dia'],
        });
      }
      diasVistos.add(diaEntry.dia);

      if (diaEntry.bloques.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `el día ${diaEntry.dia} no puede tener bloques vacíos — si no trabaja ese día, no incluirlo`,
          path: [indexDia, 'bloques'],
        });
        return;
      }

      const bloquesConIntervalo = diaEntry.bloques.map((bloque, indexBloque) => ({
        bloque,
        indexBloque,
        intervalo: {
          inicio: minutosDesdeMedianoche(bloque.desde),
          fin: minutosDesdeMedianoche(bloque.hasta),
        } satisfies Intervalo,
      }));

      bloquesConIntervalo.forEach(({ bloque, indexBloque, intervalo }) => {
        if (intervalo.fin <= intervalo.inicio) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `el bloque ${bloque.desde}-${bloque.hasta} del día ${diaEntry.dia}: hasta debe ser mayor que desde`,
            path: [indexDia, 'bloques', indexBloque, 'hasta'],
          });
        }
      });

      // Solape dentro del día: ordenados por desde, alcanza comparar cada
      // bloque con el siguiente (si no solapa al inmediato, no solapa a
      // ninguno más lejano). Par-a-par con `solapan`, no `pisaAlguno` (esa es
      // candidato-contra-set; acá son pares ya ordenados).
      const ordenadosPorInicio = [...bloquesConIntervalo].sort((a, b) => a.intervalo.inicio - b.intervalo.inicio);
      for (let i = 0; i < ordenadosPorInicio.length - 1; i++) {
        const actual = ordenadosPorInicio[i];
        const siguiente = ordenadosPorInicio[i + 1];
        if (solapan(actual.intervalo, siguiente.intervalo)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `los bloques ${actual.bloque.desde}-${actual.bloque.hasta} y ${siguiente.bloque.desde}-${siguiente.bloque.hasta} del día ${diaEntry.dia} se solapan`,
            path: [indexDia, 'bloques', siguiente.indexBloque],
          });
        }
      }
    });
  })
  .transform((dias) =>
    [...dias]
      .sort((a, b) => a.dia - b.dia)
      .map((diaEntry) => ({
        dia: diaEntry.dia,
        bloques: [...diaEntry.bloques].sort((a, b) => minutosDesdeMedianoche(a.desde) - minutosDesdeMedianoche(b.desde)),
      }))
  );

export function horariosSchema(opts: { nullable: true }): z.ZodUnion<[z.ZodNull, typeof horariosArraySchema]>;
export function horariosSchema(opts: { nullable: false }): typeof horariosArraySchema;
export function horariosSchema({ nullable }: { nullable: boolean }) {
  return nullable ? z.union([z.null(), horariosArraySchema]) : horariosArraySchema;
}

export const horariosServicioSchema = horariosSchema({ nullable: true });
export const horariosUsuarioSchema = horariosSchema({ nullable: false });
export const horariosConfigSchema = horariosSchema({ nullable: false });

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
