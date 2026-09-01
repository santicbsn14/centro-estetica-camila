import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Toast, type ToastVariant } from './Toast';

interface ToastItem {
  id: number;
  mensaje: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  mostrarToast: (mensaje: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

const DURACION_MS = 4000;

// Infra mínima para que las pantallas puedan disparar un toast sin manejar
// su propio stack (ej. "turno aprobado", 409 al transicionar un estado).
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const cerrar = useCallback((id: number) => {
    setItems((actual) => actual.filter((item) => item.id !== id));
  }, []);

  const mostrarToast = useCallback(
    (mensaje: string, variant: ToastVariant = 'info') => {
      const id = Date.now() + Math.random();
      setItems((actual) => [...actual, { id, mensaje, variant }]);
      setTimeout(() => cerrar(id), DURACION_MS);
    },
    [cerrar]
  );

  const value = useMemo(() => ({ mostrarToast }), [mostrarToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {createPortal(
        <div className="toast-viewport">
          {items.map((item) => (
            <Toast key={item.id} mensaje={item.mensaje} variant={item.variant} onCerrar={() => cerrar(item.id)} />
          ))}
        </div>,
        document.body
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast() usado fuera de <ToastProvider>');
  }
  return ctx;
}
