import { CATEGORIA_FALLBACK, CATEGORIA_OTROS_ID } from '../constants';
import type { Carga, ProfesionalPublico, ServicioPublico } from '../types';
import { ServicioCard } from './ServicioCard';

interface Props {
  servicios: Carga<ServicioPublico[]>;
  categoriasAbiertas: ReadonlySet<string>;
  servicioAbiertoId: string | null;
  profesionalesPorServicio: Record<string, Carga<ProfesionalPublico[]>>;
  onToggleCategoria: (categoriaId: string) => void;
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

  // Agrupado por categoría real (frontend.md §4.11, 2026-11-16): grupos por
  // `categoria.id`, ordenados por `categoria.orden` (desempate nombre);
  // `null` ⇒ "Otros" al final. Dentro del grupo, el orden de llegada del
  // array — GET /api/servicios ya lo devuelve ordenado por `orden` de
  // servicio, acá no se reordena. Sólo existen grupos con al menos un
  // servicio activo (el server sólo manda activos) ⇒ una categoría vacía no
  // aparece.
  const grupos = new Map<string, { id: string; nombre: string; orden: number; servicios: ServicioPublico[] }>();
  const otros: ServicioPublico[] = [];
  for (const servicio of servicios.datos) {
    const categoria = servicio.categoria;
    if (!categoria) {
      otros.push(servicio);
      continue;
    }
    const grupo = grupos.get(categoria.id);
    if (grupo) grupo.servicios.push(servicio);
    else grupos.set(categoria.id, { ...categoria, servicios: [servicio] });
  }
  const ordenados = [...grupos.values()].sort(
    (a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' })
  );
  if (otros.length > 0) {
    ordenados.push({ id: CATEGORIA_OTROS_ID, nombre: CATEGORIA_FALLBACK, orden: Infinity, servicios: otros });
  }

  return (
    <div className="catalogo">
      {ordenados.map((grupo) => {
        const lista = grupo.servicios;
        const abierta = categoriasAbiertas.has(grupo.id);
        // ids estables por categoría (no por índice): si se agrega/quita un
        // grupo, aria-controls no queda apuntando a otro panel.
        const headerId = `categoria-hd-${grupo.id}`;
        const panelId = `categoria-panel-${grupo.id}`;

        return (
          <section className={`categoria${abierta ? ' categoria--abierta' : ''}`} key={grupo.id}>
            <h2 className="categoria-h">
              <button
                type="button"
                id={headerId}
                className="categoria-hd"
                aria-expanded={abierta}
                aria-controls={panelId}
                onClick={() => onToggleCategoria(grupo.id)}
              >
                {/* Mayúsculas por CSS (.categoria-nombre text-transform), no con el string. */}
                <span className="categoria-nombre">{grupo.nombre}</span>
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
