import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { Types } from 'mongoose';
import { Servicio, Usuario } from '../models';
import { ApiError } from '../utils/apiError';

// Reads públicos de soporte — modelo-datos-turnos.md §15.3.

// Factory en vez de Router singleton — mismo motivo que auth.routes.ts: cada
// createApp() arma su propio rate limiter en memoria, con contador propio
// (relevante sobre todo para tests que crean varias apps en el mismo proceso).
export function crearServiciosRouter(): Router {
  const serviciosRouter = Router();

  // Rate limit por IP (§13/§15.3), compartido entre los dos GET de este
  // router: ambos son reads livianos que se piden juntos al armar el flujo
  // servicio → profesional → horarios, mismo criterio generoso que
  // disponibilidad.routes.ts (navegación normal, no login).
  const serviciosRateLimit = rateLimit({
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
  serviciosRouter.use(serviciosRateLimit);

  serviciosRouter.get('/', async (_req, res, next) => {
    try {
      const servicios = await Servicio.find({ activo: true })
        .sort({ orden: 1 })
        .select('nombre descripcion duracionMin precio mostrarPrecio')
        .lean();

      // Nunca horarios, buffer ni campos internos — sólo lo que la web muestra.
      res.json(
        servicios.map((s) => ({
          _id: s._id,
          nombre: s.nombre,
          descripcion: s.descripcion,
          duracionMin: s.duracionMin,
          ...(s.mostrarPrecio ? { precio: s.precio } : {}),
        }))
      );
    } catch (err) {
      next(err);
    }
  });

  serviciosRouter.get('/:id/profesionales', async (req, res, next) => {
    if (!Types.ObjectId.isValid(req.params.id)) {
      next(new ApiError(400, 'ID_INVALIDO', 'servicioId inválido'));
      return;
    }

    try {
      const profesionales = await Usuario.find({
        activo: true,
        atiende: true,
        servicios: req.params.id,
      })
        .select('nombre')
        .lean();

      // Superficie pública: nunca email ni telefonoE164.
      res.json(profesionales.map((p) => ({ _id: p._id, nombre: p.nombre })));
    } catch (err) {
      next(err);
    }
  });

  return serviciosRouter;
}
