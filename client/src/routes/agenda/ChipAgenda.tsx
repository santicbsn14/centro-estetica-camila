import { formatHora } from '../../lib/format/fecha';
import type { TurnoPanelLista } from '../turnos/types';

export interface ChipAgendaProps {
  turno: TurnoPanelLista;
  mostrarProfesional: boolean; // admin sin filtro de profesional
  onAbrir: (id: string) => void;
}

// "Nombre corto" de la profesional para el sufijo del chip: primera palabra.
function nombreCorto(nombre: string): string {
  return nombre.trim().split(/\s+/)[0] ?? nombre;
}

// Chip de la agenda (frontend.md §4.14): `HH:mm–HH:mm · clienta`, truncado
// con ellipsis y el texto completo en `title`. Color por estado con los mismos
// tokens del badge (§3). Sin chip de urgencia (eso es del listado).
export function ChipAgenda({ turno, mostrarProfesional, onAbrir }: ChipAgendaProps) {
  const partes = [`${formatHora(turno.inicio)}–${formatHora(turno.fin)}`, turno.clienteSnapshot.nombre];
  if (mostrarProfesional) partes.push(nombreCorto(turno.profesional.nombre));
  const texto = partes.join(' · ');
  const title = turno.fueraDeHorario ? `${texto} (fuera de horario)` : texto;

  return (
    <button
      type="button"
      className={`agenda-chip agenda-chip--${turno.estado}`}
      title={title}
      onClick={() => onAbrir(turno.id)}
    >
      <span className="agenda-chip__texto num">{texto}</span>
      {turno.fueraDeHorario ? (
        <span className="flag agenda-chip__flag" title="Cargado fuera de la grilla habitual">
          fuera de horario
        </span>
      ) : null}
    </button>
  );
}
