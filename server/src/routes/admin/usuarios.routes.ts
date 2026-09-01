import { Router } from 'express';
import { crearUsuarioSchema, editarUsuarioSchema, resetPasswordSchema } from '@shared/schemas/usuario.schema';
import {
  crearUsuarioPanel,
  listarUsuariosPanel,
  obtenerUsuarioPanel,
  editarUsuarioPanel,
  resetPasswordUsuario,
} from '../../services/usuarios.service';
import { ApiError } from '../../utils/apiError';

// CRUD de usuarios del panel — modelo-datos-turnos.md §15.9. El gate de
// requireAuth + requireRol('admin') vive en el namespace (admin/index.ts).
// Password nunca en este canal: editarUsuarioSchema es .strict() y no lo
// declara — reset-password es la única vía para que el admin la cambie.

export const usuariosAdminRouter = Router();

usuariosAdminRouter.post('/', async (req, res, next) => {
  const parsed = crearUsuarioSchema.safeParse(req.body);
  if (!parsed.success) {
    next(new ApiError(400, 'BODY_INVALIDO', 'Datos de usuario inválidos', parsed.error.flatten()));
    return;
  }

  try {
    const usuario = await crearUsuarioPanel(parsed.data);
    res.status(201).json(usuario);
  } catch (err) {
    next(err);
  }
});

usuariosAdminRouter.get('/', async (_req, res, next) => {
  try {
    res.json(await listarUsuariosPanel());
  } catch (err) {
    next(err);
  }
});

usuariosAdminRouter.get('/:id', async (req, res, next) => {
  try {
    res.json(await obtenerUsuarioPanel(req.params.id));
  } catch (err) {
    next(err);
  }
});

usuariosAdminRouter.patch('/:id', async (req, res, next) => {
  const parsed = editarUsuarioSchema.safeParse(req.body);
  if (!parsed.success) {
    next(new ApiError(400, 'BODY_INVALIDO', 'Datos de edición inválidos', parsed.error.flatten()));
    return;
  }

  try {
    res.json(await editarUsuarioPanel(req.params.id, parsed.data));
  } catch (err) {
    next(err);
  }
});

usuariosAdminRouter.post('/:id/reset-password', async (req, res, next) => {
  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    next(new ApiError(400, 'BODY_INVALIDO', 'Datos inválidos', parsed.error.flatten()));
    return;
  }

  try {
    res.json(await resetPasswordUsuario(req.params.id, parsed.data.nueva));
  } catch (err) {
    next(err);
  }
});
