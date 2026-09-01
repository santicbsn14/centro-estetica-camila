import { z } from 'zod';
import { horariosConfigSchema } from './common.schema';

// CRUD administrativo de configuración — singleton (modelo-datos-turnos.md
// §15.8). Sin crearConfiguracionSchema: no hay POST, nace del seed.
//
// `.strict()`: rechaza cualquier campo no declarado, `timezone` incluido.
// timezone es readonly — constante del sistema, no config de negocio (toda la
// semántica de 'HH:mm' local y el anclaje de grilla la asumen fija). Se
// rechaza explícito en vez de ignorarse en silencio: un admin que lo manda no
// debe creer que lo cambió.
export const editarConfiguracionSchema = z
  .object({
    nombre: z.string().min(2).optional(),
    horarios: horariosConfigSchema.optional(), // nullable:false — null también rechaza
    pasoGrillaMin: z.number().int().min(5).optional(), // sin forzar divisibilidad
    antelacionMinimaHoras: z.number().int().min(0).optional(),
    ventanaMaximaDias: z.number().int().min(1).optional(),
    cancelacionMinimaHoras: z.number().int().min(0).optional(),
    vencimientoPendienteHoras: z.number().int().min(1).optional(),
    // Si viene, se valida y reemplaza el sub-objeto entero (consistente con
    // horarios). telefonoE164 se normaliza server-side con la misma función
    // del §10 — acá sólo forma mínima, no la normalización en sí.
    contacto: z
      .object({
        telefonoE164: z.string().min(6),
        email: z.string().email(),
        direccion: z.string().min(1),
      })
      .optional(),
  })
  .strict();
export type EditarConfiguracionInput = z.infer<typeof editarConfiguracionSchema>;
