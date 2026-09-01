import { Types } from 'mongoose';
import { Excepcion } from '../models';
import { TipoExcepcion } from '../models/excepcion.model';
import { CrearExcepcionInput, EditarExcepcionInput } from '@shared/schemas/excepcion.schema';
import { ApiError } from '../utils/apiError';

// CRUD administrativo de excepciones (modelo-datos-turnos.md §15.10). Sin
// transacción: documentos independientes, una operación por request. Único
// recurso del sistema con DELETE físico — a diferencia de servicios/usuarios,
// ninguna excepción es referenciada por un snapshot de turno (§4), borrarla
// de verdad no rompe integridad de nada.

interface ExcepcionLean {
  _id: Types.ObjectId;
  profesionalId: Types.ObjectId | null;
  desde: Date;
  hasta: Date;
  tipo: TipoExcepcion;
  motivo?: string;
  creadoPor: Types.ObjectId;
  creadoEn: Date;
}

// Admin-only, sin recorte — mapper único, ninguna operación repite la proyección.
export interface ExcepcionPanel {
  id: string;
  profesionalId: string | null;
  desde: string;
  hasta: string;
  tipo: TipoExcepcion;
  motivo?: string;
  creadoPor: string;
  creadoEn: string;
}

function mapExcepcionParaPanel(excepcion: ExcepcionLean): ExcepcionPanel {
  return {
    id: excepcion._id.toString(),
    profesionalId: excepcion.profesionalId ? excepcion.profesionalId.toString() : null,
    desde: excepcion.desde.toISOString(),
    hasta: excepcion.hasta.toISOString(),
    tipo: excepcion.tipo,
    motivo: excepcion.motivo,
    creadoPor: excepcion.creadoPor.toString(),
    creadoEn: excepcion.creadoEn.toISOString(),
  };
}

export async function crearExcepcionPanel(input: CrearExcepcionInput, creadoPor: string): Promise<ExcepcionPanel> {
  const excepcion = await Excepcion.create({
    profesionalId: input.profesionalId ?? null,
    desde: new Date(input.desde),
    hasta: new Date(input.hasta),
    tipo: input.tipo,
    motivo: input.motivo,
    creadoPor,
  });
  return mapExcepcionParaPanel(excepcion.toObject());
}

export interface ListarExcepcionesParams {
  desde?: Date;
  hasta?: Date;
  profesionalId?: string;
}

// Trae las excepciones que SOLAPAN la ventana pedida, no sólo las contenidas:
// excepcion.desde <= ventana.hasta && excepcion.hasta >= ventana.desde. Cada
// mitad de la condición sólo se aplica si el borde correspondiente de la
// ventana vino en la query — sin params, ninguna se aplica ⇒ todas. Apoyado
// en el índice { profesionalId, hasta, desde } (§9).
export async function listarExcepcionesPanel(params: ListarExcepcionesParams): Promise<ExcepcionPanel[]> {
  const filtro: Record<string, unknown> = {};
  if (params.hasta) filtro.desde = { $lte: params.hasta };
  if (params.desde) filtro.hasta = { $gte: params.desde };
  // Trae las de esa profesional Y las del centro (null) — son las que la
  // afectan, mismo criterio que disponibilidad (§5.1).
  if (params.profesionalId) filtro.profesionalId = { $in: [null, new Types.ObjectId(params.profesionalId)] };

  const excepciones = await Excepcion.find(filtro).sort({ desde: 1 }).lean();
  return excepciones.map(mapExcepcionParaPanel);
}

export async function editarExcepcionPanel(id: string, input: EditarExcepcionInput): Promise<ExcepcionPanel> {
  if (!Types.ObjectId.isValid(id)) {
    throw new ApiError(400, 'ID_INVALIDO', 'excepcionId inválido');
  }

  const set: Record<string, unknown> = { ...input };
  if (input.desde !== undefined) set.desde = new Date(input.desde);
  if (input.hasta !== undefined) set.hasta = new Date(input.hasta);

  // El schema de Zod revalida hasta > desde cuando el PATCH trae los dos
  // extremos, pero si sólo trae uno no puede saber el otro. Se revalida acá,
  // contra el documento existente, antes de persistir.
  if ((input.desde !== undefined) !== (input.hasta !== undefined)) {
    const actual = await Excepcion.findById(id).lean();
    if (!actual) {
      throw new ApiError(404, 'EXCEPCION_NO_ENCONTRADA', 'La excepción no existe');
    }
    const desdeEfectivo = (set.desde as Date | undefined) ?? actual.desde;
    const hastaEfectivo = (set.hasta as Date | undefined) ?? actual.hasta;
    if (hastaEfectivo <= desdeEfectivo) {
      throw new ApiError(400, 'RANGO_INVALIDO', 'hasta debe ser posterior a desde');
    }
  }

  const excepcion = await Excepcion.findByIdAndUpdate(id, { $set: set }, { new: true, runValidators: true }).lean();
  if (!excepcion) {
    throw new ApiError(404, 'EXCEPCION_NO_ENCONTRADA', 'La excepción no existe');
  }
  return mapExcepcionParaPanel(excepcion);
}

// Borrado FÍSICO — única excepción consciente a "borrado no existe" (§4).
// Correcto acá porque nada referencia una excepción (ver §15.10 del .md);
// `activo:false` sólo dejaría basura permanente que la query de
// disponibilidad tendría que filtrar para siempre.
export async function eliminarExcepcion(id: string): Promise<void> {
  if (!Types.ObjectId.isValid(id)) {
    throw new ApiError(400, 'ID_INVALIDO', 'excepcionId inválido');
  }

  const eliminada = await Excepcion.findByIdAndDelete(id);
  if (!eliminada) {
    throw new ApiError(404, 'EXCEPCION_NO_ENCONTRADA', 'La excepción no existe');
  }
}
