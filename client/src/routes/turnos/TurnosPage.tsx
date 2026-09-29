import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CrearTurnoInput } from '@shared/schemas/turno.schema';
import { Button, useToast } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { HttpError } from '../../lib/http';
import { agruparPorDiaLocal, finDiaLocalUtc, hoyLocalISODate, inicioDiaLocalUtc, sumarDiasISODate } from '../../lib/format/fecha';
import * as api from './api';
import { DrawerDetalleTurno } from './components/DrawerDetalleTurno';
import { FilaTurno } from './components/FilaTurno';
import { NuevoTurnoDrawer } from './components/NuevoTurnoDrawer';
import {
  ESTADOS_TURNO,
  type FiltroEstado,
  type ProfesionalFiltro,
  type ResultadoCrearTurno,
  type SlotDisponible,
  type TurnoPanelLista,
} from './types';
import { mensajeError, useDetalleTurno } from './useDetalleTurno';
import './TurnosPage.css';

const RANGO_DEFAULT_DIAS = 30;

const ETIQUETA_SEGMENTO: Record<FiltroEstado, string> = {
  todos: 'Todos',
  pendiente: 'Pendientes',
  confirmado: 'Confirmados',
  rechazado: 'Rechazados',
  cancelado: 'Cancelados',
  completado: 'Completados',
  ausente: 'Ausentes',
};

