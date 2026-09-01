import { Badge, Button } from '../../../components/ui';
import { formatHora } from '../../../lib/format/fecha';
import { centavosAPesos } from '../../../lib/format/plata';
import type { TurnoPanelLista } from '../types';
import { ChipUrgencia } from './ChipUrgencia';

export interface FilaTurnoProps {
  turno: TurnoPanelLista;
  mostrarProfesional: boolean;
  ocupado: boolean; // hay una acción en curso para este turno — deshabilita los botones inline
  onAbrir: (id: string) => void;
  onAprobar: (id: string) => void;
  onRechazar: (id: string) => void;
}

// Fila de listado (frontend.md §4.4): hora · cliente(+tel) · servicio(+precio)
// · profesional(sólo admin) · estado/acciones. Acciones inline SÓLO en
// pendientes (aprobar/rechazar + chip de urgencia); confirmado muestra badge
// + abre el drawer para el resto de las acciones; terminales sólo badge.
export function FilaTurno({ turno, mostrarProfesional, ocupado, onAbrir, onAprobar, onRechazar }: FilaTurnoProps) {
  const clases = ['fila-turno', mostrarProfesional ? '' : 'fila-turno--sin-profesional'].filter(Boolean).join(' ');

  return (
    <div
      className={clases}
      role="button"
      tabIndex={0}
      onClick={() => onAbrir(turno.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onAbrir(turno.id);
        }
      }}
    >
      <div className="fila-turno__celda fila-turno__hora">
        <div className="fila-turno__hora-inicio num">{formatHora(turno.inicio)}</div>
        <div className="fila-turno__hora-fin num">
          {formatHora(turno.fin)} · {turno.servicio.duracionMin}'
        </div>
      </div>

      <div className="fila-turno__celda fila-turno__cliente">
        <div className="fila-turno__cliente-nombre">
          {turno.clienteSnapshot.nombre}
          {turno.fueraDeHorario ? (
            <span className="flag" title="Cargado fuera de la grilla habitual">
              fuera de horario
            </span>
          ) : null}
        </div>
        <a
          className="fila-turno__telefono num"
          href={`tel:${turno.clienteSnapshot.telefonoE164}`}
          onClick={(e) => e.stopPropagation()}
        >
          {turno.clienteSnapshot.telefonoE164}
        </a>
      </div>

      <div className="fila-turno__celda fila-turno__servicio">
        <div className="fila-turno__servicio-nombre">{turno.servicio.nombre}</div>
        <div className="fila-turno__servicio-precio num">{centavosAPesos(turno.servicio.precio)}</div>
      </div>

      {mostrarProfesional ? (
        <div className="fila-turno__celda fila-turno__profesional">{turno.profesional.nombre}</div>
      ) : null}

      <div className="fila-turno__celda fila-turno__acciones">
        {turno.estado === 'pendiente' ? (
          <>
            {turno.expiraEn ? <ChipUrgencia expiraEn={turno.expiraEn} /> : null}
            <Button
              variant="primary"
              size="sm"
              disabled={ocupado}
              onClick={(e) => {
                e.stopPropagation();
                onAprobar(turno.id);
              }}
            >
              Aprobar
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={ocupado}
              onClick={(e) => {
                e.stopPropagation();
                onRechazar(turno.id);
              }}
            >
              Rechazar
            </Button>
          </>
        ) : (
          <Badge estado={turno.estado} />
        )}
      </div>
    </div>
  );
}
