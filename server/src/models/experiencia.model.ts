import { Schema, model, Document } from 'mongoose';

// Combos y experiencias (modelo-datos-turnos.md §4 `experiencias`, §15.7.2).
// Colección aparte, NO un servicio con flag: servicios está atado a la agenda
// y cada consumidor tendría que filtrar el flag. Los combos no se agendan.
export interface IExperiencia extends Document {
  nombre: string;
  descripcion?: string;
  incluye: string[]; // texto libre, 2..8 — NO referencia servicios
  precio: number; // centavos, entero; lo fija Camila, no es la suma
  mostrarPrecio: boolean;
  imagenUrl?: string;
  orden: number;
  activo: boolean; // sin DELETE: borrado lógico
  creadoEn: Date;
  actualizadoEn: Date;
}

const experienciaSchema = new Schema<IExperiencia>(
  {
    nombre: { type: String, required: true, trim: true },
    descripcion: { type: String },
    incluye: {
      type: [String],
      required: true,
      validate: {
        validator: (v: string[]) => Array.isArray(v) && v.length >= 2 && v.length <= 8,
        message: 'incluye debe tener entre 2 y 8 ítems',
      },
    },
    precio: { type: Number, required: true, min: 0 },
    mostrarPrecio: { type: Boolean, required: true, default: true },
    imagenUrl: { type: String },
    orden: { type: Number, required: true, default: 0 },
    activo: { type: Boolean, required: true, default: true },
  },
  { timestamps: { createdAt: 'creadoEn', updatedAt: 'actualizadoEn' } }
);

experienciaSchema.index({ activo: 1, orden: 1 }); // listado público
experienciaSchema.index({ nombre: 1 }, { unique: true, collation: { locale: 'es', strength: 2 } });

export const Experiencia = model<IExperiencia>('Experiencia', experienciaSchema, 'experiencias');
