import type { EstadoTurno } from '@shared/schemas/common.schema';
import './Badge.css';

// Tipado sobre EstadoTurno de @shared (shared/src/schemas/common.schema.ts) —
// reuso del enum del backend en vez de redefinir los 6 estados acá (frontend.md
// §4.0, "Reusar Zod de @shared donde aplique").
const ESTADO_LABEL: Record<EstadoTurno, string> = {
  pendiente: 'Pendiente',
  confirmado: 'Confirmado',
  rechazado: 'Rechazado',
  cancelado: 'Cancelado',
  completado: 'Completado',
  ausente: 'Ausente',
};

export interface BadgeProps {
  estado: EstadoTurno;
}

export function Badge({ estado }: BadgeProps) {
  return <span className={`badge badge--${estado}`}>{ESTADO_LABEL[estado]}</span>;
}
