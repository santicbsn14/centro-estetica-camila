import { Schema, model, Document } from 'mongoose';

// Categorías de servicio autoadministrables (modelo-datos-turnos.md §4
// `categorias`, §15.7.1). Sin `activo`: una categoría sin servicios activos
// no se muestra en la web; si sobra, se borra (DELETE físico — segunda
// excepción consciente a "borrado no existe", ningún turno la referencia).
export interface ICategoria extends Document {
  nombre: string; // como lo escribe Camila; el catálogo público la pasa a mayúsculas por CSS
  orden: number;
  creadoEn: Date;
  actualizadoEn: Date;
}

const categoriaSchema = new Schema<ICategoria>(
  {
    nombre: { type: String, required: true, trim: true },
    orden: { type: Number, required: true, default: 0 },
  },
  { timestamps: { createdAt: 'creadoEn', updatedAt: 'actualizadoEn' } }
);

// Único case-insensitive — misma collation que servicios.nombre (§9). Sin la
// collation el unique es case-sensitive y "Uñas"/"uñas" pasan ambas.
categoriaSchema.index({ nombre: 1 }, { unique: true, collation: { locale: 'es', strength: 2 } });

export const Categoria = model<ICategoria>('Categoria', categoriaSchema, 'categorias');
