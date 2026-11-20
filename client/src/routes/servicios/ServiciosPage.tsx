import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CrearServicioInput, EditarServicioInput } from '@shared/schemas/servicio.schema';
import { Button, useToast } from '../../components/ui';
import { HttpError } from '../../lib/http';
import * as api from './api';
import { FilaServicio } from './components/FilaServicio';
import { ServicioDrawer, type ResultadoGuardar } from './components/ServicioDrawer';
import { CategoriasDrawer } from './components/CategoriasDrawer';
import type { CategoriaPanel, ServicioPanel } from './types';
import './ServiciosPage.css';

// Mensaje mapeado por `codigo` (nunca por texto, frontend.md §2) — mismo
// criterio que TurnosPage.
function mensajeError(err: unknown): string {
  if (err instanceof HttpError) return err.message;
  return 'Ocurrió un error inesperado. Probá de nuevo en unos segundos.';
}

// CRUD de servicios (frontend.md §4.5, admin-only — el gate de rol ya vive en
// App.tsx). Lista + drawer de alta/edición; sin DELETE, sólo Desactivar/
// Activar (PATCH activo, borrado lógico).
export function ServiciosPage() {
  const { mostrarToast } = useToast();

  const [servicios, setServicios] = useState<ServicioPanel[]>([]);
  // Categorías (§15.7.1): para el select del drawer, el nombre en cada fila y
  // el drawer de gestión. Se recargan junto con los servicios.
  const [categorias, setCategorias] = useState<CategoriaPanel[]>([]);
  const [categoriasAbierto, setCategoriasAbierto] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [abierto, setAbierto] = useState(false);
  const [editando, setEditando] = useState<ServicioPanel | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [toggleOcupadoId, setToggleOcupadoId] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const [listaServicios, listaCategorias] = await Promise.all([api.listarServicios(), api.listarCategorias()]);
      setServicios(listaServicios);
      setCategorias(listaCategorias);
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
    const s = servicios.find((x) => x.id === id);
    if (!s) return;
    setEditando(s);
    setAbierto(true);
  }

  function cerrar() {
    setAbierto(false);
    setEditando(null);
  }

  async function guardar(payload: CrearServicioInput | EditarServicioInput): Promise<ResultadoGuardar> {
    setGuardando(true);
    try {
      if (editando) {
        await api.editarServicio(editando.id, payload as EditarServicioInput);
        mostrarToast('Cambios guardados.', 'exito');
      } else {
        await api.crearServicio(payload as CrearServicioInput);
        mostrarToast('Servicio creado.', 'exito');
      }
      setAbierto(false);
      setEditando(null);
      await cargar();
      return { ok: true };
    } catch (err) {
      // 409 NOMBRE_DUPLICADO real del server (frontend.md §4.5, punto 4): el
      // chequeo local es sólo optimista, el server manda — se muestra inline
      // bajo el campo nombre en vez de un toast genérico, ver ServicioDrawer.
      if (err instanceof HttpError && err.codigo === 'NOMBRE_DUPLICADO') {
        return { ok: false, errorNombre: err.message };
      }
      mostrarToast(mensajeError(err), 'error');
      return { ok: false };
    } finally {
      setGuardando(false);
    }
  }

  async function toggleActivo() {
    if (!editando) return;
    const id = editando.id;
    setToggleOcupadoId(id);
    try {
      const actualizado = await api.editarServicio(id, { activo: !editando.activo });
      mostrarToast(
        actualizado.activo ? 'Servicio activado.' : 'Servicio desactivado · deja de ofrecerse en la web.',
        'exito'
      );
      setAbierto(false);
      setEditando(null);
      await cargar();
    } catch (err) {
      mostrarToast(mensajeError(err), 'error');
    } finally {
      setToggleOcupadoId(null);
    }
  }

  // Desde el drawer de categorías: refresca sólo categorías (el conteo
  // serviciosActivos y el select), sin el "Cargando…" de la lista entera.
  const recargarCategorias = useCallback(async () => {
    try {
      setCategorias(await api.listarCategorias());
    } catch (err) {
      mostrarToast(mensajeError(err), 'error');
    }
  }, [mostrarToast]);

  const nombreCategoria = useMemo(() => new Map(categorias.map((c) => [c.id, c.nombre])), [categorias]);
  const ordenados = useMemo(() => [...servicios].sort((a, b) => a.orden - b.orden), [servicios]);
  const activos = servicios.filter((s) => s.activo).length;

  return (
    <div className="servicios-page">
      <div className="servicios-page__head">
        <h1 className="servicios-page__titulo">Servicios</h1>
        <div className="servicios-page__acciones">
          <Button variant="secondary" onClick={() => setCategoriasAbierto(true)}>
            Categorías
          </Button>
          <Button variant="primary" onClick={abrirNuevo}>
            + Nuevo servicio
          </Button>
        </div>
      </div>
      <p className="servicios-page__sub">
        {servicios.length} {servicios.length === 1 ? 'servicio' : 'servicios'} · {activos} activos en la web
      </p>

      {error ? (
        <div className="servicios-page__aviso servicios-page__aviso--error">{error}</div>
      ) : cargando ? (
        <div className="servicios-page__vacio">Cargando servicios…</div>
      ) : ordenados.length === 0 ? (
        <div className="servicios-page__vacio">Todavía no hay servicios cargados.</div>
      ) : (
        <div className="fila-servicio-grupo">
          <div className="fila-servicio fila-servicio--header">
            <div>Servicio</div>
            <div className="fila-servicio__cat">Categoría</div>
            <div className="fila-servicio__dur">Duración</div>
            <div className="fila-servicio__buf">Limpieza</div>
            <div className="fila-servicio__precio">Precio</div>
            <div>Horario</div>
            <div>Estado</div>
          </div>
          {ordenados.map((s) => (
            <FilaServicio
              key={s.id}
              servicio={s}
              // Huérfano (categoría borrada en carrera) ⇒ null, igual que la web.
              nombreCategoria={s.categoriaId ? nombreCategoria.get(s.categoriaId) ?? null : null}
              onAbrir={abrirEdicion}
            />
          ))}
        </div>
      )}

      {abierto ? (
        <ServicioDrawer
          servicio={editando}
          serviciosExistentes={servicios}
          categorias={categorias}
          guardando={guardando}
          toggleOcupado={toggleOcupadoId === editando?.id}
          onGuardar={guardar}
          onToggleActivo={editando ? toggleActivo : undefined}
          onCerrar={cerrar}
        />
      ) : null}

      {categoriasAbierto ? (
        <CategoriasDrawer
          categorias={categorias}
          onCambio={recargarCategorias}
          onCerrar={() => setCategoriasAbierto(false)}
        />
      ) : null}
    </div>
  );
}
