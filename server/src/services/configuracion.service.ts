import { Configuracion } from '../models';
import { IHorarioDia } from '../models/subschemas/horario.subschema';
import { IContactoCentro } from '../models/configuracion.model';
import { EditarConfiguracionInput } from '@shared/schemas/configuracion.schema';
import { normalizarTelefonoAR } from './telefono';
import { ApiError } from '../utils/apiError';

// CRUD administrativo de configuración — singleton (modelo-datos-turnos.md
// §15.8). Sin transacción: documento único, findByIdAndUpdate atómico.
// El singleton nace del seed (scripts/seedAdmin.ts); si no existe, es un
// error de operación (seed no corrido), no algo que este service resuelva
// creándolo en silencio.

interface ConfiguracionLean {
  _id: string;
  nombre: string;
  timezone: string;
  horarios: IHorarioDia[];
  pasoGrillaMin: number;
  antelacionMinimaHoras: number;
  ventanaMaximaDias: number;
  cancelacionMinimaHoras: number;
  vencimientoPendienteHoras: number;
  contacto: IContactoCentro;
  creadoEn: Date;
  actualizadoEn: Date;
}

// Sin recorte: admin-only, sin superficie pública que obligue a esconder campos.
export interface ConfiguracionPanel {
  id: string;
  nombre: string;
  timezone: string;
  horarios: IHorarioDia[];
  pasoGrillaMin: number;
  antelacionMinimaHoras: number;
  ventanaMaximaDias: number;
  cancelacionMinimaHoras: number;
  vencimientoPendienteHoras: number;
  contacto: IContactoCentro;
  creadoEn: string;
  actualizadoEn: string;
}

function mapConfiguracionParaPanel(config: ConfiguracionLean): ConfiguracionPanel {
  return {
    id: config._id,
    nombre: config.nombre,
    timezone: config.timezone,
    horarios: config.horarios,
    pasoGrillaMin: config.pasoGrillaMin,
    antelacionMinimaHoras: config.antelacionMinimaHoras,
    ventanaMaximaDias: config.ventanaMaximaDias,
    cancelacionMinimaHoras: config.cancelacionMinimaHoras,
    vencimientoPendienteHoras: config.vencimientoPendienteHoras,
    contacto: config.contacto,
    creadoEn: config.creadoEn.toISOString(),
    actualizadoEn: config.actualizadoEn.toISOString(),
  };
}

function requerirConfig<T extends ConfiguracionLean | null>(config: T): asserts config is Exclude<T, null> {
  if (!config) {
    throw new ApiError(500, 'CONFIG_FALTANTE', 'Falta configurar el centro — correr el seed');
  }
}

export async function obtenerConfiguracionPanel(): Promise<ConfiguracionPanel> {
  const config = await Configuracion.findById('centro').lean();
  requerirConfig(config);
  return mapConfiguracionParaPanel(config);
}

export async function editarConfiguracionPanel(input: EditarConfiguracionInput): Promise<ConfiguracionPanel> {
  const { contacto, ...resto } = input;

  const set: Partial<ConfiguracionLean> = { ...resto };
  if (contacto) {
    // Normalización server-side (§10) — la misma que usa POST /api/turnos.
    // Nunca se persiste el crudo del body.
    set.contacto = {
      telefonoE164: normalizarTelefonoAR(contacto.telefonoE164),
      email: contacto.email,
      direccion: contacto.direccion,
    };
  }

  const config = await Configuracion.findByIdAndUpdate('centro', { $set: set }, { new: true, runValidators: true }).lean();
  requerirConfig(config);
  return mapConfiguracionParaPanel(config);
}
