import { Schema, model, Document } from 'mongoose';
import { horarioDiaSchema, IHorarioDia } from './subschemas/horario.subschema';

export interface IServicio extends Document {
  nombre: string;
  descripcion?: string;
  duracionMin: number;
  bufferPostMin: number; // limpieza; ocupa agenda, no se cobra
  precio: number; // centavos, entero
  mostrarPrecio: boolean;
  horarios: IHorarioDia[] | null; // null = hereda de la profesional
  orden: number;
  activo: boolean;
  creadoEn: Date;
  actualizadoEn: Date;
}

const servicioSchema = new Schema<IServicio>(
  {
    nombre: { type: String, required: true, trim: true },
    descripcion: { type: String },
    duracionMin: { type: Number, required: true, min: 1 },
    bufferPostMin: { type: Number, required: true, min: 0, default: 0 },
    precio: { type: Number, required: true, min: 0 },
    mostrarPrecio: { type: Boolean, required: true, default: true },
    horarios: {
      type: [horarioDiaSchema],
      default: null,
      // El array vacío está prohibido: significaría "nunca disponible" y se
      // escribe casi igual que null. O es null, o tiene al menos un bloque.
      validate: {
        validator: (v: IHorarioDia[] | null) => v === null || v === undefined || v.length > 0,
        message: 'horarios no puede ser un array vacío: usar null para heredar de la profesional',
      },
    },
    orden: { type: Number, required: true, default: 0 },
    activo: { type: Boolean, required: true, default: true },
  },
  { timestamps: { createdAt: 'creadoEn', updatedAt: 'actualizadoEn' } }
);

servicioSchema.index({ activo: 1, orden: 1 }); // catálogo público
servicioSchema.index({ nombre: 1 }, { unique: true, collation: { locale: 'es', strength: 2 } });

export const Servicio = model<IServicio>('Servicio', servicioSchema, 'servicios');
