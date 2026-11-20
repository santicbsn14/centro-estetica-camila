import { Router } from 'express';
import { crearCategoriaSchema, editarCategoriaSchema } from '@shared/schemas/categoria.schema';
import {
  crearCategoriaPanel,
  listarCategoriasPanel,
  editarCategoriaPanel,
  eliminarCategoria,
} from '../../services/categorias.service';
import { ApiError } from '../../utils/apiError';

// CRUD de categorías de servicio del panel — modelo-datos-turnos.md §15.7.1.
// El gate de requireAuth + requireRol('admin') vive en el namespace
// (admin/index.ts), no acá. Sin GET /api/categorias público: la web pública
// recibe la categoría embebida en GET /api/servicios.

export const categoriasAdminRouter = Router();

categoriasAdminRouter.get('/', async (_req, res, next) => {
  try {
    res.json(await listarCategoriasPanel());
  } catch (err) {
    next(err);
  }
});

categoriasAdminRouter.post('/', async (req, res, next) => {
  const parsed = crearCategoriaSchema.safeParse(req.body);
  if (!parsed.success) {
    next(new ApiError(400, 'BODY_INVALIDO', 'Datos de categoría inválidos', parsed.error.flatten()));
    return;
  }

  try {
    res.status(201).json(await crearCategoriaPanel(parsed.data));
  } catch (err) {
    next(err);
  }
});

categoriasAdminRouter.patch('/:id', async (req, res, next) => {
  const parsed = editarCategoriaSchema.safeParse(req.body);
  if (!parsed.success) {
    next(new ApiError(400, 'BODY_INVALIDO', 'Datos de edición inválidos', parsed.error.flatten()));
    return;
  }

  try {
    res.json(await editarCategoriaPanel(req.params.id, parsed.data));
  } catch (err) {
    next(err);
  }
});

categoriasAdminRouter.delete('/:id', async (req, res, next) => {
  try {
    await eliminarCategoria(req.params.id);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
