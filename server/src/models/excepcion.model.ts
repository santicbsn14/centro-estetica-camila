import { Schema, model, Document, Types } from 'mongoose';

export type TipoExcepcion = 'feriado' | 'vacaciones' | 'bloqueo';

export interface IExcepcion extends Document {
  profesionalId: Types.ObjectId | null; // null = todo el centro
  desde: Date; // UTC
  hasta: Date; // UTC
  tipo: TipoExcepcion;
  motivo?: string;
  creadoPor: Types.ObjectId;
  creadoEn: Date;
  actualizadoEn: Date;
}

const excepcionSchema = new Schema<IExcepcion>(
  {
    profesionalId: { type: Schema.Types.ObjectId, ref: 'Usuario', default: null },
    desde: { type: Date, required: true },
    hasta: { type: Date, required: true },
    tipo: { type: String, enum: ['feriado', 'vacaciones', 'bloqueo'], required: true },
    motivo: { type: String },
    creadoPor: { type: Schema.Types.ObjectId, ref: 'Usuario', required: true },
  },
  { timestamps: { createdAt: 'creadoEn', updatedAt: 'actualizadoEn' } }
);

excepcionSchema.index({ profesionalId: 1, hasta: 1, desde: 1 }); // consultar con $in: [null, id]

export const Excepcion = model<IExcepcion>('Excepcion', excepcionSchema, 'excepciones');
