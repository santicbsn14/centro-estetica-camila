import { Router } from 'express';
import { editarConfiguracionSchema } from '@shared/schemas/configuracion.schema';
import { obtenerConfiguracionPanel, editarConfiguracionPanel } from '../../services/configuracion.service';
import { ApiError } from '../../utils/apiError';

// CRUD de configuración del panel — modelo-datos-turnos.md §15.8. Singleton:
// GET + PATCH, sin POST (nace del seed). El gate de requireAuth +
// requireRol('admin') vive en el namespace (admin/index.ts), no acá.

export const configuracionAdminRouter = Router();

configuracionAdminRouter.get('/', async (_req, res, next) => {
  try {
    res.json(await obtenerConfiguracionPanel());
  } catch (err) {
    next(err);
  }
});

configuracionAdminRouter.patch('/', async (req, res, next) => {
  const parsed = editarConfiguracionSchema.safeParse(req.body);
  if (!parsed.success) {
    next(new ApiError(400, 'BODY_INVALIDO', 'Datos de configuración inválidos', parsed.error.flatten()));
    return;
  }

  try {
    res.json(await editarConfiguracionPanel(parsed.data));
  } catch (err) {
    next(err);
  }
});
