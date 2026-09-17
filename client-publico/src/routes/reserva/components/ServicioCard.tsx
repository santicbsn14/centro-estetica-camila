import { useState } from 'react';
import { iniciales } from '../../../lib/iniciales';
import { centavosAPesos } from '../../../lib/format/plata';
import type { Carga, ProfesionalPublico, ServicioPublico } from '../types';

interface Props {
  servicio: ServicioPublico;
  abierto: boolean;
  profesionales: Carga<ProfesionalPublico[]> | undefined;
  onToggle: (servicio: ServicioPublico) => void;
  onElegirProfesional: (servicio: ServicioPublico, profesional: ProfesionalPublico) => void;
}

// Card de servicio del catálogo (paso 1, acordeón — frontend.md §4.11).
export function ServicioCard({ servicio, abierto, profesionales, onToggle, onElegirProfesional }: Props) {
  // Un link roto no debe verse en el catálogo (frontend.md): si el <img>
  // dispara onError, se oculta el contenedor entero en vez de dejar el ícono
  // de imagen rota. Se resetea si cambia el servicio mostrado en esta card
  // (key de Catalogo.tsx ya es servicio._id, así que esto sólo cubre el caso
  // de reusar la misma instancia con otra imagenUrl).
  const [imagenRota, setImagenRota] = useState(false);
  const mostrarImagen = abierto && Boolean(servicio.imagenUrl) && !imagenRota;

  return (
    <div className={`svc${abierto ? ' open' : ''}`}>
      <div
        className="svc-hd"
        role="button"
        tabIndex={0}
        onClick={() => onToggle(servicio)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggle(servicio);
          }
        }}
        aria-expanded={abierto}
      >
        <div className="info">
          <div className="n">{servicio.nombre}</div>
          {servicio.descripcion && <div className="d">{servicio.descripcion}</div>}
          <div className="meta">
            <span className="duracion num">{servicio.duracionMin} min</span>
            {servicio.precio !== undefined && (
              <>
                <span className="separador" aria-hidden="true">
                  ·
                </span>
                <span className="precio num">{centavosAPesos(servicio.precio)}</span>
              </>
            )}
          </div>
        </div>
        <span className="chev" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </span>
      </div>
      <div className="svc-body">
        <div className="svc-body-in">
          {mostrarImagen && (
            <div className="svc-img">
              <img src={servicio.imagenUrl} alt="" onError={() => setImagenRota(true)} />
            </div>
          )}
          <div className="lbl">Elegí quién te atiende</div>
          <ListaProfesionales
            estado={profesionales}
            onElegir={(profesional) => onElegirProfesional(servicio, profesional)}
          />
        </div>
      </div>
    </div>
  );
}

function ListaProfesionales({
  estado,
  onElegir,
}: {
  estado: Carga<ProfesionalPublico[]> | undefined;
  onElegir: (profesional: ProfesionalPublico) => void;
}) {
  if (!estado || estado.tipo === 'cargando') {
    return <p className="estado-carga estado-carga--sm">Cargando…</p>;
  }
  if (estado.tipo === 'error') {
    return <p className="estado-carga estado-carga--sm">{estado.mensaje}</p>;
  }
  if (estado.datos.length === 0) {
    return <p className="estado-carga estado-carga--sm">Nadie atiende este servicio por ahora.</p>;
  }

  return (
    <div className="profs">
      {estado.datos.map((profesional) => (
        <button className="prof-btn" key={profesional._id} onClick={() => onElegir(profesional)}>
          <span className="av">{iniciales(profesional.nombre)}</span>
          <span className="nm">{profesional.nombre}</span>
          <span className="go" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </span>
        </button>
      ))}
    </div>
  );
}
