import { Router } from 'express';
import { crearServicioSchema, editarServicioSchema } from '@shared/schemas/servicio.schema';
import {
  crearServicioPanel,
  listarServiciosPanel,
  obtenerServicioPanel,
  editarServicioPanel,
} from '../../services/servicios.service';
import { ApiError } from '../../utils/apiError';

// CRUD de servicios del panel — modelo-datos-turnos.md §15.7. El gate de
// requireAuth + requireRol('admin') vive en el namespace (admin/index.ts),
// no acá.

export const serviciosAdminRouter = Router();

serviciosAdminRouter.post('/', async (req, res, next) => {
  const parsed = crearServicioSchema.safeParse(req.body);
  if (!parsed.success) {
    next(new ApiError(400, 'BODY_INVALIDO', 'Datos de servicio inválidos', parsed.error.flatten()));
    return;
  }

  try {
    const servicio = await crearServicioPanel(parsed.data);
    res.status(201).json(servicio);
  } catch (err) {
    next(err);
  }
});

serviciosAdminRouter.get('/', async (_req, res, next) => {
  try {
    res.json(await listarServiciosPanel());
  } catch (err) {
    next(err);
  }
});

serviciosAdminRouter.get('/:id', async (req, res, next) => {
  try {
    res.json(await obtenerServicioPanel(req.params.id));
  } catch (err) {
    next(err);
  }
});

serviciosAdminRouter.patch('/:id', async (req, res, next) => {
  const parsed = editarServicioSchema.safeParse(req.body);
  if (!parsed.success) {
    next(new ApiError(400, 'BODY_INVALIDO', 'Datos de edición inválidos', parsed.error.flatten()));
    return;
  }

  try {
    res.json(await editarServicioPanel(req.params.id, parsed.data));
  } catch (err) {
    next(err);
  }
});
