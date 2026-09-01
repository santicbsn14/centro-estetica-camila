import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { crearTurnoSchema, cancelarTurnoPanelSchema } from '@shared/schemas/turno.schema';
import { estadoTurnoSchema } from '@shared/schemas/common.schema';
import { crearTurno, aprobarTurno, rechazarTurno, marcarAusente, cancelarTurno } from '../services/turnos.service';
import { listarTurnosPanel, obtenerTurnoPanel } from '../services/consultarTurnosPanel';
import { requireAuth } from '../middleware/auth';
import { ApiError } from '../utils/apiError';

// Superficie pública — siempre origen: 'web' (§15.1). La ruta de panel/admin
// (con auth, todavía no construida) va a llamar a services/turnos.service.ts
// pasando origen: 'admin'; no se agrega acá hasta que exista esa auth.

// Factory en vez de Router singleton — mismo motivo que auth.routes.ts: cada
// createApp() arma su propio rate limiter en memoria, con contador propio
// (relevante sobre todo para tests que crean varias apps en el mismo proceso).
export function crearTurnosRouter(): Router {
  const turnosRouter = Router();

  // Rate limit del POST público (§13/§15.1) — el único de los cuatro
  // endpoints públicos que escribe y el único concurrency-critical. Más
  // estricto que las lecturas: nadie reserva 20 turnos legítimos en 10
  // minutos, ni contando reintentos tras un 409 SLOT_OCUPADO o varias
  // reservas de una misma familia compartiendo wifi. No se aplica a las
  // transiciones de panel (aprobar/rechazar/ausente/cancelar) ni a los GET
  // de panel: van detrás de requireAuth, no son la superficie pública que
  // pide §13.
  const crearTurnoRateLimit = rateLimit({
    windowMs: 10 * 60 * 1000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
      res
        .status(429)
        .json({ codigo: 'DEMASIADAS_SOLICITUDES', mensaje: 'Demasiadas solicitudes, probá de nuevo en unos minutos' });
    },
  });

  turnosRouter.post('/', crearTurnoRateLimit, async (req, res, next) => {
    const parsed = crearTurnoSchema.safeParse(req.body);
    if (!parsed.success) {
      next(new ApiError(400, 'BODY_INVALIDO', 'Datos de turno inválidos', parsed.error.flatten()));
      return;
    }

    try {
      const resultado = await crearTurno({ ...parsed.data, origen: 'web' });
      res.status(201).json(resultado);
    } catch (err) {
      next(err);
    }
  });

  // Transiciones del panel — requireAuth solamente: el ownership (profesional
  // sólo sobre lo suyo, admin sin filtro) vive en la capa de servicio, no acá.
  // Sin rate limit por IP: no son la superficie pública de §13 (van detrás
  // de auth, la IP ya no es la única defensa).

  turnosRouter.post('/:id/aprobar', requireAuth, async (req, res, next) => {
    try {
      const turno = await aprobarTurno({ turnoId: req.params.id, usuario: req.usuario! });
      res.json(turno);
    } catch (err) {
      next(err);
    }
  });

  turnosRouter.post('/:id/rechazar', requireAuth, async (req, res, next) => {
    try {
      const turno = await rechazarTurno({ turnoId: req.params.id, usuario: req.usuario! });
      res.json(turno);
    } catch (err) {
      next(err);
    }
  });

  turnosRouter.post('/:id/ausente', requireAuth, async (req, res, next) => {
    try {
      const turno = await marcarAusente({ turnoId: req.params.id, usuario: req.usuario! });
      res.json(turno);
    } catch (err) {
      next(err);
    }
  });

  turnosRouter.post('/:id/cancelar', requireAuth, async (req, res, next) => {
    const parsed = cancelarTurnoPanelSchema.safeParse(req.body);
    if (!parsed.success) {
      next(new ApiError(400, 'BODY_INVALIDO', 'Datos de cancelación inválidos', parsed.error.flatten()));
      return;
    }

    try {
      const turno = await cancelarTurno({ turnoId: req.params.id, usuario: req.usuario!, motivo: parsed.data.motivo });
      res.json(turno);
    } catch (err) {
      next(err);
    }
  });

  // GET de panel (§15.6) — read puro, requireAuth + ownership (asimétrico:
  // listado filtra, detalle rechaza con 403; ver consultarTurnosPanel.ts).

  turnosRouter.get('/', requireAuth, async (req, res, next) => {
    const parsed = queryTurnosSchema.safeParse(req.query);
    if (!parsed.success) {
      next(new ApiError(400, 'QUERY_INVALIDA', 'Parámetros inválidos', parsed.error.flatten()));
      return;
    }

    const { estado, desde, hasta, profesionalId } = parsed.data;

    try {
      const turnos = await listarTurnosPanel({
        usuario: req.usuario!,
        estado: estado ? (Array.isArray(estado) ? estado : [estado]) : undefined,
        desde: desde ? new Date(desde) : undefined,
        hasta: hasta ? new Date(hasta) : undefined,
        profesionalId,
      });
      res.json(turnos);
    } catch (err) {
      next(err);
    }
  });

  turnosRouter.get('/:id', requireAuth, async (req, res, next) => {
    try {
      const turno = await obtenerTurnoPanel({ turnoId: req.params.id, usuario: req.usuario! });
      res.json(turno);
    } catch (err) {
      next(err);
    }
  });

  return turnosRouter;
}

const queryTurnosSchema = z.object({
  estado: z.union([estadoTurnoSchema, z.array(estadoTurnoSchema)]).optional(),
  desde: z.string().datetime().optional(),
  hasta: z.string().datetime().optional(),
  profesionalId: z.string().optional(),
});
