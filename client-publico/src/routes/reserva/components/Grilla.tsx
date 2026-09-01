import { iniciales } from '../../../lib/iniciales';
import { centavosAPesos } from '../../../lib/format/plata';
import { agruparPorDiaLocal, horaLocal } from '../../../lib/format/fecha';
import type { Carga, ProfesionalPublico, ServicioPublico, Slot } from '../types';

interface Props {
  servicio: ServicioPublico;
  profesional: ProfesionalPublico;
  slots: Carga<Slot[]>;
  onCambiar: () => void;
  onElegirSlot: (slot: Slot) => void;
  onReintentar: () => void;
}

// Paso 2 — grilla de horarios (frontend.md §4.11). Clonado de .summary/
// .daygroup/.slotgrid/.slot/.empty-slots del mockup. 0 slots ⇒ empty-state,
// nunca error (§15.2: intersección vacía es {slots:[]} normal).
export function Grilla({ servicio, profesional, slots, onCambiar, onElegirSlot, onReintentar }: Props) {
  return (
    <>
      <div className="summary">
        <span className="av">{iniciales(profesional.nombre)}</span>
        <div className="tx">
          <div className="s1">
            {servicio.nombre} con {profesional.nombre}
          </div>
          <div className="s2 num">
            {servicio.duracionMin} min{servicio.precio !== undefined ? ` · ${centavosAPesos(servicio.precio)}` : ''}
          </div>
        </div>
        <button className="change" onClick={onCambiar}>
          Cambiar
        </button>
      </div>

      <h1 className="title" style={{ fontSize: 19 }}>
        Elegí un horario
      </h1>

      <CuerpoGrilla slots={slots} onElegirSlot={onElegirSlot} onReintentar={onReintentar} />
    </>
  );
}

function CuerpoGrilla({
  slots,
  onElegirSlot,
  onReintentar,
}: {
  slots: Carga<Slot[]>;
  onElegirSlot: (slot: Slot) => void;
  onReintentar: () => void;
}) {
  if (slots.tipo === 'cargando') {
    return <p className="estado-carga">Buscando horarios…</p>;
  }

  if (slots.tipo === 'error') {
    return (
      <div className="estado-error">
        <p>{slots.mensaje}</p>
        <button className="btn" onClick={onReintentar}>
          Reintentar
        </button>
      </div>
    );
  }

  if (slots.datos.length === 0) {
    return <div className="empty-slots">No quedan horarios en estos días. Probá más adelante.</div>;
  }

  const grupos = agruparPorDiaLocal(slots.datos);

  return (
    <>
      {grupos.map((grupo) => (
        <div className="daygroup" key={grupo.clave}>
          <p className="daylabel">{grupo.etiqueta}</p>
          <div className="slotgrid">
            {grupo.slots.map((slot) => (
              <button className="slot" key={slot.inicio} onClick={() => onElegirSlot(slot)}>
                {horaLocal(slot.inicio)}
              </button>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}
