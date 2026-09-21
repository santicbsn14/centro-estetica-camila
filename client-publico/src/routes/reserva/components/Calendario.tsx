import { useEffect, useMemo, useRef, useState } from 'react';
import { DIAS_CALENDARIO, diaDeClave, fechaCompleta, hoyLocal } from '../../../lib/format/fecha';

interface Props {
  diasConSlots: ReadonlySet<string>;
  diaElegido: string | null;
  onElegir: (clave: string) => void;
  onCerrar: () => void;
}

const CABECERA_SEMANA = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

// Contenido del bottom sheet "Elegir fecha" (frontend.md 2026-09-21). Calendario
// propio, sin librerías. Habilitado = el día tiene ≥1 slot para el
// servicio+profesional elegidos; el resto queda deshabilitado, así que nunca se
// elige un día vacío. La navegación de mes se acota por el rango [hoy,
// hoy+DIAS_CALENDARIO], no por un número fijo de meses.
export function Calendario({ diasConSlots, diaElegido, onElegir, onCerrar }: Props) {
  const { hoy, ultimo } = useMemo(() => {
    const h = hoyLocal();
    return { hoy: h, ultimo: h.plus({ days: DIAS_CALENDARIO }) };
  }, []);
  const mesMin = hoy.startOf('month');
  const mesMax = ultimo.startOf('month');

  const [mes, setMes] = useState(() => (diaElegido ? diaDeClave(diaElegido) : hoy).startOf('month'));

  const panelRef = useRef<HTMLDivElement>(null);
  const cerrarRef = useRef<HTMLButtonElement>(null);

  // Foco inicial: el día elegido, si no el primer día habilitado, si no "cerrar".
  useEffect(() => {
    const destino =
      panelRef.current?.querySelector<HTMLButtonElement>('.cal-dia--elegido') ??
      panelRef.current?.querySelector<HTMLButtonElement>('.cal-dia:not(:disabled)') ??
      cerrarRef.current;
    destino?.focus();
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onCerrar();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onCerrar]);

  const hayAnterior = mes.toMillis() > mesMin.toMillis();
  const haySiguiente = mes.toMillis() < mesMax.toMillis();

  const offset = mes.weekday - 1; // lunes = 0
  const celdas: (string | null)[] = [];
  for (let i = 0; i < offset; i++) celdas.push(null);
  for (let d = 1; d <= mes.daysInMonth!; d++) celdas.push(mes.set({ day: d }).toFormat('yyyy-MM-dd'));

  const claveHoy = hoy.toFormat('yyyy-MM-dd');
  const claveUltimo = ultimo.toFormat('yyyy-MM-dd');

  return (
    <div ref={panelRef}>
      <div className="sheet-handle" />
      <div className="sheet-hd cal-hd">
        <h2>Elegí una fecha</h2>
        <button type="button" ref={cerrarRef} className="cal-cerrar" onClick={onCerrar} aria-label="Cerrar calendario">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      <div className="sheet-body">
        <div className="cal-nav">
          <button
            type="button"
            className="cal-nav-btn"
            onClick={() => setMes((m) => m.minus({ months: 1 }))}
            disabled={!hayAnterior}
            aria-label="Mes anterior"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <div className="cal-mes" aria-live="polite">
            {mes.setLocale('es').toFormat('LLLL yyyy')}
          </div>
          <button
            type="button"
            className="cal-nav-btn"
            onClick={() => setMes((m) => m.plus({ months: 1 }))}
            disabled={!haySiguiente}
            aria-label="Mes siguiente"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
        </div>

        <div className="cal-grid" aria-hidden="true">
          {CABECERA_SEMANA.map((l, i) => (
            <span className="cal-semana" key={i}>
              {l}
            </span>
          ))}
        </div>
        <div className="cal-grid">
          {celdas.map((clave, i) => {
            if (clave === null) return <span key={`v${i}`} />;
            const habilitado = diasConSlots.has(clave) && clave >= claveHoy && clave <= claveUltimo;
            const elegido = clave === diaElegido;
            const esHoy = clave === claveHoy;
            return (
              <button
                type="button"
                key={clave}
                className={`cal-dia${esHoy ? ' cal-dia--hoy' : ''}${elegido ? ' cal-dia--elegido' : ''}`}
                disabled={!habilitado}
                aria-label={fechaCompleta(clave)}
                aria-pressed={elegido}
                aria-current={esHoy ? 'date' : undefined}
                onClick={() => onElegir(clave)}
              >
                {Number(clave.slice(8))}
              </button>
            );
          })}
        </div>

        <p className="cal-leyenda">Los días en gris no tienen horarios disponibles.</p>
      </div>
    </div>
  );
}
