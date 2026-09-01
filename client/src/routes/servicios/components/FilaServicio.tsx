import { centavosAPesos } from '../../../lib/format/plata';
import type { ServicioPanel } from '../types';

export interface FilaServicioProps {
  servicio: ServicioPanel;
  onAbrir: (id: string) => void;
}

// Fila de listado (frontend.md §4.5): nombre(+desc) · duración · limpieza ·
// precio(+"oculto en la web") · horario(Hereda/Propio) · estado. Inactivos
// atenuados. Sin acciones inline — clonado del mockup, la fila entera abre el
// drawer (Desactivar/Activar vive ahí, no acá — mismo motivo que turnos: el
// server de servicios no expone un DELETE, sólo PATCH activo).
export function FilaServicio({ servicio, onAbrir }: FilaServicioProps) {
  return (
    <div
      className={`fila-servicio${servicio.activo ? '' : ' fila-servicio--inactivo'}`}
      role="button"
      tabIndex={0}
      onClick={() => onAbrir(servicio.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onAbrir(servicio.id);
        }
      }}
    >
      <div className="fila-servicio__celda fila-servicio__nombre">
        <div className="fila-servicio__nombre-texto">{servicio.nombre}</div>
        {servicio.descripcion ? <div className="fila-servicio__desc">{servicio.descripcion}</div> : null}
      </div>

      <div className="fila-servicio__celda fila-servicio__dur num">{servicio.duracionMin} min</div>
      <div className="fila-servicio__celda fila-servicio__buf num">+{servicio.bufferPostMin} min</div>

      <div className="fila-servicio__celda fila-servicio__precio num">
        {centavosAPesos(servicio.precio)}
        {servicio.mostrarPrecio ? null : <span className="fila-servicio__precio-oculto">oculto en la web</span>}
      </div>

      <div className="fila-servicio__celda">
        <TagServicio variante={servicio.horarios === null ? 'hereda' : 'propio'} />
      </div>

      <div className="fila-servicio__celda">
        <TagServicio variante={servicio.activo ? 'activo' : 'inactivo'} />
      </div>
    </div>
  );
}

const TAG_LABEL: Record<'activo' | 'inactivo' | 'propio' | 'hereda', string> = {
  activo: 'Activo',
  inactivo: 'Inactivo',
  propio: 'Propio',
  hereda: 'Hereda',
};

// Sin @shared que reusar acá (activo/hereda no son EstadoTurno, Badge no
// aplica — frontend.md §4.0 pide reusar Zod "donde aplique", no forzarlo
// donde no hay contrato que reusar). Los colores SÍ reusan los tokens de
// estado de turno ya cotejados (confirmado/cancelado) en vez de hexs nuevos.
function TagServicio({ variante }: { variante: 'activo' | 'inactivo' | 'propio' | 'hereda' }) {
  return <span className={`tag-servicio tag-servicio--${variante}`}>{TAG_LABEL[variante]}</span>;
}
