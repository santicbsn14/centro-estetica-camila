import { Schema, model, Document } from 'mongoose';

export type MetaEstadoPlantilla = 'aprobada' | 'pendiente' | 'rechazada';

export interface IPlantilla extends Document {
  tipo: string;
  canal: 'whatsapp' | 'email';

  metaNombre: string;
  metaIdioma: string;
  metaEstado: MetaEstadoPlantilla;
  contentSid?: string; // HX... de Twilio — el ID técnico con el que se envía, distinto de metaNombre (§4)
  variables: string[]; // orden = significado: las variables de Meta son posicionales

  asunto?: string; // canal email
  cuerpoHtml?: string;

  activa: boolean;
  creadoEn: Date;
  actualizadoEn: Date;
}

const plantillaSchema = new Schema<IPlantilla>(
  {
    tipo: { type: String, required: true },
    canal: { type: String, enum: ['whatsapp', 'email'], required: true },

    metaNombre: { type: String, required: true },
    metaIdioma: { type: String, required: true, default: 'es_AR' },
    metaEstado: { type: String, enum: ['aprobada', 'pendiente', 'rechazada'], required: true, default: 'pendiente' },
    contentSid: { type: String },
    variables: { type: [String], required: true, default: [] },

    asunto: { type: String },
    cuerpoHtml: { type: String },

    activa: { type: Boolean, required: true, default: true },
  },
  { timestamps: { createdAt: 'creadoEn', updatedAt: 'actualizadoEn' } }
);

// Separada a propósito de notificaciones.tipo: metaNombre es un identificador
// externo que Meta puede rechazar y hay que reenviar con otro nombre.
plantillaSchema.index({ tipo: 1, canal: 1 }, { unique: true, partialFilterExpression: { activa: true } });

export const Plantilla = model<IPlantilla>('Plantilla', plantillaSchema, 'plantillas');
