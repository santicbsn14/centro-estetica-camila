export interface ToastState {
  mensaje: string;
  tipo: 'info' | 'warn';
}

interface Props {
  toast: ToastState | null;
  visible: boolean;
}

// Clonado de .toast/.toast.show/.toast.warn del mockup. `toast` guarda el
// último mensaje mostrado aunque `visible` ya haya pasado a false — así el
// fade-out (CSS, opacity+translate) tiene contenido que animar en vez de
// desaparecer en seco (mismo comportamiento que el mockup, que nunca vacía
// el textContent, sólo saca la clase "show").
export function Toast({ toast, visible }: Props) {
  return (
    <div
      className={`toast${visible ? ' toast--show' : ''}${toast?.tipo === 'warn' ? ' toast--warn' : ''}`}
      role="status"
      aria-live="polite"
    >
      <span>{toast?.mensaje}</span>
    </div>
  );
}
