import { Schema, model, Document, Types } from 'mongoose';

export type EstadoTurno = 'pendiente' | 'confirmado' | 'rechazado' | 'cancelado' | 'completado' | 'ausente';
export type OrigenTurno = 'web' | 'admin';
export type PorTipoHistorial = 'cliente' | 'usuario' | 'sistema';

export interface IClienteSnapshot {
  nombre: string;
  telefonoE164: string;
  email?: string;
}

export interface IServicioSnapshot {
  servicioId: Types.ObjectId;
  nombre: string;
  duracionMin: number;
  bufferPostMin: number;
  precio: number;
}

export interface IHistorialEntry {
  estado: EstadoTurno;
  fecha: Date;
  porTipo: PorTipoHistorial;
  porId?: Types.ObjectId;
  motivo?: string;
}

export interface ITurno extends Document {
  codigo: string; // legible, para hablar por teléfono ('TRN-4821')

  clienteId: Types.ObjectId;
  clienteSnapshot: IClienteSnapshot;
  profesionalId: Types.ObjectId;
  profesionalNombre: string;

  servicio: IServicioSnapshot; // snapshot, uno solo por turno

  inicio: Date; // UTC
  fin: Date; // inicio + duracionMin
  finBloqueo: Date; // fin + bufferPostMin

  estado: EstadoTurno;
  expiraEn?: Date; // sólo mientras está pendiente
  historial: IHistorialEntry[];

  origen: OrigenTurno;
  fueraDeHorario: boolean; // el admin pisó la política
  tokenHash?: string; // se guarda el hash, no el token

  creadoEn: Date;
  actualizadoEn: Date;
}

const clienteSnapshotSchema = new Schema<IClienteSnapshot>(
  {
    nombre: { type: String, required: true },
    telefonoE164: { type: String, required: true },
    email: { type: String },
  },
  { _id: false }
);

const servicioSnapshotSchema = new Schema<IServicioSnapshot>(
  {
    servicioId: { type: Schema.Types.ObjectId, ref: 'Servicio', required: true },
    nombre: { type: String, required: true },
    duracionMin: { type: Number, required: true },
    bufferPostMin: { type: Number, required: true },
    precio: { type: Number, required: true },
  },
  { _id: false }
);

const historialEntrySchema = new Schema<IHistorialEntry>(
  {
    estado: {
      type: String,
      enum: ['pendiente', 'confirmado', 'rechazado', 'cancelado', 'completado', 'ausente'],
      required: true,
    },
    fecha: { type: Date, required: true, default: Date.now },
    porTipo: { type: String, enum: ['cliente', 'usuario', 'sistema'], required: true },
    porId: { type: Schema.Types.ObjectId },
    motivo: { type: String },
  },
  { _id: false }
);

const turnoSchema = new Schema<ITurno>(
  {
    codigo: { type: String, required: true },

    clienteId: { type: Schema.Types.ObjectId, ref: 'Cliente', required: true },
    clienteSnapshot: { type: clienteSnapshotSchema, required: true },
    profesionalId: { type: Schema.Types.ObjectId, ref: 'Usuario', required: true },
    profesionalNombre: { type: String, required: true },

    servicio: { type: servicioSnapshotSchema, required: true },

    inicio: { type: Date, required: true },
    fin: { type: Date, required: true },
    finBloqueo: { type: Date, required: true },

    estado: {
      type: String,
      enum: ['pendiente', 'confirmado', 'rechazado', 'cancelado', 'completado', 'ausente'],
      required: true,
      default: 'pendiente',
    },
    expiraEn: { type: Date },
    historial: { type: [historialEntrySchema], required: true, default: [] },

    origen: { type: String, enum: ['web', 'admin'], required: true },
    fueraDeHorario: { type: Boolean, required: true, default: false },
    tokenHash: { type: String },
  },
  { timestamps: { createdAt: 'creadoEn', updatedAt: 'actualizadoEn' } }
);

turnoSchema.index({ profesionalId: 1, estado: 1, inicio: 1 }); // disponibilidad
turnoSchema.index({ estado: 1, expiraEn: 1 }); // worker de vencimiento
turnoSchema.index({ estado: 1, inicio: 1 }); // panel
turnoSchema.index({ tokenHash: 1 }, { unique: true, sparse: true });
turnoSchema.index({ codigo: 1 }, { unique: true });
turnoSchema.index({ clienteId: 1, inicio: -1 }); // historial

export const Turno = model<ITurno>('Turno', turnoSchema, 'turnos');
