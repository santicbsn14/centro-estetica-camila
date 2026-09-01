import { DateTime } from 'luxon';
import { Types } from 'mongoose';
import { Configuracion, Turno } from '../models';
import { EstadoTurno } from '../models/turno.model';
import { UsuarioAutenticado } from '../middleware/auth';
import { ApiError } from '../utils/apiError';
import { verificarOwnershipTurno, mapTurnoParaPanel, mapTurnoParaPanelLista, TurnoPanel, TurnoPanelLista } from './turnos.service';

// GET de turnos del panel (§15.6) — read puro, sin transacción. Reusa el
// mapper canónico de turnos.service.ts; no redefine la proyección.

const LIMITE_LISTADO = 1000;

export interface ListarTurnosPanelParams {
  usuario: UsuarioAutenticado;
  estado?: EstadoTurno[];
  desde?: Date;
  hasta?: Date;
  profesionalId?: string;
}

export async function listarTurnosPanel(p: ListarTurnosPanelParams): Promise<TurnoPanelLista[]> {
  const config = await Configuracion.findById('centro').lean();
  if (!config) {
    throw new ApiError(500, 'CONFIG_FALTANTE', 'Falta configurar el centro');
  }

  const hoyLocal = DateTime.now().setZone(config.timezone).startOf('day');
  const desdeEfectivo = p.desde ?? hoyLocal.toJSDate();
  const hastaEfectivo = p.hasta ?? hoyLocal.plus({ days: config.ventanaMaximaDias }).toJSDate();

  if (desdeEfectivo.getTime() > hastaEfectivo.getTime()) {
    throw new ApiError(400, 'RANGO_INVALIDO', "'desde' no puede ser posterior a 'hasta'");
  }

  const filtro: Record<string, unknown> = {
    inicio: { $gte: desdeEfectivo, $lte: hastaEfectivo },
  };

  if (p.estado && p.estado.length > 0) {
    filtro.estado = { $in: p.estado };
  }

  // Ownership asimétrico: el listado filtra, no rechaza (§15.6). Profesional
  // ⇒ se ignora el profesionalId del query y se fuerza el propio. Admin ⇒
  // opcional; sin él, ve todo.
  if (p.usuario.rol === 'profesional') {
    filtro.profesionalId = new Types.ObjectId(p.usuario.id);
  } else if (p.profesionalId) {
    if (!Types.ObjectId.isValid(p.profesionalId)) {
      throw new ApiError(400, 'ID_INVALIDO', 'profesionalId inválido');
    }
    filtro.profesionalId = new Types.ObjectId(p.profesionalId);
  }

  const turnos = await Turno.find(filtro)
    .sort({ inicio: 1, _id: 1 })
    .limit(LIMITE_LISTADO)
    .lean();

  return turnos.map(mapTurnoParaPanelLista);
}

export interface ObtenerTurnoPanelParams {
  turnoId: string;
  usuario: UsuarioAutenticado;
}

export async function obtenerTurnoPanel(p: ObtenerTurnoPanelParams): Promise<TurnoPanel> {
  if (!Types.ObjectId.isValid(p.turnoId)) {
    throw new ApiError(400, 'ID_INVALIDO', 'turnoId inválido');
  }

  const turno = await Turno.findById(p.turnoId).lean();
  if (!turno) {
    throw new ApiError(404, 'TURNO_NO_ENCONTRADO', 'El turno no existe');
  }

  // Detalle: 403, no filtro (distinto del listado) — acceso a un recurso puntual.
  verificarOwnershipTurno(p.usuario, turno);

  return mapTurnoParaPanel(turno);
}
