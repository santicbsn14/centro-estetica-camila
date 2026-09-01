import { Router } from 'express';
import { miPerfilSchema, misHorariosSchema, cambiarPasswordSchema } from '@shared/schemas/usuario.schema';
import { obtenerUsuarioPanel, editarMiPerfil, editarMisHorarios, cambiarMiPassword } from '../services/usuarios.service';
import { requireAuth } from '../middleware/auth';
import { ApiError } from '../utils/apiError';

// "Lo mío" — modelo-datos-turnos.md §15.9. Sin :id en NINGUNA ruta acá: el
// recurso sale siempre de req.usuario.id (requireAuth ya lo adjuntó), nunca
// del path. No existe forma de que una profesional toque los datos de otra
// por este router — no hay parámetro donde pasar un id ajeno.

export const miRouter = Router();

miRouter.use(requireAuth);

miRouter.get('/perfil', async (req, res, next) => {
  try {
    res.json(await obtenerUsuarioPanel(req.usuario!.id));
  } catch (err) {
    next(err);
  }
});

miRouter.patch('/perfil', async (req, res, next) => {
  const parsed = miPerfilSchema.safeParse(req.body);
  if (!parsed.success) {
    next(new ApiError(400, 'BODY_INVALIDO', 'Datos de perfil inválidos', parsed.error.flatten()));
    return;
  }

  try {
    res.json(await editarMiPerfil(req.usuario!.id, parsed.data));
  } catch (err) {
    next(err);
  }
});

miRouter.patch('/horarios', async (req, res, next) => {
  const parsed = misHorariosSchema.safeParse(req.body);
  if (!parsed.success) {
    next(new ApiError(400, 'BODY_INVALIDO', 'Datos de horarios inválidos', parsed.error.flatten()));
    return;
  }

  try {
    res.json(await editarMisHorarios(req.usuario!.id, parsed.data.horarios));
  } catch (err) {
    next(err);
  }
});

miRouter.post('/password', async (req, res, next) => {
  const parsed = cambiarPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    next(new ApiError(400, 'BODY_INVALIDO', 'Datos inválidos', parsed.error.flatten()));
    return;
  }

  try {
    await cambiarMiPassword(req.usuario!.id, parsed.data.actual, parsed.data.nueva);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
