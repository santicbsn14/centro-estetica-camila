import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { consultarDisponibilidad } from '../services/consultarDisponibilidad';
import { ApiError } from '../utils/apiError';

// Read público — modelo-datos-turnos.md §15.2.

// Factory en vez de Router singleton — mismo motivo que auth.routes.ts: cada
// createApp() arma su propio rate limiter en memoria, con contador propio
// (relevante sobre todo para tests que crean varias apps en el mismo proceso).
export function crearDisponibilidadRouter(): Router {
  const disponibilidadRouter = Router();

  // Rate limit por IP (§13/§15.2): se pega en cada navegación de calendario
  // (cambiar de semana/mes, elegir otra profesional), así que tiene que ser
  // bastante más generoso que el de login — pensado para no cortar el uso
  // normal de la web, no para frenar navegación legítima.
  const disponibilidadRateLimit = rateLimit({
    windowMs: 60 * 1000,
    limit: 60,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
      res
        .status(429)
        .json({ codigo: 'DEMASIADAS_SOLICITUDES', mensaje: 'Demasiadas solicitudes, probá de nuevo en unos minutos' });
    },
  });

  disponibilidadRouter.get('/', disponibilidadRateLimit, async (req, res, next) => {
    const parsed = queryDisponibilidadSchema.safeParse(req.query);
    if (!parsed.success) {
      next(new ApiError(400, 'QUERY_INVALIDA', 'Parámetros inválidos', parsed.error.flatten()));
      return;
    }

    try {
      const { servicioId, profesionalId, desde, hasta } = parsed.data;
      const resultado = await consultarDisponibilidad({
        servicioId,
        profesionalId,
        desde: desde ? new Date(desde) : undefined,
        hasta: hasta ? new Date(hasta) : undefined,
      });
      res.json(resultado);
    } catch (err) {
      next(err);
    }
  });

  return disponibilidadRouter;
}

const queryDisponibilidadSchema = z.object({
  servicioId: z.string(),
  profesionalId: z.string(),
  desde: z.string().datetime().optional(),
  hasta: z.string().datetime().optional(),
});
