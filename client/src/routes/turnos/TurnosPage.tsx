import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CrearTurnoInput } from '@shared/schemas/turno.schema';
import { Button, Drawer, useToast } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { HttpError } from '../../lib/http';
import { agruparPorDiaLocal, finDiaLocalUtc, hoyLocalISODate, inicioDiaLocalUtc, sumarDiasISODate } from '../../lib/format/fecha';
import * as api from './api';
import { AccionesTurno } from './components/AccionesTurno';
import { DetalleTurno } from './components/DetalleTurno';
import { FilaTurno } from './components/FilaTurno';
import { NuevoTurnoDrawer } from './components/NuevoTurnoDrawer';
import {
  ESTADOS_TURNO,
  type FiltroEstado,
  type ProfesionalFiltro,
  type ResultadoCrearTurno,
  type SlotDisponible,
  type TurnoPanel,
  type TurnoPanelLista,
} from './types';
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

// Mensaje mapeado por `codigo` (nunca por texto, frontend.md §2). El resto de
// códigos que puede devolver una transición (403 SIN_PERMISO, 404, etc.) cae
// en el mensaje que ya trae el HttpError — son casos que no deberían pasar
// desde una fila que el propio listado mostró, así que no ameritan copy
// dedicado.
function mensajeError(err: unknown): string {
  if (err instanceof HttpError) return err.message;
  return 'Ocurrió un error inesperado. Probá de nuevo en unos segundos.';
}

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

  const [turnoAbiertoId, setTurnoAbiertoId] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<TurnoPanel | null>(null);
  const [detalleCargando, setDetalleCargando] = useState(false);
  const [detalleError, setDetalleError] = useState<string | null>(null);

  const [ocupados, setOcupados] = useState<Set<string>>(new Set());

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

  const cargarDetalle = useCallback(async (id: string) => {
    setDetalleCargando(true);
    setDetalleError(null);
    try {
      const data = await api.obtenerTurno(id);
      setDetalle(data);
    } catch (err) {
      setDetalleError(mensajeError(err));
    } finally {
      setDetalleCargando(false);
    }
  }, []);

  function abrirDetalle(id: string) {
    setTurnoAbiertoId(id);
    setDetalle(null);
    cargarDetalle(id);
  }

  function cerrarDetalle() {
    setTurnoAbiertoId(null);
    setDetalle(null);
    setDetalleError(null);
  }

  // Toda transición pasa por acá: refresca lista + detalle (si está abierto)
  // en vez de asumir éxito y parchear el estado local (frontend.md §4.4,
  // PENDIENTE de impl: "manejar 409 ESTADO_INVALIDO → releer y avisar, no
  // asumir éxito"). El 409 y el éxito terminan en el mismo lugar: una
  // relectura real. La diferencia es sólo el toast.
  async function ejecutarAccion(id: string, accion: () => Promise<TurnoPanel>, mensajeExito: string) {
    setOcupados((actual) => new Set(actual).add(id));
    try {
      await accion();
      mostrarToast(mensajeExito, 'exito');
    } catch (err) {
      if (err instanceof HttpError && err.status === 409 && err.codigo === 'ESTADO_INVALIDO') {
        mostrarToast('Este turno ya cambió de estado — actualizando.', 'info');
      } else {
        mostrarToast(mensajeError(err), 'error');
      }
    } finally {
      setOcupados((actual) => {
        const siguiente = new Set(actual);
        siguiente.delete(id);
        return siguiente;
      });
      await cargarTurnos();
      if (turnoAbiertoId === id) await cargarDetalle(id);
    }
  }

  const aprobar = (id: string) => ejecutarAccion(id, () => api.aprobarTurno(id), 'Turno aprobado.');
  const rechazar = (id: string) => ejecutarAccion(id, () => api.rechazarTurno(id), 'Turno rechazado.');
  const ausente = (id: string) => ejecutarAccion(id, () => api.marcarAusente(id), 'Turno marcado como ausente.');
  const cancelar = (id: string, motivo?: string) =>
    ejecutarAccion(id, () => api.cancelarTurno(id, motivo), 'Turno cancelado.');

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

      <Drawer
        abierto={turnoAbiertoId !== null}
        onCerrar={cerrarDetalle}
        titulo={detalle?.codigo}
        footer={
          detalle ? (
            <AccionesTurno
              estado={detalle.estado}
              ocupado={ocupados.has(detalle.id)}
              onAprobar={() => aprobar(detalle.id)}
              onRechazar={() => rechazar(detalle.id)}
              onCancelar={(motivo) => cancelar(detalle.id, motivo)}
              onAusente={() => ausente(detalle.id)}
            />
          ) : undefined
        }
      >
        {detalleCargando ? (
          <p className="turnos-page__vacio">Cargando…</p>
        ) : detalleError ? (
          <p className="turnos-page__aviso turnos-page__aviso--error">{detalleError}</p>
        ) : detalle ? (
          <DetalleTurno turno={detalle} />
        ) : null}
      </Drawer>

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
