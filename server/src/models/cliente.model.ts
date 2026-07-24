import { Schema, model, Document } from 'mongoose';

export interface ICliente extends Document {
  telefonoE164: string; // índice único — es la identidad
  telefonoCrudo: string; // lo que tipeó, para auditar
  nombre: string;
  email?: string;
  notas?: string; // interno, sólo admin — nunca en endpoint público ni en mensajes
  optOut: boolean;
  creadoEn: Date;
  actualizadoEn: Date;
}

const clienteSchema = new Schema<ICliente>(
  {
    telefonoE164: { type: String, required: true },
    telefonoCrudo: { type: String, required: true },
    nombre: { type: String, required: true, trim: true },
    email: { type: String, lowercase: true, trim: true },
    notas: { type: String },
    optOut: { type: Boolean, required: true, default: false },
  },
  { timestamps: { createdAt: 'creadoEn', updatedAt: 'actualizadoEn' } }
);

clienteSchema.index({ telefonoE164: 1 }, { unique: true });

export const Cliente = model<ICliente>('Cliente', clienteSchema, 'clientes');
