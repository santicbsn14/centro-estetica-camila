import { iniciales } from '../../../lib/iniciales';
import { centavosAPesos } from '../../../lib/format/plata';
import {
  agruparPorDiaLocal,
  claveDiaLocal,
  claveUltimoDiaVistaDefault,
  fechaCorta,
  horaLocal,
} from '../../../lib/format/fecha';
import type { Carga, ProfesionalPublico, ServicioPublico, Slot } from '../types';

interface Props {
  servicio: ServicioPublico;
  profesional: ProfesionalPublico;
  // Todos los slots del rango de 30 días (cache de ReservaPage). Esta
  // pantalla decide qué parte mostrar: 7 días por default, o un solo día.
  slots: Carga<Slot[]>;
  diaElegido: string | null;
  onCambiar: () => void;
  onElegirSlot: (slot: Slot) => void;
  onReintentar: () => void;
  onAbrirCalendario: () => void;
  onVerProximos: () => void;
}

// Paso 2 — grilla de horarios (frontend.md §4.11 + 2026-09-21 "Elegir
// fecha"). Clonado de .summary/.daygroup/.slotgrid/.slot/.empty-slots del
// mockup. 0 slots ⇒ empty-state, nunca error (§15.2: intersección vacía es
// {slots:[]} normal).
export function Grilla({
  servicio,
  profesional,
  slots,
  diaElegido,
  onCambiar,
  onElegirSlot,
  onReintentar,
  onAbrirCalendario,
  onVerProximos,
}: Props) {
  // "Elegir fecha" se oculta si en todo el rango no hay ningún slot.
  const hayAlgunSlot = slots.tipo === 'ok' && slots.datos.length > 0;

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

      <div className="title-row">
        <h1 className="title" style={{ fontSize: 19 }}>
          Elegí un horario
        </h1>
        {hayAlgunSlot && (
          <button type="button" className="fecha-btn" onClick={onAbrirCalendario}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <rect x="3" y="5" width="18" height="16" rx="2" />
              <path d="M3 10h18M8 3v4M16 3v4" />
            </svg>
            Elegir fecha
          </button>
        )}
      </div>

      {diaElegido && (
        <div className="dia-banner" role="status">
          <span>
            Mostrando: <b>{fechaCorta(diaElegido)}</b>
          </span>
          <button type="button" className="dia-banner__volver" onClick={onVerProximos}>
            Ver próximos días
          </button>
        </div>
      )}

      <CuerpoGrilla
        slots={slots}
        diaElegido={diaElegido}
        onElegirSlot={onElegirSlot}
        onReintentar={onReintentar}
      />
    </>
  );
}

function CuerpoGrilla({
  slots,
  diaElegido,
  onElegirSlot,
  onReintentar,
}: {
  slots: Carga<Slot[]>;
  diaElegido: string | null;
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

  // Un solo día elegido, o los primeros 7 días desde hoy. Ambos leen del mismo
  // array — sin otro request. Un día elegido nunca queda vacío: sólo se puede
  // elegir uno habilitado, y si un 409 lo vacía ReservaPage vuelve al default.
  const limiteDefault = claveUltimoDiaVistaDefault();
  const visibles = slots.datos.filter((s) => {
    const clave = claveDiaLocal(s.inicio);
    return diaElegido ? clave === diaElegido : clave <= limiteDefault;
  });

  if (visibles.length === 0) {
    return (
      <div className="empty-slots">No hay horarios en los próximos días. Probá con “Elegir fecha”.</div>
    );
  }

  const grupos = agruparPorDiaLocal(visibles);

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
