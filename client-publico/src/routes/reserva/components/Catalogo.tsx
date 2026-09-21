import { CATEGORIAS_SERVICIO, CATEGORIA_FALLBACK, categoriaDe } from '../constants';
import type { Carga, ProfesionalPublico, ServicioPublico } from '../types';
import { ServicioCard } from './ServicioCard';

interface Props {
  servicios: Carga<ServicioPublico[]>;
  categoriasAbiertas: ReadonlySet<string>;
  servicioAbiertoId: string | null;
  profesionalesPorServicio: Record<string, Carga<ProfesionalPublico[]>>;
  onToggleCategoria: (categoria: string) => void;
  onToggleServicio: (servicio: ServicioPublico) => void;
  onElegirProfesional: (servicio: ServicioPublico, profesional: ProfesionalPublico) => void;
  onReintentar: () => void;
}

// Paso 1 — categorías desplegables (frontend.md 2026-09-21) que contienen el
// acordeón de servicios (§4.11). Clonado de .svc/.svc-hd/.svc-body/.prof-btn
// del mockup.
export function Catalogo({
  servicios,
  categoriasAbiertas,
  servicioAbiertoId,
  profesionalesPorServicio,
  onToggleCategoria,
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

  // Agrupado por categoría fija (frontend.md §4.11 punto 3a). El orden
  // dentro de cada bucket es el orden de llegada del array — GET
  // /api/servicios ya lo devuelve ordenado por `orden` (servicios.routes.ts),
  // acá no se reordena, sólo se reparte en buckets sin tocar ese orden
  // relativo.
  const buckets = new Map<string, ServicioPublico[]>();
  for (const servicio of servicios.datos) {
    const categoria = categoriaDe(servicio.nombre);
    const lista = buckets.get(categoria);
    if (lista) lista.push(servicio);
    else buckets.set(categoria, [servicio]);
  }
  const todasLasCategorias = [...CATEGORIAS_SERVICIO, CATEGORIA_FALLBACK];

  return (
    <div className="catalogo">
      {todasLasCategorias.map((categoria, i) => {
        const lista = buckets.get(categoria);
        if (!lista) return null;
        const abierta = categoriasAbiertas.has(categoria);
        const headerId = `categoria-hd-${i}`;
        const panelId = `categoria-panel-${i}`;

        return (
          <section className={`categoria${abierta ? ' categoria--abierta' : ''}`} key={categoria}>
            <h2 className="categoria-h">
              <button
                type="button"
                id={headerId}
                className="categoria-hd"
                aria-expanded={abierta}
                aria-controls={panelId}
                onClick={() => onToggleCategoria(categoria)}
              >
                <span className="categoria-nombre">{categoria}</span>
                <span className="categoria-cuenta">{lista.length === 1 ? '1 servicio' : `${lista.length} servicios`}</span>
                <svg
                  className="categoria-chev"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
            </h2>
            <div className="categoria-panel" id={panelId} role="region" aria-labelledby={headerId}>
              <div className="categoria-panel-in">
                <div className="categoria-panel-body">
                  {lista.map((servicio) => (
                    <ServicioCard
                      key={servicio._id}
                      servicio={servicio}
                      abierto={servicioAbiertoId === servicio._id}
                      profesionales={profesionalesPorServicio[servicio._id]}
                      onToggle={onToggleServicio}
                      onElegirProfesional={onElegirProfesional}
                    />
                  ))}
                </div>
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}
