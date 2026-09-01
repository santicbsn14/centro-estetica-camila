import './Toast.css';

export type ToastVariant = 'exito' | 'error' | 'info';

export interface ToastProps {
  mensaje: string;
  variant?: ToastVariant;
  onCerrar: () => void;
}

// Presentacional — un solo toast. El stack/timing vive en ToastProvider.
export function Toast({ mensaje, variant = 'info', onCerrar }: ToastProps) {
  return (
    <div className={`toast toast--${variant}`} role="status">
      <span>{mensaje}</span>
      <button type="button" className="toast__cerrar" onClick={onCerrar} aria-label="Cerrar aviso">
        ×
      </button>
    </div>
  );
}