export function TurnosPage() {
  const { usuario } = useAuth();
  const { mostrarToast } = useToast();
  const esAdmin = usuario?.rol === 'admin';

  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>('todos');
  const [desde, setDesde] = useState(() => hoyLocalISODate());
  const [hasta, setHasta] = useState(() => sumarDiasISODate(hoyLocalISODate(), RANGO_DEFAULT_DIAS));
  const [profesionalId, setProfesionalId] = useState<string>('');
  const [profesionales, setProfesionales] = useState<ProfesionalFiltro[]>([]);

  const [turnos, setTurnos] = useState<TurnoPanelLista[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Alta manual — "Nuevo turno" (frontend.md §4.4). Visible para AMBOS roles.
  const [nuevoTurnoAbierto, setNuevoTurnoAbierto] = useState(false);
  const [creandoTurno, setCreandoTurno] = useState(false);

  const rangoValido = desde <= hasta;

  // Profesionales para el filtro admin — se pide una sola vez (frontend.md
  // §4.4: "filtro de profesional (admin)"). No se llama si el rol es
  // profesional: /api/admin/usuarios es admin-only (§15.7) y además el
  // listado ya viene forzado a lo suyo por el server, el filtro no aplica.
  useEffect(() => {
    if (!esAdmin) return;
    api.listarProfesionales().then(setProfesionales).catch(() => {
      // Si falla, el filtro simplemente no aparece — no es motivo para
      // romper la pantalla de turnos, que es el daily-driver del panel.
    });
  }, [esAdmin]);

  const cargarTurnos = useCallback(async () => {
    if (!rangoValido) return;
    setCargando(true);
    setError(null);
    try {
      const data = await api.listarTurnos({
        desde: inicioDiaLocalUtc(desde),
        hasta: finDiaLocalUtc(hasta),
        profesionalId: esAdmin && profesionalId ? profesionalId : undefined,
      });
      setTurnos(data);
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setCargando(false);
    }
  }, [desde, hasta, profesionalId, esAdmin, rangoValido]);

  useEffect(() => {
    cargarTurnos();
  }, [cargarTurnos]);

  // Drawer de detalle + transiciones (aprobar/rechazar/cancelar/ausente, con
  // refetch y manejo de 409 ESTADO_INVALIDO) — compartido con la agenda
  // semanal (frontend.md §4.14). Al terminar cada acción relee el listado.
  const detalleTurno = useDetalleTurno(cargarTurnos);
  const { ocupados, abrirDetalle, aprobar, rechazar } = detalleTurno;

  // Alta manual (frontend.md §4.4): MISMO POST /api/turnos público — el server
  // deriva origen:'admin' de la sesión, nace CONFIRMADO directo (un solo
  // submit, sin encadenar aprobar). 409 SLOT_OCUPADO es el único código con
  // manejo especial (toast + le pasamos los slots frescos al drawer para que
  // refresque su propia grilla, mismo criterio que client-publico §4.11); el
  // resto de los códigos (403 SIN_PERMISO, 400 FUERA_DE_HORARIO/
  // SERVICIO_NO_PRESTADO, 404, etc.) cae en el toast genérico — igual que
  // ServiciosPage/UsuarioDrawer con sus errores no especiales.
  async function crearTurnoManual(input: CrearTurnoInput): Promise<ResultadoCrearTurno> {
    setCreandoTurno(true);
    try {
      await api.crearTurnoManual(input);
      mostrarToast('Turno creado y confirmado.', 'exito');
      setNuevoTurnoAbierto(false);
      await cargarTurnos();
      return { ok: true };
    } catch (err) {
      if (err instanceof HttpError && err.codigo === 'SLOT_OCUPADO') {
        const detalle = err.detalle as { slots?: SlotDisponible[] } | undefined;
        mostrarToast('Ese horario se acaba de ocupar. Elegí otro.', 'info');
        return { ok: false, slotsOcupado: detalle?.slots ?? [] };
      }
      mostrarToast(mensajeError(err), 'error');
      return { ok: false };
    } finally {
      setCreandoTurno(false);
    }
  }

  const listaVisible = useMemo(
    () => (filtroEstado === 'todos' ? turnos : turnos.filter((t) => t.estado === filtroEstado)),
    [turnos, filtroEstado]
  );
  const grupos = useMemo(() => agruparPorDiaLocal(listaVisible, (t) => t.inicio), [listaVisible]);

  const contadores = useMemo(() => {
    const c: Record<FiltroEstado, number> = {
      todos: turnos.length,
      pendiente: 0,
      confirmado: 0,
      rechazado: 0,
      cancelado: 0,
      completado: 0,
      ausente: 0,
    };
    for (const t of turnos) c[t.estado]++;
    return c;
  }, [turnos]);

  if (!usuario) return null;

  return (
    <div className="turnos-page">
      <div className="turnos-page__head">
        <div>
          <h1 className="turnos-page__titulo">Turnos</h1>
          <div className="turnos-page__sub">
            {contadores.pendiente > 0
              ? `${contadores.pendiente} ${contadores.pendiente === 1 ? 'turno pendiente' : 'turnos pendientes'} por revisar`
              : 'Sin turnos pendientes en este rango'}
          </div>
        </div>
        {/* Visible para AMBOS roles (frontend.md §4.4) — una profesional puede
            cargar turnos para su propia agenda, misma filosofía que ya tiene
            para aprobar/rechazar/cancelar los suyos. */}
        <Button variant="primary" onClick={() => setNuevoTurnoAbierto(true)}>
          Nuevo turno
        </Button>
      </div>

      <div className="turnos-page__filtros">
        <div className="segmentado">
          {(['todos', ...ESTADOS_TURNO] as FiltroEstado[]).map((seg) => (
            <button
              key={seg}
              type="button"
              className={`segmentado__opcion${filtroEstado === seg ? ' is-activo' : ''}`}
              onClick={() => setFiltroEstado(seg)}
            >
              {ETIQUETA_SEGMENTO[seg]}
              {contadores[seg] > 0 ? <span className="segmentado__contador">{contadores[seg]}</span> : null}
            </button>
          ))}
        </div>

        <label className="filtro-fecha">
          <span>Desde</span>
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
        </label>
        <label className="filtro-fecha">
          <span>Hasta</span>
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </label>

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

      {!rangoValido ? (
        <div className="turnos-page__aviso">La fecha "hasta" no puede ser anterior a "desde".</div>
      ) : error ? (
        <div className="turnos-page__aviso turnos-page__aviso--error">{error}</div>
      ) : cargando ? (
        <div className="turnos-page__vacio">Cargando turnos…</div>
      ) : grupos.length === 0 ? (
        <div className="turnos-page__vacio">No hay turnos en esta vista.</div>
      ) : (
        grupos.map((grupo) => (
          <div className="dia-turnos" key={grupo.clave}>
            <p className="dia-turnos__etiqueta">{grupo.etiqueta}</p>
            <div className="dia-turnos__filas">
              {grupo.items.map((turno) => (
                <FilaTurno
                  key={turno.id}
                  turno={turno}
                  mostrarProfesional={esAdmin}
                  ocupado={ocupados.has(turno.id)}
                  onAbrir={abrirDetalle}
                  onAprobar={aprobar}
                  onRechazar={rechazar}
                />
              ))}
            </div>
          </div>
        ))
      )}

      <DrawerDetalleTurno control={detalleTurno} />
      {nuevoTurnoAbierto ? (
        <NuevoTurnoDrawer
          guardando={creandoTurno}
          onCrear={crearTurnoManual}
          onCerrar={() => setNuevoTurnoAbierto(false)}
        />
      ) : null}
    </div>
  );
}
