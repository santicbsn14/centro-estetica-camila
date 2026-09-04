import { Button } from '../../../components/ui';
import { agruparPorDiaLocal, formatHora } from '../../../lib/format/fecha';
import type { SlotDisponible } from '../types';

export interface GrillaHorarioProps {
  slots: SlotDisponible[];
  cargando: boolean;
  error: string | null;
  slotElegido: SlotDisponible | null;
  onElegir: (slot: SlotDisponible) => void;
  onReintentar: () => void;
  onVerMasFechas: () => void;
}

// Grilla de horarios del alta manual (frontend.md §4.4 "ALTA MANUAL"): mismo
// flujo/datos que el paso 2 de la reserva pública (client-publico/src/routes/
// reserva/components/Grilla.tsx) — GET /api/disponibilidad, agrupado por día
// LOCAL (Luxon), sin date-picker libre. No se comparte el componente 1:1
// entre las dos apps (dos proyectos Vite separados); se replica el patrón,
// adaptado al look de escritorio del panel (columnas más angostas, botón
// "Ver más fechas" en vez de una ventana fija de una semana — acá el
// operador puede necesitar reservar más adelante que una clienta reservando
// para sí misma).
export function GrillaHorario({
  slots,
  cargando,
  error,
  slotElegido,
  onElegir,
  onReintentar,
  onVerMasFechas,
}: GrillaHorarioProps) {
  if (cargando && slots.length === 0) {
    return <p className="horario-grilla__estado">Buscando horarios…</p>;
  }

  if (error) {
    return (
      <div className="horario-grilla__error">
        <p>{error}</p>
        <Button variant="secondary" size="sm" onClick={onReintentar}>
          Reintentar
        </Button>
      </div>
    );
  }

  if (slots.length === 0) {
    return (
      <div className="horario-grilla__vacio">
        <p>No hay horarios disponibles en este rango.</p>
        <Button variant="secondary" size="sm" onClick={onVerMasFechas}>
          Ver más fechas
        </Button>
      </div>
    );
  }

  const grupos = agruparPorDiaLocal(slots, (s) => s.inicio);

  return (
    <div className="horario-grilla">
      {grupos.map((grupo) => (
        <div className="horario-grilla__dia" key={grupo.clave}>
          <p className="horario-grilla__etiqueta">{grupo.etiqueta}</p>
          <div className="horario-grilla__slots">
            {grupo.items.map((slot) => (
              <button
                type="button"
                key={slot.inicio}
                className={`horario-grilla__slot${slotElegido?.inicio === slot.inicio ? ' is-elegido' : ''}`}
                onClick={() => onElegir(slot)}
              >
                {formatHora(slot.inicio)}
              </button>
            ))}
          </div>
        </div>
      ))}
      <Button variant="ghost" size="sm" onClick={onVerMasFechas} disabled={cargando}>
        {cargando ? 'Cargando…' : 'Ver más fechas'}
      </Button>
    </div>
  );
}
