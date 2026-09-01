import { useId } from 'react';
import './Switch.css';

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  // Texto auxiliar chico bajo el label (ej. "atiende": "aparece en la web /
  // no toma turnos nuevos sin dar de baja", frontend.md §4.6).
  descripcion?: string;
  disabled?: boolean;
}

// Controlado, sin estado propio — quien lo use decide qué significa on/off
// (nullable de servicios, atiende de usuarios, etc.).
export function Switch({ checked, onChange, label, descripcion, disabled }: SwitchProps) {
  const id = useId();

  return (
    <div className="switch-field">
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        className={`switch${checked ? ' is-on' : ''}`}
        onClick={() => onChange(!checked)}
      >
        <span className="switch__perilla" />
      </button>
      <label htmlFor={id} className="switch-field__texto">
        <span className="switch-field__label">{label}</span>
        {descripcion ? <span className="switch-field__descripcion">{descripcion}</span> : null}
      </label>
    </div>
  );
}
