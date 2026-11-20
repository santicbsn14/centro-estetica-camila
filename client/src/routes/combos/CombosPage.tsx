import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CrearExperienciaInput, EditarExperienciaInput } from '@shared/schemas/experiencia.schema';
import { Button, useToast } from '../../components/ui';
import { HttpError } from '../../lib/http';
import * as api from './api';
import { FilaCombo } from './components/FilaCombo';
import { ComboDrawer, type ResultadoGuardar } from './components/ComboDrawer';
import type { ExperienciaPanel } from './types';
// Reusa .servicios-page__*, .tag-servicio y .servicio-drawer__* (mismo
// patrón visual que Servicios, frontend.md §4.5.1); lo propio va en CombosPage.css.
import '../servicios/ServiciosPage.css';
import './CombosPage.css';

function mensajeError(err: unknown): string {
  if (err instanceof HttpError) return err.message;
  return 'Ocurrió un error inesperado. Probá de nuevo en unos segundos.';
}

// Combos y experiencias (frontend.md §4.5.1, admin-only — el gate de rol vive
// en App.tsx). Lista + drawer de alta/edición; sin DELETE, sólo
// Desactivar/Activar (PATCH activo). Los combos no se agendan.
export function CombosPage() {
  const { mostrarToast } = useToast();

  const [combos, setCombos] = useState<ExperienciaPanel[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [abierto, setAbierto] = useState(false);
  const [editando, setEditando] = useState<ExperienciaPanel | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [toggleOcupado, setToggleOcupado] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      setCombos(await api.listarExperiencias());
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  function abrirNuevo() {
    setEditando(null);
    setAbierto(true);
  }

  function abrirEdicion(id: string) {
    const c = combos.find((x) => x.id === id);
    if (!c) return;
    setEditando(c);
    setAbierto(true);
  }

  function cerrar() {
    setAbierto(false);
    setEditando(null);
  }

  async function guardar(payload: CrearExperienciaInput | EditarExperienciaInput): Promise<ResultadoGuardar> {
    setGuardando(true);
    try {
      if (editando) {
        await api.editarExperiencia(editando.id, payload as EditarExperienciaInput);
        mostrarToast('Cambios guardados.', 'exito');
      } else {
        await api.crearExperiencia(payload as CrearExperienciaInput);
        mostrarToast('Combo creado.', 'exito');
      }
      cerrar();
      await cargar();
      return { ok: true };
    } catch (err) {
      // 409 real del server, inline bajo el nombre (el chequeo local es optimista).
      if (err instanceof HttpError && err.codigo === 'NOMBRE_DUPLICADO') {
        return { ok: false, errorNombre: 'Ya existe un combo con ese nombre.' };
      }
      mostrarToast(mensajeError(err), 'error');
      return { ok: false };
    } finally {
      setGuardando(false);
    }
  }

  async function toggleActivo() {
    if (!editando) return;
    setToggleOcupado(true);
    try {
      const actualizado = await api.editarExperiencia(editando.id, { activo: !editando.activo });
      mostrarToast(actualizado.activo ? 'Combo activado.' : 'Combo desactivado · deja de mostrarse en la web.', 'exito');
      cerrar();
      await cargar();
    } catch (err) {
      mostrarToast(mensajeError(err), 'error');
    } finally {
      setToggleOcupado(false);
    }
  }

  const ordenados = useMemo(() => [...combos].sort((a, b) => a.orden - b.orden), [combos]);
  const activos = combos.filter((c) => c.activo).length;

  return (
    <div className="servicios-page">
      <div className="servicios-page__head">
        <h1 className="servicios-page__titulo">Combos</h1>
        <Button variant="primary" onClick={abrirNuevo}>
          + Nuevo combo
        </Button>
      </div>
      <p className="servicios-page__sub">
        {combos.length} {combos.length === 1 ? 'combo' : 'combos'} · {activos} activos en la web · se coordinan por
        WhatsApp, no se agendan
      </p>

      {error ? (
        <div className="servicios-page__aviso servicios-page__aviso--error">{error}</div>
      ) : cargando ? (
        <div className="servicios-page__vacio">Cargando combos…</div>
      ) : ordenados.length === 0 ? (
        <div className="servicios-page__vacio">Todavía no hay combos cargados.</div>
      ) : (
        <div className="fila-combo-grupo">
          <div className="fila-combo fila-combo--header">
            <div>Combo</div>
            <div className="fila-combo__items">Incluye</div>
            <div className="fila-combo__precio">Precio</div>
            <div>Estado</div>
          </div>
          {ordenados.map((c) => (
            <FilaCombo key={c.id} combo={c} onAbrir={abrirEdicion} />
          ))}
        </div>
      )}

      {abierto ? (
        <ComboDrawer
          combo={editando}
          combosExistentes={combos}
          guardando={guardando}
          toggleOcupado={toggleOcupado}
          onGuardar={guardar}
          onToggleActivo={editando ? toggleActivo : undefined}
          onCerrar={cerrar}
        />
      ) : null}
    </div>
  );
}
