import { CATEGORIAS_SERVICIO, CATEGORIA_FALLBACK, categoriaDe } from '../constants';
import type { Carga, ProfesionalPublico, ServicioPublico } from '../types';
import { ServicioCard } from './ServicioCard';

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
  const categoriasConServicios = [...CATEGORIAS_SERVICIO, CATEGORIA_FALLBACK].filter((c) => buckets.has(c));

  return (
    <div className="catalogo">
      {categoriasConServicios.map((categoria) => (
        <div className="categoria" key={categoria}>
          <div className="categoria-titulo">{categoria}</div>
          {buckets.get(categoria)!.map((servicio) => (
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
      ))}
    </div>
  );
}
