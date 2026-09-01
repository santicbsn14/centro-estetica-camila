import { NavLink } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { NavIcon } from './NavIcon';
import { navParaRol } from './nav';
import './Sidebar.css';

// Iniciales del avatar circular del bloque de usuario (mockups: .who .av,
// "CG"/"RB"). Sólo presentación, no toca `usuario` — se deriva del mismo
// nombre que ya se muestra al lado.
function iniciales(nombre: string): string {
  return nombre
    .split(' ')
    .filter(Boolean)
    .map((palabra) => palabra[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function Sidebar() {
  const { usuario, cerrarSesion } = useAuth();
  if (!usuario) return null; // sólo se monta detrás de RequireSesion, defensivo igual

  const items = navParaRol(usuario.rol);

  return (
    <aside className="sidebar">
      <div className="sidebar__marca">
        <span className="sidebar__monograma" aria-hidden="true">
          cg
        </span>
        <div>
          <div className="sidebar__wordmark">Camila González</div>
          <div className="sidebar__tagline">Salón de belleza</div>
        </div>
      </div>

      <nav className="sidebar__nav" aria-label="Navegación del panel">
        <ul>
          {items.map((item) => (
            <li key={item.to}>
              <NavLink to={item.to} className={({ isActive }) => `sidebar__link${isActive ? ' is-activo' : ''}`}>
                <NavIcon name={item.icon} />
                <span className="sidebar__link-label">{item.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className="sidebar__usuario">
        <span className="sidebar__avatar" aria-hidden="true">
          {iniciales(usuario.nombre)}
        </span>
        <span className="sidebar__usuario-texto">
          <span className="sidebar__usuario-nombre">{usuario.nombre}</span>
          <span className="sidebar__usuario-rol">{usuario.rol === 'admin' ? 'Admin' : 'Profesional'}</span>
        </span>
        <button
          type="button"
          className="sidebar__logout"
          onClick={() => {
            void cerrarSesion();
          }}
          aria-label="Cerrar sesión"
          title="Salir"
        >
          <IconoSalir />
        </button>
      </div>
    </aside>
  );
}

// Ícono de puerta+flecha (mockups: .who .lo), clonado 1:1 de
// client/mockups/{turnos,servicios,profesionales}-camila.html.
function IconoSalir() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
    </svg>
  );
}
