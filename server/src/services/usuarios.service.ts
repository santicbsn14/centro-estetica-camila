import mongoose, { Types } from 'mongoose';
import { Usuario, Turno } from '../models';
import { RolUsuario } from '../models/usuario.model';
import { IHorarioDia } from '../models/subschemas/horario.subschema';
import {
  CrearUsuarioInput,
  EditarUsuarioInput,
  MiPerfilInput,
} from '@shared/schemas/usuario.schema';
import { normalizarTelefonoAR } from './telefono';
import { hashPassword, verifyPassword } from './password';
import { ApiError } from '../utils/apiError';
import { SESIONES_COLLECTION } from '../middleware/session';

// CRUD de usuarios (admin) + superficie "lo mío" (modelo-datos-turnos.md
// §15.9). Sin transacción: documentos únicos, unicidad por índice. Comparten
// mapper y el helper de $set — las dos superficies difieren en QUÉ campos
// puede tocar cada una (eso lo filtra el schema de Zod en la ruta, no acá).

interface UsuarioLean {
  _id: Types.ObjectId;
  nombre: string;
  email: string;
  rol: RolUsuario;
  atiende: boolean;
  servicios: Types.ObjectId[];
  horarios: IHorarioDia[];
  telefonoE164?: string;
  activo: boolean;
  creadoEn: Date;
  actualizadoEn: Date;
}

// passwordHash NUNCA acá — el mapper arma un objeto nuevo campo por campo
// (allowlist, no omit), como tokenHash en turnos. Verificado con test.
export interface UsuarioPanel {
  id: string;
  nombre: string;
  email: string;
  rol: RolUsuario;
  atiende: boolean;
  servicios: string[];
  horarios: IHorarioDia[];
  telefonoE164?: string;
  activo: boolean;
  creadoEn: string;
  actualizadoEn: string;
}

function mapUsuarioParaPanel(usuario: UsuarioLean): UsuarioPanel {
  return {
    id: usuario._id.toString(),
    nombre: usuario.nombre,
    email: usuario.email,
    rol: usuario.rol,
    atiende: usuario.atiende,
    servicios: usuario.servicios.map((s) => s.toString()),
    horarios: usuario.horarios,
    telefonoE164: usuario.telefonoE164,
    activo: usuario.activo,
    creadoEn: usuario.creadoEn.toISOString(),
    actualizadoEn: usuario.actualizadoEn.toISOString(),
  };
}

const SELECT_SIN_PASSWORD = '-passwordHash';

function esEmailDuplicado(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: number }).code === 11000 &&
    'email' in ((err as { keyPattern?: Record<string, unknown> }).keyPattern ?? {})
  );
}

async function aplicarCambiosUsuario(id: string, set: Record<string, unknown>): Promise<UsuarioLean> {
  try {
    const usuario = await Usuario.findByIdAndUpdate(id, { $set: set }, { new: true, runValidators: true })
      .select(SELECT_SIN_PASSWORD)
      .lean();
    if (!usuario) {
      throw new ApiError(404, 'USUARIO_NO_ENCONTRADO', 'El usuario no existe');
    }
    return usuario;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (esEmailDuplicado(err)) {
      throw new ApiError(409, 'EMAIL_DUPLICADO', 'Ya existe un usuario con ese email');
    }
    throw err;
  }
}

// --- Superficie admin ---------------------------------------------------

export async function crearUsuarioPanel(input: CrearUsuarioInput): Promise<UsuarioPanel> {
  const passwordHash = await hashPassword(input.password);
  const telefonoE164 = input.telefonoE164 ? normalizarTelefonoAR(input.telefonoE164) : undefined;

  try {
    const usuario = await Usuario.create({
      nombre: input.nombre,
      email: input.email,
      passwordHash,
      rol: input.rol,
      atiende: input.atiende,
      servicios: input.servicios,
      horarios: input.horarios,
      telefonoE164,
      // activo: no viene del input (el schema no lo declara) — nace true.
    });
    const objeto = usuario.toObject();
    return mapUsuarioParaPanel(objeto);
  } catch (err) {
    if (esEmailDuplicado(err)) {
      throw new ApiError(409, 'EMAIL_DUPLICADO', 'Ya existe un usuario con ese email');
    }
    throw err;
  }
}

export async function listarUsuariosPanel(): Promise<UsuarioPanel[]> {
  const usuarios = await Usuario.find({}).select(SELECT_SIN_PASSWORD).sort({ nombre: 1 }).lean();
  return usuarios.map(mapUsuarioParaPanel);
}

