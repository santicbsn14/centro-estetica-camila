import { Schema, model, Document, Types } from 'mongoose';
import { horarioDiaSchema, IHorarioDia } from './subschemas/horario.subschema';

export type RolUsuario = 'admin' | 'profesional';

export interface IUsuario extends Document {
  nombre: string;
  email: string;
  passwordHash: string;
  rol: RolUsuario;
  atiende: boolean; // aparece en el selector público
  servicios: Types.ObjectId[];
  horarios: IHorarioDia[];
  telefonoE164?: string; // aviso de turno nuevo
  activo: boolean;
  creadoEn: Date;
  actualizadoEn: Date;
}

const usuarioSchema = new Schema<IUsuario>(
  {
    nombre: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    rol: { type: String, enum: ['admin', 'profesional'], required: true },
    // Separado de rol: permite que la dueña administre y atienda con un solo
    // usuario, sin dos agendas para la misma persona.
    atiende: { type: Boolean, required: true, default: false },
    servicios: [{ type: Schema.Types.ObjectId, ref: 'Servicio' }],
    horarios: { type: [horarioDiaSchema], required: true, default: [] },
    telefonoE164: { type: String },
    activo: { type: Boolean, required: true, default: true },
  },
  { timestamps: { createdAt: 'creadoEn', updatedAt: 'actualizadoEn' } }
);

usuarioSchema.index({ email: 1 }, { unique: true });
usuarioSchema.index({ activo: 1, atiende: 1, servicios: 1 }); // "quiénes prestan este servicio"

export const Usuario = model<IUsuario>('Usuario', usuarioSchema, 'usuarios');
