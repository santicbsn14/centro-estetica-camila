import type { Rol } from '../lib/auth';
import type { NavIconName } from './NavIcon';

export interface NavItem {
  to: string;
  label: string;
  icon: NavIconName;
  // Sin esto = visible para cualquier rol logueado (frontend.md §4.4:
  // "profesional ⇒ nav reducido (sólo Turnos + Mi perfil)").
  rolesPermitidos?: Rol[];
}

// Un solo lugar para la forma del nav — el guard de rol (RequireRol) protege
// las rutas; esto sólo decide qué se muestra. Mantenerlos en sync a mano por
// ahora (son 6 items).
export const NAV_ITEMS: NavItem[] = [
  { to: '/turnos', label: 'Turnos', icon: 'turnos' },
  { to: '/servicios', label: 'Servicios', icon: 'servicios', rolesPermitidos: ['admin'] },
  { to: '/profesionales', label: 'Profesionales', icon: 'profesionales', rolesPermitidos: ['admin'] },
  { to: '/configuracion', label: 'Configuración', icon: 'configuracion', rolesPermitidos: ['admin'] },
  { to: '/excepciones', label: 'Excepciones', icon: 'excepciones', rolesPermitidos: ['admin'] },
  { to: '/mi', label: 'Mi perfil', icon: 'mi' },
];

export function navParaRol(rol: Rol): NavItem[] {
  return NAV_ITEMS.filter((item) => !item.rolesPermitidos || item.rolesPermitidos.includes(rol));
}
