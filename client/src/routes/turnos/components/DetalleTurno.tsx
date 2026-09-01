import { Badge } from '../../../components/ui';
import { aLocal, etiquetaDia, formatHora } from '../../../lib/format/fecha';
import { centavosAPesos } from '../../../lib/format/plata';
import type { TurnoPanel } from '../types';

// Nunca se resuelve "quién" con más detalle que esto: porTipo:'usuario' cubre
// TANTO a la profesional como a Camila (admin) — el modelo no distingue cuál
// de las dos actuó (server/src/models/turno.model.ts, PorTipoHistorial). Ver
// ⚠ REVISAR EN WEB en frontend.md §5 sobre la redacción de porTipo del
// encargo ("clienta/profesional/sistema") vs. el enum real del backend
// ('cliente'|'usuario'|'sistema').
const ETIQUETA_POR_TIPO: Record<TurnoPanel['historial'][number]['porTipo'], string> = {
  cliente: 'la clienta',
  usuario: 'el equipo del salón',
  sistema: 'el sistema',
};

const ETIQUETA_ESTADO_HISTORIAL: Record<TurnoPanel['estado'], string> = {
  pendiente: 'Solicitado',
  confirmado: 'Confirmado',
  rechazado: 'Rechazado',
  cancelado: 'Cancelado',
  completado: 'Completado',
  ausente: 'No asistió',
};

const ETIQUETA_ORIGEN: Record<TurnoPanel['origen'], string> = {
  web: 'Reserva web',
  admin: 'Cargado en el salón',
};

function formatFechaHistorial(iso: string): string {
  const dt = aLocal(iso);
  return `${etiquetaDia(dt)} · ${dt.toFormat('HH:mm')}`;
}

export interface DetalleTurnoProps {
  turno: TurnoPanel;
}

// Cuerpo del drawer de detalle (frontend.md §4.4): cliente, servicio/duración/
// precio, profesional, horario, origen + historial en timeline. NUNCA
// tokenHash ni clientes.notas — ninguno de los dos existe en TurnoPanel
// (client/src/routes/turnos/types.ts), así que no hay nada que filtrar acá:
// la no-fuga ya la garantiza el shape que llega del server.
export function DetalleTurno({ turno }: DetalleTurnoProps) {
  const inicio = aLocal(turno.inicio);

  return (
    <div className="detalle-turno">
      <Badge estado={turno.estado} />
      <h2 className="detalle-turno__cliente">{turno.clienteSnapshot.nombre}</h2>
      <div className="detalle-turno__meta">
        <a href={`tel:${turno.clienteSnapshot.telefonoE164}`}>{turno.clienteSnapshot.telefonoE164}</a>
        {turno.clienteSnapshot.email ? (
          <a href={`mailto:${turno.clienteSnapshot.email}`}>{turno.clienteSnapshot.email}</a>
        ) : (
          <span className="detalle-turno__muted">sin email</span>
        )}
      </div>

      {turno.fueraDeHorario ? (
        <div className="detalle-turno__aviso">Cargado fuera de la grilla habitual de la profesional.</div>
      ) : null}

      <dl className="detalle-turno__filas">
        <div className="detalle-turno__fila">
          <dt>Servicio</dt>
          <dd>{turno.servicio.nombre}</dd>
        </div>
        <div className="detalle-turno__fila">
          <dt>Duración</dt>
          <dd className="num">{turno.servicio.duracionMin} min</dd>
        </div>
        <div className="detalle-turno__fila">
          <dt>Precio</dt>
          <dd className="num">{centavosAPesos(turno.servicio.precio)}</dd>
        </div>
        <div className="detalle-turno__fila">
          <dt>Profesional</dt>
          <dd>{turno.profesional.nombre}</dd>
        </div>
        <div className="detalle-turno__fila">
          <dt>Fecha</dt>
          <dd>{etiquetaDia(inicio)}</dd>
        </div>
        <div className="detalle-turno__fila">
          <dt>Horario</dt>
          <dd className="num">
            {formatHora(turno.inicio)}–{formatHora(turno.fin)}
          </dd>
        </div>
        <div className="detalle-turno__fila">
          <dt>Origen</dt>
          <dd>{ETIQUETA_ORIGEN[turno.origen]}</dd>
        </div>
      </dl>

      <p className="detalle-turno__seccion">Historial</p>
      <ul className="detalle-turno__timeline">
        {turno.historial.map((entrada, i) => (
          <li key={i}>
            <div className="detalle-turno__timeline-evento">
              {ETIQUETA_ESTADO_HISTORIAL[entrada.estado]}
              {entrada.motivo ? ` — ${entrada.motivo}` : ''}
            </div>
            <div className="detalle-turno__timeline-detalle">
              {ETIQUETA_POR_TIPO[entrada.porTipo]} · {formatFechaHistorial(entrada.fecha)}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
