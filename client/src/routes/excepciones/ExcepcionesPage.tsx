import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CrearExcepcionInput, EditarExcepcionInput } from '@shared/schemas/excepcion.schema';
import { Button, useToast } from '../../components/ui';
import { HttpError } from '../../lib/http';
import { finDiaLocalUtc, hoyLocalISODate, inicioDiaLocalUtc } from '../../lib/format/fecha';
import { listarUsuarios } from '../profesionales/api';
import type { UsuarioPanel } from '../profesionales/types';
import * as api from './api';
import { ExcepcionDrawer, type ResultadoGuardar } from './components/ExcepcionDrawer';
import { FilaExcepcion } from './components/FilaExcepcion';
import type { ExcepcionPanel } from './types';
import './ExcepcionesPage.css';

// Mensaje mapeado por `codigo` (nunca por texto, frontend.md §2) — mismo
// criterio que el resto del panel.
function mensajeError(err: unknown): string {
  if (err instanceof HttpError) return err.message;
  return 'Ocurrió un error inesperado. Probá de nuevo en unos segundos.';
}

// CRUD de excepciones (frontend.md §4.8, admin-only — el gate de rol ya vive
// en App.tsx). Cierra el CRUD del panel. Lista filtrada por ventana + drawer
// de alta/edición. Única pantalla con DELETE físico (§15.10) — "Eliminar" en
// vez de "Desactivar", con confirmación irreversible (ver FilaExcepcion).
export function ExcepcionesPage() {
  const { mostrarToast } = useToast();

  // Ventana por defecto: de hoy en adelante, sin tope superior (frontend.md
  // §4.8, punto 1: "default de hoy en adelante"). `hastaFiltro` vacío = sin
  // acotar hacia el futuro; el usuario puede angostar la ventana a mano.
  const [desdeFiltro, setDesdeFiltro] = useState(() => hoyLocalISODate());
  const [hastaFiltro, setHastaFiltro] = useState('');
  const [profesionalFiltroId, setProfesionalFiltroId] = useState('');

  const [excepciones, setExcepciones] = useState<ExcepcionPanel[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Catálogo para el select de alcance del drawer + para resolver el nombre
  // en cada fila — reusa listarUsuarios de routes/profesionales/api.ts
  // (encargo, punto 1: "vía listarUsuarios"), no se reimplementa.
  const [usuarios, setUsuarios] = useState<UsuarioPanel[]>([]);

  const [abierto, setAbierto] = useState(false);
  const [editando, setEditando] = useState<ExcepcionPanel | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [eliminandoId, setEliminandoId] = useState<string | null>(null);

  const rangoValido = !hastaFiltro || desdeFiltro <= hastaFiltro;

  useEffect(() => {
    listarUsuarios()
      .then(setUsuarios)
      .catch(() => {
        // Si falla, el select de alcance queda sin opciones de profesional y
        // las filas muestran "Profesional" genérico en vez del nombre — no es
        // motivo para romper la pantalla (mismo criterio que
        // ProfesionalesPage con el catálogo de servicios).
      });
  }, []);

  const cargar = useCallback(async () => {
    if (!rangoValido) return;
    setCargando(true);
    setError(null);
    try {
      const data = await api.listarExcepciones({
        desde: inicioDiaLocalUtc(desdeFiltro),
        hasta: hastaFiltro ? finDiaLocalUtc(hastaFiltro) : undefined,
        profesionalId: profesionalFiltroId || undefined,
      });
      setExcepciones(data);
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setCargando(false);
    }
  }, [desdeFiltro, hastaFiltro, profesionalFiltroId, rangoValido]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const profesionales = useMemo(
    () => usuarios.filter((u) => u.rol === 'profesional').sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    [usuarios]
  );

  function nombreProfesional(id: string | null): string | null {
    if (!id) return null;
    return usuarios.find((u) => u.id === id)?.nombre ?? null;
  }

  function abrirNuevo() {
    setEditando(null);
    setAbierto(true);
  }

  function abrirEdicion(id: string) {
    const e = excepciones.find((x) => x.id === id);
    if (!e) return;
    setEditando(e);
    setAbierto(true);
  }

  function cerrar() {
    setAbierto(false);
    setEditando(null);
  }

  async function guardar(payload: CrearExcepcionInput | EditarExcepcionInput): Promise<ResultadoGuardar> {
    setGuardando(true);
    try {
      if (editando) {
        await api.editarExcepcion(editando.id, payload as EditarExcepcionInput);
        mostrarToast('Cambios guardados.', 'exito');
      } else {
        await api.crearExcepcion(payload as CrearExcepcionInput);
        mostrarToast('Excepción creada.', 'exito');
      }
      setAbierto(false);
      setEditando(null);
      await cargar();
      return { ok: true };
    } catch (err) {
      mostrarToast(mensajeError(err), 'error');
      return { ok: false };
    } finally {
      setGuardando(false);
    }
  }

  // DELETE físico (§15.10) — sin PATCH activo de por medio, a diferencia de
  // servicios/profesionales. La confirmación ya pasó en FilaExcepcion; acá
  // sólo se ejecuta y se refresca la lista.
  async function eliminar(id: string) {
    setEliminandoId(id);
    try {
      await api.eliminarExcepcion(id);
      mostrarToast('Excepción eliminada.', 'exito');
      await cargar();
    } catch (err) {
      mostrarToast(mensajeError(err), 'error');
    } finally {
      setEliminandoId(null);
    }
  }

  return (
    <div className="excepciones-page">
      <div className="excepciones-page__head">
        <h1 className="excepciones-page__titulo">Excepciones</h1>
        <Button variant="primary" onClick={abrirNuevo}>
          + Nueva excepción
        </Button>
      </div>
      <p className="excepciones-page__sub">
        Feriados, vacaciones y bloqueos puntuales. Sólo restan disponibilidad — nunca abren horario nuevo.
      </p>

      <div className="excepciones-page__filtros">
        <label className="filtro-fecha">
          <span>Desde</span>
          <input type="date" value={desdeFiltro} onChange={(e) => setDesdeFiltro(e.target.value)} />
        </label>
        <label className="filtro-fecha">
          <span>Hasta (opcional)</span>
          <input type="date" value={hastaFiltro} onChange={(e) => setHastaFiltro(e.target.value)} />
        </label>
        <label className="filtro-profesional">
          <span>Profesional</span>
          <select value={profesionalFiltroId} onChange={(e) => setProfesionalFiltroId(e.target.value)}>
            <option value="">Todas (centro + profesionales)</option>
            {profesionales.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
                {p.activo ? '' : ' (inactiva)'}
              </option>
            ))}
          </select>
        </label>
      </div>

      {!rangoValido ? (
        <div className="excepciones-page__aviso">La fecha "hasta" no puede ser anterior a "desde".</div>
      ) : error ? (
        <div className="excepciones-page__aviso excepciones-page__aviso--error">{error}</div>
      ) : cargando ? (
        <div className="excepciones-page__vacio">Cargando excepciones…</div>
      ) : excepciones.length === 0 ? (
        <div className="excepciones-page__vacio">No hay excepciones cargadas en esta ventana.</div>
      ) : (
        <div className="fila-excepcion-grupo">
          <div className="fila-excepcion fila-excepcion--header">
            <div>Tipo</div>
            <div>Rango</div>
            <div>Alcance</div>
            <div>Motivo</div>
            <div className="fila-excepcion__acciones">Acciones</div>
          </div>
          {excepciones.map((e) => (
            <FilaExcepcion
              key={e.id}
              excepcion={e}
              nombreProfesional={nombreProfesional(e.profesionalId)}
              ocupado={eliminandoId === e.id}
              onEditar={abrirEdicion}
              onEliminar={eliminar}
            />
          ))}
        </div>
      )}

      {abierto ? (
        <ExcepcionDrawer
          excepcion={editando}
          profesionales={profesionales}
          guardando={guardando}
          onGuardar={guardar}
          onCerrar={cerrar}
        />
      ) : null}
    </div>
  );
}
