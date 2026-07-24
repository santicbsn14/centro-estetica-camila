import { Schema, model, Document, Types } from 'mongoose';

export type TipoNotificacion =
  | 'solicitud'
  | 'confirmacion'
  | 'recordatorio_24h'
  | 'cancelacion'
  | 'rechazo'
  | 'autorespuesta';
export type CanalNotificacion = 'whatsapp' | 'email';
export type EstadoNotificacion = 'pendiente' | 'enviando' | 'enviada' | 'fallida' | 'cancelada';

export interface IErrorNotificacion {
  codigo: string;
  mensaje: string;
}

export interface INotificacion extends Document {
  turnoId: Types.ObjectId;
  tipo: TipoNotificacion;
  canal: CanalNotificacion;
  destino: string; // E164 o email, snapshot

  programadaPara: Date; // UTC
  estado: EstadoNotificacion;
  intentos: number;
  proximoIntento?: Date;

  proveedorSid?: string;
  proveedorEstado?: string; // queued / sent / delivered / read / failed
  payloadEnviado?: Record<string, unknown>;
  error?: IErrorNotificacion;

  creadaEn: Date;
  enviadaEn?: Date;
}

const notificacionSchema = new Schema<INotificacion>(
  {
    turnoId: { type: Schema.Types.ObjectId, ref: 'Turno', required: true },
    tipo: {
      type: String,
      enum: ['solicitud', 'confirmacion', 'recordatorio_24h', 'cancelacion', 'rechazo', 'autorespuesta'],
      required: true,
    },
    canal: { type: String, enum: ['whatsapp', 'email'], required: true },
    destino: { type: String, required: true },

    programadaPara: { type: Date, required: true },
    estado: {
      type: String,
      enum: ['pendiente', 'enviando', 'enviada', 'fallida', 'cancelada'],
      required: true,
      default: 'pendiente',
    },
    intentos: { type: Number, required: true, default: 0 },
    proximoIntento: { type: Date },

    proveedorSid: { type: String },
    proveedorEstado: { type: String },
    payloadEnviado: { type: Schema.Types.Mixed },
    error: {
      codigo: { type: String },
      mensaje: { type: String },
    },

    enviadaEn: { type: Date },
  },
  { timestamps: { createdAt: 'creadaEn', updatedAt: false } }
);

notificacionSchema.index({ turnoId: 1, tipo: 1, canal: 1 }, { unique: true }); // idempotencia
notificacionSchema.index({ estado: 1, programadaPara: 1 }); // worker de envío
notificacionSchema.index({ proveedorSid: 1 }, { sparse: true }); // webhook de Twilio

export const Notificacion = model<INotificacion>('Notificacion', notificacionSchema, 'notificaciones');
