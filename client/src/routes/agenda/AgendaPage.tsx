import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { DateTime } from 'luxon';
import { Button } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { finDiaLocalUtc, hoyLocalISODate, inicioDiaLocalUtc } from '../../lib/format/fecha';
import * as api from '../turnos/api';
import { DrawerDetalleTurno } from '../turnos/components/DrawerDetalleTurno';
import type { ProfesionalFiltro, TurnoPanelLista } from '../turnos/types';
import { mensajeError, useDetalleTurno } from '../turnos/useDetalleTurno';
import { claveCelda, construirAgenda, lunesDeSemana } from './agenda';
import { ChipAgenda } from './ChipAgenda';
import './AgendaPage.css';

const MEDIA_MOBILE = '(max-width: 767px)';

function useEsMobile(): boolean {
  const [esMobile, setEsMobile] = useState(() => window.matchMedia(MEDIA_MOBILE).matches);
  useEffect(() => {
    const mql = window.matchMedia(MEDIA_MOBILE);
    const onChange = () => setEsMobile(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);
  return esMobile;
}

function capitalizar(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function etiquetaDiaCorta(dia: DateTime): string {
  return capitalizar(dia.setLocale('es').toFormat('ccc d').replace('.', ''));
}

function etiquetaHora(hora: number): string {
  return `${String(hora).padStart(2, '0')}:00`;
}

function etiquetaSemana(lunes: DateTime): string {
  const domingo = lunes.plus({ days: 6 });
  const desde = lunes.setLocale('es').toFormat(lunes.year === domingo.year ? 'd LLL' : 'd LLL yyyy');
  return `Semana del ${desde} al ${domingo.setLocale('es').toFormat('d LLL yyyy')}`;
}

// Agenda semanal (frontend.md §4.14): grilla día × hora de consulta, ambos
// roles. Un solo GET /api/turnos por semana; el ownership de la profesional lo
// fuerza el server. Click en chip ⇒ el mismo drawer de detalle del listado.
export function AgendaPage() {
  const { usuario } = useAuth();
  const esAdmin = usuario?.rol === 'admin';
  const esMobile = useEsMobile();

  // Semana en la URL (?semana=YYYY-MM-DD), normalizada al lunes local.
  const [searchParams, setSearchParams] = useSearchParams();
  const paramSemana = searchParams.get('semana');
  const lunes = useMemo(() => lunesDeSemana(paramSemana), [paramSemana]);
  const lunesISO = lunes.toISODate() as string;
  const domingoISO = lunes.plus({ days: 6 }).toISODate() as string;

  useEffect(() => {
    if (paramSemana !== null && paramSemana !== lunesISO) {
      setSearchParams({ semana: lunesISO }, { replace: true });
    }
  }, [paramSemana, lunesISO, setSearchParams]);

  function irASemana(semana: DateTime | null) {
    setSearchParams(semana ? { semana: semana.toISODate() as string } : {});
  }

  const [profesionalId, setProfesionalId] = useState('');
  const [profesionales, setProfesionales] = useState<ProfesionalFiltro[]>([]);

  // Misma carga que el filtro del listado (§4.4); sólo admin —
  // /api/admin/usuarios es admin-only (§15.7).
  useEffect(() => {
    if (!esAdmin) return;
    api.listarProfesionales().then(setProfesionales).catch(() => {
      // Si falla, el filtro simplemente no aparece.
    });
  }, [esAdmin]);

  // `datos.clave` identifica la consulta (semana + filtro) que los produjo:
  // mientras no coincida con la actual se muestra "Cargando", y una respuesta
  // vieja (navegación rápida entre semanas) no pisa a la nueva.
  const claveConsulta = `${lunesISO}|${esAdmin ? profesionalId : ''}`;
  const [datos, setDatos] = useState<{ clave: string; turnos: TurnoPanelLista[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ultimaConsulta = useRef(claveConsulta);

  const cargarSemana = useCallback(async () => {
    ultimaConsulta.current = claveConsulta;
    setError(null);
    try {
      const turnos = await api.listarTurnos({
        desde: inicioDiaLocalUtc(lunesISO),
        hasta: finDiaLocalUtc(domingoISO),
        profesionalId: esAdmin && profesionalId ? profesionalId : undefined,
      });
      if (ultimaConsulta.current === claveConsulta) setDatos({ clave: claveConsulta, turnos });
    } catch (err) {
      if (ultimaConsulta.current === claveConsulta) setError(mensajeError(err));
    }
  }, [claveConsulta, lunesISO, domingoISO, esAdmin, profesionalId]);

  useEffect(() => {
    cargarSemana();
  }, [cargarSemana]);

  const detalleTurno = useDetalleTurno(cargarSemana);

  const turnosSemana = datos?.clave === claveConsulta ? datos.turnos : null;
  const agenda = useMemo(
    () => (turnosSemana ? construirAgenda(turnosSemana, lunes) : null),
    [turnosSemana, lunes]
  );

  const hoyISO = hoyLocalISODate();
  const mostrarProfesional = esAdmin && !profesionalId;

  // Mobile: un día a la vez. Default: hoy si cae en la semana, si no lunes.
  const [diaMobileISO, setDiaMobileISO] = useState<string | null>(null);
  useEffect(() => setDiaMobileISO(null), [lunesISO]);
  const diaDefault = hoyISO >= lunesISO && hoyISO <= domingoISO ? hoyISO : lunesISO;
  const diaMobile =
    agenda?.dias.find((d) => d.toISODate() === (diaMobileISO ?? diaDefault)) ?? agenda?.dias[0] ?? null;

  if (!usuario) return null;

  function renderChips(dia: DateTime, hora: number) {
    const turnos = agenda?.celdas.get(claveCelda(dia, hora));
    if (!turnos) return null;
    return turnos.map((t) => (
      <ChipAgenda key={t.id} turno={t} mostrarProfesional={mostrarProfesional} onAbrir={detalleTurno.abrirDetalle} />
    ));
  }

  return (
    <div className="agenda-page">
      <div className="agenda-page__head">
        <div>
          <h1 className="agenda-page__titulo">Agenda</h1>
          <div className="agenda-page__sub">{etiquetaSemana(lunes)}</div>
        </div>
      </div>

      <div className="agenda-page__barra">
        <div className="agenda-page__nav-semana">
          <Button variant="secondary" size="sm" onClick={() => irASemana(lunes.minus({ weeks: 1 }))}>
            ← Anterior
          </Button>
          <Button variant="secondary" size="sm" onClick={() => irASemana(null)}>
            Hoy
          </Button>
          <Button variant="secondary" size="sm" onClick={() => irASemana(lunes.plus({ weeks: 1 }))}>
            Siguiente →
          </Button>
        </div>

        {esAdmin ? (
          <label className="filtro-profesional">
            <span>Profesional</span>
            <select value={profesionalId} onChange={(e) => setProfesionalId(e.target.value)}>
              <option value="">Todas las profesionales</option>
              {profesionales.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                  {p.activo ? '' : ' (inactiva)'}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      {error ? (
        <div className="turnos-page__aviso turnos-page__aviso--error">{error}</div>
      ) : !agenda ? (
        <div className="turnos-page__vacio">Cargando agenda…</div>
      ) : esMobile && diaMobile ? (
        <>
          <div className="agenda-dias" role="tablist" aria-label="Día">
            {agenda.dias.map((dia) => {
              const iso = dia.toISODate() as string;
              const clases = [
                'agenda-dias__pill',
                iso === diaMobile.toISODate() ? 'is-activo' : '',
                iso === hoyISO ? 'is-hoy' : '',
              ]
                .filter(Boolean)
                .join(' ');
              return (
                <button
                  key={iso}
                  type="button"
                  role="tab"
                  aria-selected={iso === diaMobile.toISODate()}
                  className={clases}
                  onClick={() => setDiaMobileISO(iso)}
                >
                  {etiquetaDiaCorta(dia)}
                </button>
              );
            })}
          </div>
          <div className="agenda-dia">
            {agenda.horas.map((hora) => (
              <div className="agenda-dia__fila" key={hora}>
                <div className="agenda-grilla__hora num">{etiquetaHora(hora)}</div>
                <div className="agenda-grilla__celda">{renderChips(diaMobile, hora)}</div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="agenda-grilla__scroll">
          <div
            className="agenda-grilla"
            style={{ gridTemplateColumns: `56px repeat(${agenda.dias.length}, minmax(128px, 1fr))` }}
          >
            <div className="agenda-grilla__esquina" />
            {agenda.dias.map((dia) => (
              <div
                key={dia.toISODate()}
                className={`agenda-grilla__dia${dia.toISODate() === hoyISO ? ' is-hoy' : ''}`}
              >
                {etiquetaDiaCorta(dia)}
              </div>
            ))}
            {agenda.horas.map((hora) => (
              <div className="agenda-grilla__fila" key={hora}>
                <div className="agenda-grilla__hora num">{etiquetaHora(hora)}</div>
                {agenda.dias.map((dia) => (
                  <div
                    key={dia.toISODate()}
                    className={`agenda-grilla__celda${dia.toISODate() === hoyISO ? ' is-hoy' : ''}`}
                  >
                    {renderChips(dia, hora)}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      <DrawerDetalleTurno control={detalleTurno} />
    </div>
  );
}
