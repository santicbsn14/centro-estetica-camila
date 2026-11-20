import { Types } from 'mongoose';
import { Experiencia } from '../models';
import { CrearExperienciaInput, EditarExperienciaInput } from '@shared/schemas/experiencia.schema';
import { ApiError } from '../utils/apiError';
import { esNombreDuplicado } from './servicios.service';

// CRUD administrativo de combos y experiencias (modelo-datos-turnos.md
// §15.7.2). Sin DELETE (borrado lógico = PATCH activo). Sin transacción: un
// documento por operación, la unicidad del nombre la garantiza el índice.

interface ExperienciaLean {
  _id: Types.ObjectId;
  nombre: string;
  descripcion?: string;
  incluye: string[];
  precio: number;
  mostrarPrecio: boolean;
  imagenUrl?: string;
  orden: number;
  activo: boolean;
  creadoEn: Date;
  actualizadoEn: Date;
}

// Todos los campos + id. Mapper único.
export interface ExperienciaPanel {
  id: string;
  nombre: string;
  descripcion?: string;
  incluye: string[];
  precio: number;
  mostrarPrecio: boolean;
  imagenUrl?: string;
  orden: number;
  activo: boolean;
  creadoEn: string;
  actualizadoEn: string;
}

function mapExperienciaParaPanel(e: ExperienciaLean): ExperienciaPanel {
  return {
    id: e._id.toString(),
    nombre: e.nombre,
    descripcion: e.descripcion,
    incluye: [...e.incluye],
    precio: e.precio,
    mostrarPrecio: e.mostrarPrecio,
    imagenUrl: e.imagenUrl,
    orden: e.orden,
    activo: e.activo,
    creadoEn: e.creadoEn.toISOString(),
    actualizadoEn: e.actualizadoEn.toISOString(),
  };
}

function validarId(id: string): void {
  if (!Types.ObjectId.isValid(id)) {
    throw new ApiError(400, 'ID_INVALIDO', 'experienciaId inválido');
  }
}

function errorNoEncontrada(): ApiError {
  return new ApiError(404, 'EXPERIENCIA_NO_ENCONTRADA', 'El combo no existe');
}

function errorDuplicado(): ApiError {
  return new ApiError(409, 'NOMBRE_DUPLICADO', 'Ya existe un combo con ese nombre');
}

export async function crearExperienciaPanel(input: CrearExperienciaInput): Promise<ExperienciaPanel> {
  try {
    const experiencia = await Experiencia.create({
      nombre: input.nombre,
      descripcion: input.descripcion,
      incluye: input.incluye,
      precio: input.precio,
      mostrarPrecio: input.mostrarPrecio,
      imagenUrl: input.imagenUrl,
      orden: input.orden,
      // activo: no viene del input — nace true por default del modelo.
    });
    return mapExperienciaParaPanel(experiencia.toObject());
  } catch (err) {
    if (esNombreDuplicado(err)) throw errorDuplicado();
    throw err;
  }
}

export async function listarExperienciasPanel(): Promise<ExperienciaPanel[]> {
  const experiencias = await Experiencia.find({}).sort({ orden: 1 }).lean<ExperienciaLean[]>();
  return experiencias.map(mapExperienciaParaPanel);
}

export async function obtenerExperienciaPanel(id: string): Promise<ExperienciaPanel> {
  validarId(id);
  const experiencia = await Experiencia.findById(id).lean<ExperienciaLean>();
  if (!experiencia) throw errorNoEncontrada();
  return mapExperienciaParaPanel(experiencia);
}

export async function editarExperienciaPanel(id: string, input: EditarExperienciaInput): Promise<ExperienciaPanel> {
  validarId(id);

  let experiencia: ExperienciaLean | null;
  try {
    // $set con el objeto entero: si `incluye` viene, reemplaza el array
    // completo (regla de §15.7.2, igual que horarios en servicios).
    experiencia = await Experiencia.findByIdAndUpdate(id, { $set: input }, { new: true, runValidators: true }).lean<ExperienciaLean>();
  } catch (err) {
    if (esNombreDuplicado(err)) throw errorDuplicado();
    throw err;
  }
  if (!experiencia) throw errorNoEncontrada();
  return mapExperienciaParaPanel(experiencia);
}
