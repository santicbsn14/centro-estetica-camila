import { Schema } from 'mongoose';

// Compartido por configuracion, usuarios y servicios (modelo-datos-turnos.md §4).
// Una sola forma, una sola función de intersección. Sin cruce de medianoche.

export interface IBloqueHorario {
  desde: string; // 'HH:mm', hora local
  hasta: string; // 'HH:mm', hora local
}

export interface IHorarioDia {
  dia: number; // 0 = domingo (convención de Date.getDay)
  bloques: IBloqueHorario[];
}

const bloqueHorarioSchema = new Schema<IBloqueHorario>(
  {
    desde: { type: String, required: true },
    hasta: { type: String, required: true },
  },
  { _id: false }
);

export const horarioDiaSchema = new Schema<IHorarioDia>(
  {
    dia: { type: Number, required: true, min: 0, max: 6 },
    bloques: { type: [bloqueHorarioSchema], required: true, default: [] },
  },
  { _id: false }
);