export async function obtenerUsuarioPanel(id: string): Promise<UsuarioPanel> {
  if (!Types.ObjectId.isValid(id)) {
    throw new ApiError(400, 'ID_INVALIDO', 'usuarioId inválido');
  }

  const usuario = await Usuario.findById(id).select(SELECT_SIN_PASSWORD).lean();
  if (!usuario) {
    throw new ApiError(404, 'USUARIO_NO_ENCONTRADO', 'El usuario no existe');
  }

  return mapUsuarioParaPanel(usuario);
}

export async function editarUsuarioPanel(
  id: string,
  input: EditarUsuarioInput
): Promise<UsuarioPanel & { turnosFuturosActivos?: number }> {
  if (!Types.ObjectId.isValid(id)) {
    throw new ApiError(400, 'ID_INVALIDO', 'usuarioId inválido');
  }

  const { telefonoE164, ...resto } = input;
  const set: Record<string, unknown> = { ...resto };
  if (telefonoE164 !== undefined) {
    set.telefonoE164 = normalizarTelefonoAR(telefonoE164);
  }

  const usuario = await aplicarCambiosUsuario(id, set);
  const panel = mapUsuarioParaPanel(usuario);

  // Desactivar informa, no bloquea (§15.9): el panel avisa "tiene N turnos
  // futuros" para que la dueña decida — no es una validación que impida el PATCH.
  if (input.activo === false) {
    const turnosFuturosActivos = await Turno.countDocuments({
      profesionalId: usuario._id,
      estado: { $in: ['pendiente', 'confirmado'] },
      inicio: { $gt: new Date() },
    });
    return { ...panel, turnosFuturosActivos };
  }

  return panel;
}

export async function resetPasswordUsuario(id: string, nueva: string): Promise<UsuarioPanel> {
  if (!Types.ObjectId.isValid(id)) {
    throw new ApiError(400, 'ID_INVALIDO', 'usuarioId inválido');
  }

  const passwordHash = await hashPassword(nueva);
  const usuario = await Usuario.findByIdAndUpdate(id, { $set: { passwordHash } }, { new: true })
    .select(SELECT_SIN_PASSWORD)
    .lean();
  if (!usuario) {
    throw new ApiError(404, 'USUARIO_NO_ENCONTRADO', 'El usuario no existe');
  }

  // Invalida cualquier sesión viva de este usuario (§13): sin esto la cookie
  // vieja seguía funcionando hasta el vencimiento del rolling (~14d, §16)
  // aunque ya nadie supiera la password anterior. Va directo contra la
  // colección de connect-mongo (mismo mongoUrl que mongoose, misma DB física
  // — dos conexiones, una sola base) en vez de por el store: la interfaz de
  // `session.Store` no tiene un "borrar por usuario", sólo por sid. Requiere
  // `stringify:false` en session.ts para que `usuarioId` sea un campo real
  // y no un blob JSON.
  await mongoose.connection.collection(SESIONES_COLLECTION).deleteMany({ 'session.usuarioId': usuario._id.toString() });

  return mapUsuarioParaPanel(usuario);
}

// --- Superficie "lo mío" — el id SIEMPRE viene de req.usuario.id, nunca de
// un :id de ruta (eso lo garantizan los callers en routes/mi.routes.ts). ---

export async function editarMiPerfil(usuarioId: string, input: MiPerfilInput): Promise<UsuarioPanel> {
  const usuario = await aplicarCambiosUsuario(usuarioId, { ...input });
  return mapUsuarioParaPanel(usuario);
}

export async function editarMisHorarios(usuarioId: string, horarios: IHorarioDia[]): Promise<UsuarioPanel> {
  const usuario = await aplicarCambiosUsuario(usuarioId, { horarios });
  return mapUsuarioParaPanel(usuario);
}

export async function cambiarMiPassword(usuarioId: string, actual: string, nueva: string): Promise<void> {
  const usuario = await Usuario.findById(usuarioId);
  if (!usuario) {
    throw new ApiError(404, 'USUARIO_NO_ENCONTRADO', 'El usuario no existe');
  }

  const passwordOk = await verifyPassword(usuario.passwordHash, actual);
  if (!passwordOk) {
    throw new ApiError(401, 'CREDENCIALES_INVALIDAS', 'La contraseña actual no es correcta');
  }

  usuario.passwordHash = await hashPassword(nueva);
  await usuario.save();
}
