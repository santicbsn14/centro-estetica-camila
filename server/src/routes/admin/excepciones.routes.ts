import { Router } from 'express';
import { z } from 'zod';
import { crearExcepcionSchema, editarExcepcionSchema } from '@shared/schemas/excepcion.schema';
import {
  crearExcepcionPanel,
  listarExcepcionesPanel,
  editarExcepcionPanel,
  eliminarExcepcion,
} from '../../services/excepciones.service';
import { ApiError } from '../../utils/apiError';

// CRUD de excepciones del panel — modelo-datos-turnos.md §15.10. Cierra el
// CRUD del panel. El gate de requireAuth + requireRol('admin') vive en el
// namespace (admin/index.ts), no acá. Sin superficie "mía": v1 las carga la
// dueña para todas las profesionales; auto-gestión de licencias es fase 2.

export const excepcionesAdminRouter = Router();

const queryExcepcionesSchema = z.object({
  desde: z.string().datetime().optional(),
  hasta: z.string().datetime().optional(),
  profesionalId: z
    .string()
    .regex(/^[0-9a-fA-F]{24}$/, 'id inválido')
    .optional(),
});

excepcionesAdminRouter.post('/', async (req, res, next) => {
  const parsed = crearExcepcionSchema.safeParse(req.body);
  if (!parsed.success) {
    next(new ApiError(400, 'BODY_INVALIDO', 'Datos de excepción inválidos', parsed.error.flatten()));
    return;
  }

  try {
    const excepcion = await crearExcepcionPanel(parsed.data, req.usuario!.id);
    res.status(201).json(excepcion);
  } catch (err) {
    next(err);
  }
});

excepcionesAdminRouter.get('/', async (req, res, next) => {
  const parsed = queryExcepcionesSchema.safeParse(req.query);
  if (!parsed.success) {
    next(new ApiError(400, 'QUERY_INVALIDA', 'Parámetros inválidos', parsed.error.flatten()));
    return;
  }

  try {
    const { desde, hasta, profesionalId } = parsed.data;
    const excepciones = await listarExcepcionesPanel({
      desde: desde ? new Date(desde) : undefined,
      hasta: hasta ? new Date(hasta) : undefined,
      profesionalId,
    });
    res.json(excepciones);
  } catch (err) {
    next(err);
  }
});

excepcionesAdminRouter.patch('/:id', async (req, res, next) => {
  const parsed = editarExcepcionSchema.safeParse(req.body);
  if (!parsed.success) {
    next(new ApiError(400, 'BODY_INVALIDO', 'Datos de edición inválidos', parsed.error.flatten()));
    return;
  }

  try {
    res.json(await editarExcepcionPanel(req.params.id, parsed.data));
  } catch (err) {
    next(err);
  }
});

excepcionesAdminRouter.delete('/:id', async (req, res, next) => {
  try {
    await eliminarExcepcion(req.params.id);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
