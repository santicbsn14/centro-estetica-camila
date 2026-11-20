import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { Experiencia } from '../models';

// GET /api/experiencias — combos y experiencias públicos
// (modelo-datos-turnos.md §15.7.2). Read puro, sin auth.

// Factory en vez de Router singleton — mismo motivo que servicios.routes.ts:
// cada createApp() arma su propio rate limiter en memoria, con contador propio.
export function crearExperienciasRouter(): Router {
  const experienciasRouter = Router();

  // 60/min por IP, mismo criterio que GET /api/servicios.
  experienciasRouter.use(
    rateLimit({
      windowMs: 60 * 1000,
      limit: 60,
      standardHeaders: true,
      legacyHeaders: false,
      handler: (_req, res) => {
        res
          .status(429)
          .json({ codigo: 'DEMASIADAS_SOLICITUDES', mensaje: 'Demasiadas solicitudes, probá de nuevo en unos minutos' });
      },
    })
  );

  experienciasRouter.get('/', async (_req, res, next) => {
    try {
      const experiencias = await Experiencia.find({ activo: true })
        .sort({ orden: 1 })
        .select('nombre descripcion incluye precio mostrarPrecio imagenUrl')
        .lean();

      // Allowlist explícita: nunca orden, activo ni timestamps.
      res.json(
        experiencias.map((e) => ({
          _id: e._id,
          nombre: e.nombre,
          ...(e.descripcion ? { descripcion: e.descripcion } : {}),
          incluye: e.incluye,
          ...(e.mostrarPrecio ? { precio: e.precio } : {}),
          ...(e.imagenUrl ? { imagenUrl: e.imagenUrl } : {}),
        }))
      );
    } catch (err) {
      next(err);
    }
  });

  return experienciasRouter;
}
