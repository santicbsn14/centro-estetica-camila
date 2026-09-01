import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';
import './Drawer.css';

export interface DrawerProps {
  abierto: boolean;
  onCerrar: () => void;
  titulo?: string;
  children: ReactNode;
  // Barra fija al pie, fuera del área con scroll — pensada para acciones
  // (turnos: aprobar/rechazar/cancelar; más adelante, "Guardar" en los
  // drawers de alta/edición de servicios/usuarios, frontend.md §4.5/§4.6).
  // Sin esto, un `children` largo empuja los botones fuera de vista.
  footer?: ReactNode;
}

// Drawer lateral (frontend.md §4.4: "Detalle en drawer lateral (no ruta
// aparte)") — genérico, sin conocer qué muestra adentro. El overlay cierra al
// click; el contenido se decide en cada pantalla que lo use.
export function Drawer({ abierto, onCerrar, titulo, children, footer }: DrawerProps) {
  if (!abierto) return null;

  return createPortal(
    <div className="drawer-overlay" onClick={onCerrar}>
      <aside
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="drawer__header">
          {titulo ? <h2 className="drawer__titulo">{titulo}</h2> : <span />}
          <button type="button" className="drawer__cerrar" onClick={onCerrar} aria-label="Cerrar">
            ×
          </button>
        </div>
        <div className="drawer__contenido">{children}</div>
        {footer ? <div className="drawer__footer">{footer}</div> : null}
      </aside>
    </div>,
    document.body
  );
}
