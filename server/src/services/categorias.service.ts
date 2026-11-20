import { Types } from 'mongoose';
import { Categoria, Servicio } from '../models';
import { CrearCategoriaInput, EditarCategoriaInput } from '@shared/schemas/categoria.schema';
import { ApiError } from '../utils/apiError';
import { esNombreDuplicado } from './servicios.service';

// CRUD administrativo de categorías de servicio (modelo-datos-turnos.md
// §15.7.1). Sin transacción: documentos independientes; el DELETE hace dos
// operaciones en secuencia a propósito (ver eliminarCategoria).

// Orden de listado: `orden` asc, desempate por nombre con la misma collation
// que el índice único (es, strength 2) — "uñas"/"Uñas" ordenan igual.
const COLLATION_NOMBRE = { locale: 'es', strength: 2 } as const;

interface CategoriaLean {
  _id: Types.ObjectId;
  nombre: string;
  orden: number;
  creadoEn: Date;
  actualizadoEn: Date;
}

export interface CategoriaPanel {
  id: string;
  nombre: string;
  orden: number;
  serviciosActivos: number;
  creadoEn: string;
  actualizadoEn: string;
}

// Mapper único — ninguna operación repite la proyección.
function mapCategoriaParaPanel(categoria: CategoriaLean, serviciosActivos: number): CategoriaPanel {
  return {
    id: categoria._id.toString(),
    nombre: categoria.nombre,
    orden: categoria.orden,
    serviciosActivos,
    creadoEn: categoria.creadoEn.toISOString(),
    actualizadoEn: categoria.actualizadoEn.toISOString(),
  };
}

// Conteo de servicios ACTIVOS por categoriaId (una agregación para todo el
// listado, no una query por categoría). `ids` opcional para acotar a una.
async function contarServiciosActivos(ids?: Types.ObjectId[]): Promise<Map<string, number>> {
  const match: Record<string, unknown> = { activo: true, categoriaId: ids ? { $in: ids } : { $ne: null } };
  const grupos = await Servicio.aggregate<{ _id: Types.ObjectId; n: number }>([
    { $match: match },
    { $group: { _id: '$categoriaId', n: { $sum: 1 } } },
  ]);
  return new Map(grupos.map((g) => [g._id.toString(), g.n]));
}

function validarId(id: string): void {
  if (!Types.ObjectId.isValid(id)) {
    throw new ApiError(400, 'ID_INVALIDO', 'categoriaId inválido');
  }
}

function errorDuplicado(): ApiError {
  return new ApiError(409, 'NOMBRE_DUPLICADO', 'Ya existe una categoría con ese nombre');
}

export async function listarCategoriasPanel(): Promise<CategoriaPanel[]> {
  const [categorias, conteo] = await Promise.all([
    Categoria.find({}).sort({ orden: 1, nombre: 1 }).collation(COLLATION_NOMBRE).lean<CategoriaLean[]>(),
    contarServiciosActivos(),
  ]);
  return categorias.map((c) => mapCategoriaParaPanel(c, conteo.get(c._id.toString()) ?? 0));
}

export async function crearCategoriaPanel(input: CrearCategoriaInput): Promise<CategoriaPanel> {
  try {
    const categoria = await Categoria.create({ nombre: input.nombre, orden: input.orden });
    // Recién creada: nadie puede tenerla asignada todavía.
    return mapCategoriaParaPanel(categoria.toObject(), 0);
  } catch (err) {
    if (esNombreDuplicado(err)) throw errorDuplicado();
    throw err;
  }
}

export async function editarCategoriaPanel(id: string, input: EditarCategoriaInput): Promise<CategoriaPanel> {
  validarId(id);

  let categoria: CategoriaLean | null;
  try {
    categoria = await Categoria.findByIdAndUpdate(id, { $set: input }, { new: true, runValidators: true }).lean<CategoriaLean>();
  } catch (err) {
    if (esNombreDuplicado(err)) throw errorDuplicado();
    throw err;
  }
  if (!categoria) {
    throw new ApiError(404, 'CATEGORIA_NO_ENCONTRADA', 'La categoría no existe');
  }

  const conteo = await contarServiciosActivos([categoria._id]);
  return mapCategoriaParaPanel(categoria, conteo.get(categoria._id.toString()) ?? 0);
}

// Borrado FÍSICO — segunda excepción consciente a "borrado no existe" (§3/§4),
// mismo argumento que excepciones (§15.10): ningún turno referencia una
// categoría (servicios.categoriaId es referencia viva, no snapshot).
// - Con servicios ACTIVOS ⇒ 409 CATEGORIA_CON_SERVICIOS, no se toca nada.
// - Con sólo INACTIVOS ⇒ se desasignan (categoriaId: null) y después el
//   delete. Sin transacción: si el delete falla después del updateMany, sólo
//   quedan inactivos sin categoría (inocuo).
// - Carrera aceptada: un servicio asignado entre el chequeo y el delete queda
//   con un id huérfano, que el GET público resuelve como null.
export async function eliminarCategoria(id: string): Promise<void> {
  validarId(id);

  const existe = await Categoria.exists({ _id: id });
  if (!existe) {
    throw new ApiError(404, 'CATEGORIA_NO_ENCONTRADA', 'La categoría no existe');
  }

  const activos = await Servicio.find({ categoriaId: id, activo: true })
    .sort({ orden: 1 })
    .select('nombre')
    .lean();
  if (activos.length > 0) {
    throw new ApiError(
      409,
      'CATEGORIA_CON_SERVICIOS',
      'La categoría tiene servicios activos asignados',
      { servicios: activos.map((s) => ({ id: s._id.toString(), nombre: s.nombre })) }
    );
  }

  await Servicio.updateMany({ categoriaId: id, activo: false }, { $set: { categoriaId: null } });

  const eliminada = await Categoria.findByIdAndDelete(id);
  if (!eliminada) {
    throw new ApiError(404, 'CATEGORIA_NO_ENCONTRADA', 'La categoría no existe');
  }
}
