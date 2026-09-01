import { Schema, model, Document } from 'mongoose';
import { horarioDiaSchema, IHorarioDia } from './subschemas/horario.subschema';

// Documento único (modelo-datos-turnos.md §4). _id fijo 'centro'.

export interface IContactoCentro {
  telefonoE164: string;
  email: string;
  direccion: string;
}

// Contador atómico del código de turno (§4/§13: DECISIÓN CERRADA,
// `TRN-{año}-####`). Interno — no se expone en ConfiguracionPanel ni es
// editable vía PATCH /api/admin/configuracion (editarConfiguracionSchema es
// `.strict()` y no lo declara, mismo criterio que excluye `timezone`).
// Opcional: no existe hasta que se crea el primer turno del año; ver
// generarCodigoTurno en turnos.service.ts.
export interface IContadorTurnosPorAnio {
  anio: number;
  ultimo: number;
}

export interface IConfiguracion extends Document<string> {
  nombre: string;
  timezone: string;
  horarios: IHorarioDia[]; // techo duro del centro
  pasoGrillaMin: number;
  antelacionMinimaHoras: number;
  ventanaMaximaDias: number;
  cancelacionMinimaHoras: number;
  vencimientoPendienteHoras: number;
  contacto: IContactoCentro;
  contadorTurnosPorAnio?: IContadorTurnosPorAnio;
  creadoEn: Date;
  actualizadoEn: Date;
}

const configuracionSchema = new Schema<IConfiguracion>(
  {
    _id: { type: String, default: 'centro' },
    nombre: { type: String, required: true },
    timezone: { type: String, required: true, default: 'America/Argentina/Buenos_Aires' },
    horarios: { type: [horarioDiaSchema], required: true, default: [] },
    pasoGrillaMin: { type: Number, required: true, default: 30 },
    // Doble función: evita reservas sobre la hora y garantiza tiempo de confirmar
    // antes del vencimiento del pendiente. Por eso 3 y no 2.
    antelacionMinimaHoras: { type: Number, required: true, default: 3 },
    ventanaMaximaDias: { type: Number, required: true, default: 60 },
    cancelacionMinimaHoras: { type: Number, required: true, default: 24 },
    vencimientoPendienteHoras: { type: Number, required: true, default: 12 },
    contacto: {
      telefonoE164: { type: String, required: true },
      email: { type: String, required: true },
      direccion: { type: String, required: true },
    },
    // Sin `required` ni `default`: no existe hasta el primer turno del año
    // (generarCodigoTurno lo inicializa con findOneAndUpdate atómico).
    contadorTurnosPorAnio: {
      anio: { type: Number },
      ultimo: { type: Number },
    },
  },
  { timestamps: { createdAt: 'creadoEn', updatedAt: 'actualizadoEn' } }
);

export const Configuracion = model<IConfiguracion>('Configuracion', configuracionSchema, 'configuracion');
