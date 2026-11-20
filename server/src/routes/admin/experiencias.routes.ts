import { Router } from 'express';
import { crearExperienciaSchema, editarExperienciaSchema } from '@shared/schemas/experiencia.schema';
import {
  crearExperienciaPanel,
  listarExperienciasPanel,
  obtenerExperienciaPanel,
  editarExperienciaPanel,
} from '../../services/experiencias.service';
import { ApiError } from '../../utils/apiError';

// CRUD de combos y experiencias del panel — modelo-datos-turnos.md §15.7.2.
// El gate de requireAuth + requireRol('admin') vive en el namespace
// (admin/index.ts). Sin DELETE: borrado lógico = PATCH { activo: false }.

export const experienciasAdminRouter = Router();

experienciasAdminRouter.post('/', async (req, res, next) => {
  const parsed = crearExperienciaSchema.safeParse(req.body);
  if (!parsed.success) {
    next(new ApiError(400, 'BODY_INVALIDO', 'Datos de combo inválidos', parsed.error.flatten()));
    return;
  }

  try {
    res.status(201).json(await crearExperienciaPanel(parsed.data));
  } catch (err) {
    next(err);
  }
});

experienciasAdminRouter.get('/', async (_req, res, next) => {
  try {
    res.json(await listarExperienciasPanel());
  } catch (err) {
    next(err);
  }
});

experienciasAdminRouter.get('/:id', async (req, res, next) => {
  try {
    res.json(await obtenerExperienciaPanel(req.params.id));
  } catch (err) {
    next(err);
  }
});

experienciasAdminRouter.patch('/:id', async (req, res, next) => {
  const parsed = editarExperienciaSchema.safeParse(req.body);
  if (!parsed.success) {
    next(new ApiError(400, 'BODY_INVALIDO', 'Datos de edición inválidos', parsed.error.flatten()));
    return;
  }

  try {
    res.json(await editarExperienciaPanel(req.params.id, parsed.data));
  } catch (err) {
    next(err);
  }
});
