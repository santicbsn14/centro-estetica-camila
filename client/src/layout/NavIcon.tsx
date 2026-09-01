import type { ReactNode } from 'react';

export type NavIconName = 'turnos' | 'servicios' | 'profesionales' | 'configuracion' | 'excepciones' | 'mi';

// Paths clonados 1:1 de los <svg class="ic"> de client/mockups/*.html — un
// ícono por item de NAV_ITEMS (layout/nav.ts). Puramente presentacional, sin
// mapeo a ninguna lógica de rol/ruta (eso lo sigue decidiendo nav.ts).
const PATHS: Record<NavIconName, ReactNode> = {
  turnos: (
    <>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </>
  ),
  servicios: (
    <path d="M20 7h-9M14 17H5M17 21a4 4 0 100-8 4 4 0 000 8zM7 11a4 4 0 100-8 4 4 0 000 8z" />
  ),
  profesionales: (
    <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13A4 4 0 0116 11" />
  ),
  configuracion: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-2.82 1.17V21a2 2 0 01-4 0v-.09A1.65 1.65 0 006.6 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 004.6 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 8.4a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.6a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06A1.65 1.65 0 0019.4 9c.14.31.22.66.22 1h.09" />
    </>
  ),
  excepciones: (
    <>
      <path d="M4.9 4.9l14.2 14.2M16 2v4M8 2v4M3 10h18" />
      <rect x="3" y="4" width="18" height="18" rx="2" />
    </>
  ),
  mi: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21v-1a6 6 0 0116 0v1" />
    </>
  ),
};

export function NavIcon({ name }: { name: NavIconName }) {
  return (
    <svg
      className="sidebar__icono"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}
