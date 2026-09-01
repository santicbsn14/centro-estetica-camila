import { Types } from 'mongoose';
import { Servicio } from '../models';
import { IHorarioDia } from '../models/subschemas/horario.subschema';
import { CrearServicioInput, EditarServicioInput } from '@shared/schemas/servicio.schema';
import { ApiError } from '../utils/apiError';

// CRUD administrativo de servicios (modelo-datos-turnos.md §15.7). Sin
// transacción: cada operación es sobre un único documento, la unicidad del
// nombre la garantiza el índice, no un chequeo previo con ventana de carrera.

interface ServicioLean {
  _id: Types.ObjectId;
  nombre: string;
  descripcion?: string;
  duracionMin: number;
  bufferPostMin: number;
  precio: number;
  mostrarPrecio: boolean;
  horarios: IHorarioDia[] | null;
  orden: number;
  activo: boolean;
  creadoEn: Date;
  actualizadoEn: Date;
}

// Shape del CRUD (todos los campos) — distinto del recorte público de §15.3.
// Mapper único: ninguna de las cuatro operaciones repite la proyección.
export interface ServicioPanel {
  id: string;
  nombre: string;
  descripcion?: string;
  duracionMin: number;
  bufferPostMin: number;
  precio: number;
  mostrarPrecio: boolean;
  horarios: IHorarioDia[] | null;
  orden: number;
  activo: boolean;
  creadoEn: string;
  actualizadoEn: string;
}

function mapServicioParaPanel(servicio: ServicioLean): ServicioPanel {
  return {
    id: servicio._id.toString(),
    nombre: servicio.nombre,
    descripcion: servicio.descripcion,
    duracionMin: servicio.duracionMin,
    bufferPostMin: servicio.bufferPostMin,
    precio: servicio.precio,
    mostrarPrecio: servicio.mostrarPrecio,
    horarios: servicio.horarios,
    orden: servicio.orden,
    activo: servicio.activo,
    creadoEn: servicio.creadoEn.toISOString(),
    actualizadoEn: servicio.actualizadoEn.toISOString(),
  };
}

export async function crearServicioPanel(input: CrearServicioInput): Promise<ServicioPanel> {
  try {
    const servicio = await Servicio.create({
      nombre: input.nombre,
      descripcion: input.descripcion,
      duracionMin: input.duracionMin,
      bufferPostMin: input.bufferPostMin,
      precio: input.precio,
      mostrarPrecio: input.mostrarPrecio,
      horarios: input.horarios,
      orden: input.orden,
      // activo: no viene del input (el schema no lo declara) — nace true por
      // default del modelo.
    });
    return mapServicioParaPanel(servicio.toObject());
  } catch (err) {
    if (esNombreDuplicado(err)) {
      throw new ApiError(409, 'NOMBRE_DUPLICADO', 'Ya existe un servicio con ese nombre');
    }
    throw err;
  }
}

export async function listarServiciosPanel(): Promise<ServicioPanel[]> {
  const servicios = await Servicio.find({}).sort({ orden: 1 }).lean();
  return servicios.map(mapServicioParaPanel);
}

export async function obtenerServicioPanel(id: string): Promise<ServicioPanel> {
  if (!Types.ObjectId.isValid(id)) {
    throw new ApiError(400, 'ID_INVALIDO', 'servicioId inválido');
  }

  const servicio = await Servicio.findById(id).lean();
  if (!servicio) {
    throw new ApiError(404, 'SERVICIO_NO_ENCONTRADO', 'El servicio no existe');
  }

  return mapServicioParaPanel(servicio);
}

export async function editarServicioPanel(id: string, input: EditarServicioInput): Promise<ServicioPanel> {
  if (!Types.ObjectId.isValid(id)) {
    throw new ApiError(400, 'ID_INVALIDO', 'servicioId inválido');
  }

  try {
    // $set con el objeto entero: si `horarios` viene, reemplaza el array
    // completo (Mongoose no hace merge por día en un $set) — es la regla
    // pedida, no un efecto secundario a evitar.
    const servicio = await Servicio.findByIdAndUpdate(id, { $set: input }, { new: true, runValidators: true }).lean();
    if (!servicio) {
      throw new ApiError(404, 'SERVICIO_NO_ENCONTRADO', 'El servicio no existe');
    }
    return mapServicioParaPanel(servicio);
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (esNombreDuplicado(err)) {
      throw new ApiError(409, 'NOMBRE_DUPLICADO', 'Ya existe un servicio con ese nombre');
    }
    throw err;
  }
}

function esNombreDuplicado(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: number }).code === 11000 &&
    'nombre' in ((err as { keyPattern?: Record<string, unknown> }).keyPattern ?? {})
  );
}
