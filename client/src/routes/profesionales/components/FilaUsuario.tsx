import type { UsuarioPanel } from '../types';

export interface FilaUsuarioProps {
  usuario: UsuarioPanel;
  onAbrir: (id: string) => void;
}

// Iniciales del avatar circular (mockup: .person .av) — mismo criterio que
// `iniciales()` en layout/Sidebar.tsx (derivarlas del nombre, sólo
// presentación). Duplicado a propósito: son 6 líneas, y Sidebar vive en
// `layout/` con otro propósito (el avatar de la sesión propia, no de una
// fila de lista) — no ameritaba todavía un util compartido en `lib/format`.
function iniciales(nombre: string): string {
  return nombre
    .split(' ')
    .filter(Boolean)
    .map((palabra) => palabra[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

// Fila de listado (frontend.md §4.6): avatar+nombre+email · rol · toma
// turnos · servicios(count) · estado. Inactivos atenuados. Sin acciones
// inline — la fila entera abre el drawer, mismo patrón que servicios
// (Desactivar/Activar y Resetear contraseña viven ahí, no acá).
export function FilaUsuario({ usuario, onAbrir }: FilaUsuarioProps) {
  return (
    <div
      className={`fila-usuario${usuario.activo ? '' : ' fila-usuario--inactivo'}`}
      role="button"
      tabIndex={0}
      onClick={() => onAbrir(usuario.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onAbrir(usuario.id);
        }
      }}
    >
      <div className="fila-usuario__celda fila-usuario__persona">
        <span className="fila-usuario__avatar" aria-hidden="true">
          {iniciales(usuario.nombre)}
        </span>
        <div>
          <div className="fila-usuario__nombre">{usuario.nombre}</div>
          <div className="fila-usuario__email">{usuario.email}</div>
        </div>
      </div>

      <div className="fila-usuario__celda">
        <TagUsuario variante={usuario.rol === 'admin' ? 'admin' : 'profesional'} />
      </div>

      <div className="fila-usuario__celda fila-usuario__atiende">
        <TagUsuario variante={usuario.atiende ? 'atiende-si' : 'atiende-no'} />
      </div>

      <div className="fila-usuario__celda fila-usuario__servicios num">{usuario.servicios.length} servicios</div>

      <div className="fila-usuario__celda">
        <TagUsuario variante={usuario.activo ? 'activa' : 'inactiva'} />
      </div>
    </div>
  );
}

type VarianteTag = 'admin' | 'profesional' | 'atiende-si' | 'atiende-no' | 'activa' | 'inactiva';

const TAG_LABEL: Record<VarianteTag, string> = {
  admin: 'Admin',
  profesional: 'Profesional',
  'atiende-si': 'Sí',
  'atiende-no': 'No',
  activa: 'Activa',
  inactiva: 'Inactiva',
};

// Sin @shared que reusar acá (mismo motivo que TagServicio en
// FilaServicio.tsx: rol/atiende/estado de usuario no son EstadoTurno, Badge
// no aplica). Colores: reusan tokens de estado de turno ya cotejados
// (confirmado/cancelado/ausente) para profesional/atiende-no/activa/
// inactiva; "Admin" es el único caso sin un token de §3 que le calce por
// significado — en vez de inventar un color nuevo (el mockup usa un índigo
// que no está en §3, que es CERRADO salvo la fuente), se resuelve con la
// propia tinta de marca sólida (mismo tratamiento que un segmentado
// "activo" o el nav "on") — ver bitácora.
function TagUsuario({ variante }: { variante: VarianteTag }) {
  return <span className={`tag-usuario tag-usuario--${variante}`}>{TAG_LABEL[variante]}</span>;
}
