import { forwardRef, type ButtonHTMLAttributes } from 'react';
import './Button.css';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-outline';
export type ButtonSize = 'sm' | 'md';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

// Primitiva vacía pero tipada (frontend.md §4.0) — variantes/tamaños clonados
// de los mockups; sin lógica de negocio acá (loading/disabled los maneja
// quien la use).
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', type = 'button', className, ...props }, ref) => {
    const clases = ['btn', `btn--${variant}`, `btn--${size}`, className].filter(Boolean).join(' ');
    return <button ref={ref} type={type} className={clases} {...props} />;
  }
);
Button.displayName = 'Button';
