import { iniciales } from '../../../lib/iniciales';
import { centavosAPesos } from '../../../lib/format/plata';
import type { Carga, ProfesionalPublico, ServicioPublico } from '../types';

interface Props {
  servicios: Carga<ServicioPublico[]>;
  servicioAbiertoId: string | null;
  profesionalesPorServicio: Record<string, Carga<ProfesionalPublico[]>>;
  onToggleServicio: (servicio: ServicioPublico) => void;
  onElegirProfesional: (servicio: ServicioPublico, profesional: ProfesionalPublico) => void;
  onReintentar: () => void;
}

// Paso 1 — acordeón de servicios (frontend.md §4.11). Clonado de
// .svc/.svc-hd/.svc-body/.prof-btn del mockup.
export function Catalogo({
  servicios,
  servicioAbiertoId,
  profesionalesPorServicio,
  onToggleServicio,
  onElegirProfesional,
  onReintentar,
}: Props) {
  if (servicios.tipo === 'cargando') {
    return <p className="estado-carga">Cargando servicios…</p>;
  }

  if (servicios.tipo === 'error') {
    return (
      <div className="estado-error">
        <p>{servicios.mensaje}</p>
        <button className="btn" onClick={onReintentar}>
          Reintentar
        </button>
      </div>
    );
  }

  if (servicios.datos.length === 0) {
    return <p className="estado-carga">No hay servicios disponibles por el momento.</p>;
  }

  return (
    <div className="catalogo">
      {servicios.datos.map((servicio) => {
        const abierto = servicioAbiertoId === servicio._id;
        const profesionales = profesionalesPorServicio[servicio._id];

        return (
          <div className={`svc${abierto ? ' open' : ''}`} key={servicio._id}>
            <div
              className="svc-hd"
              role="button"
              tabIndex={0}
              onClick={() => onToggleServicio(servicio)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onToggleServicio(servicio);
                }
              }}
              aria-expanded={abierto}
            >
              <div className="info">
                <div className="n">{servicio.nombre}</div>
                {servicio.descripcion && <div className="d">{servicio.descripcion}</div>}
                <div className="meta">
                  <span className="num">{servicio.duracionMin} min</span>
                  {servicio.precio !== undefined && <span className="num">· {centavosAPesos(servicio.precio)}</span>}
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
                <div className="lbl">Elegí quién te atiende</div>
                <ListaProfesionales
                  estado={profesionales}
                  onElegir={(profesional) => onElegirProfesional(servicio, profesional)}
                />
              </div>
            </div>
          </div>
        );
      })}
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
