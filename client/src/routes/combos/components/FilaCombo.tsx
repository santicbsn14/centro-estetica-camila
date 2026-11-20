import { centavosAPesos } from '../../../lib/format/plata';
import type { ExperienciaPanel } from '../types';

export interface FilaComboProps {
  combo: ExperienciaPanel;
  onAbrir: (id: string) => void;
}

// Fila de listado (frontend.md §4.5.1): nombre(+desc) · ítems incluidos ·
// precio(+"oculto en la web") · estado. Inactivos atenuados. La fila entera
// abre el drawer (Desactivar/Activar vive ahí), mismo patrón que FilaServicio.
// Reusa las clases .tag-servicio de ServiciosPage.css (mismos tokens).
export function FilaCombo({ combo, onAbrir }: FilaComboProps) {
  const n = combo.incluye.length;
  return (
    <div
      className={`fila-combo${combo.activo ? '' : ' fila-combo--inactivo'}`}
      role="button"
      tabIndex={0}
      onClick={() => onAbrir(combo.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onAbrir(combo.id);
        }
      }}
    >
      <div className="fila-combo__celda fila-combo__nombre">
        <div className="fila-combo__nombre-texto">{combo.nombre}</div>
        {combo.descripcion ? <div className="fila-combo__desc">{combo.descripcion}</div> : null}
      </div>

      <div className="fila-combo__celda fila-combo__items num">{n === 1 ? '1 ítem' : `${n} ítems`}</div>

      <div className="fila-combo__celda fila-combo__precio num">
        {centavosAPesos(combo.precio)}
        {combo.mostrarPrecio ? null : <span className="fila-combo__precio-oculto">oculto en la web</span>}
      </div>

      <div className="fila-combo__celda">
        <span className={`tag-servicio tag-servicio--${combo.activo ? 'activo' : 'inactivo'}`}>
          {combo.activo ? 'Activo' : 'Inactivo'}
        </span>
      </div>
    </div>
  );
}
