import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';
import './Input.css';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  // Hint bajo el campo en validación normal; error lo pisa visualmente
  // (frontend.md §4.3: "Validación inline (campo vacío ⇒ hint bajo el campo)").
  hint?: string;
  error?: string;
  // Slot opcional superpuesto al control (ej. toggle de visibilidad de
  // password, §4.3). Puramente presentacional — la lógica vive en quien lo usa.
  suffix?: ReactNode;
  // Simétrico a suffix, pegado a la izquierda (ej. "$" en el campo precio de
  // servicios, §4.5 — el mockup lo llama `.prefix`). Nombrado en español
  // porque `prefix` ya es un atributo HTML real (RDFa) heredado de
  // InputHTMLAttributes — un prop `prefix: ReactNode` choca con el
  // `prefix?: string` de React, TS2430.
  prefijo?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, hint, error, id, className, suffix, prefijo, ...props }, ref) => {
    const idGenerado = useId();
    const inputId = id ?? idGenerado;
    const descripcionId = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;

    return (
      <div className={['input-field', error && 'input-field--error', className].filter(Boolean).join(' ')}>
        <label className="input-field__label" htmlFor={inputId}>
          {label}
        </label>
        <div
          className={[
            'input-field__row',
            suffix && 'input-field__row--suffix',
            prefijo && 'input-field__row--prefix',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {prefijo ? <div className="input-field__prefix">{prefijo}</div> : null}
          <input
            ref={ref}
            id={inputId}
            className="input-field__control"
            aria-invalid={Boolean(error)}
            aria-describedby={descripcionId}
            {...props}
          />
          {suffix ? <div className="input-field__suffix">{suffix}</div> : null}
        </div>
        {error ? (
          <p className="input-field__error" id={descripcionId}>
            {error}
          </p>
        ) : hint ? (
          <p className="input-field__hint" id={descripcionId}>
            {hint}
          </p>
        ) : null}
      </div>
    );
  }
);
Input.displayName = 'Input';
