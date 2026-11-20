import { useState } from 'react';
import { crearCategoriaSchema, editarCategoriaSchema } from '@shared/schemas/categoria.schema';
import { Button, Drawer, Input, useToast } from '../../../components/ui';
import { HttpError } from '../../../lib/http';
import * as api from '../api';
import type { CategoriaPanel } from '../types';

export interface CategoriasDrawerProps {
  categorias: CategoriaPanel[];
  // Refetch del listado en el padre (ServiciosPage) tras cada cambio — así el
  // select de ServicioDrawer y las filas ven el mismo estado.
  onCambio: () => Promise<void>;
  onCerrar: () => void;
}

const MENSAJE_NOMBRE = 'Poné un nombre de 2 a 40 caracteres.';
const MENSAJE_ORDEN = 'Ingresá un número entero.';

function mensajeError(err: unknown): string {
  if (err instanceof HttpError) return err.message;
  return 'Ocurrió un error inesperado. Probá de nuevo en unos segundos.';
}

// 409 CATEGORIA_CON_SERVICIOS ⇒ detalle.servicios: [{ id, nombre }]
// (modelo-datos-turnos.md §15.7.1). Copy fijado en frontend.md §4.5.
function mensajeConServicios(detalle: unknown): string {
  const servicios =
    (detalle as { servicios?: { nombre: string }[] } | undefined)?.servicios?.map((s) => s.nombre) ?? [];
  const n = servicios.length;
  const lista = servicios.join(', ');
  const cuantos = n === 1 ? '1 servicio activo' : `${n} servicios activos`;
  return `Tiene ${cuantos}${lista ? `: ${lista}` : ''}. Pasalos a otra categoría antes de borrarla.`;
}

type ResultadoForm = { ok: true } | { ok: false; errorNombre?: string; errorOrden?: string };

// Valida con el schema real de @shared (frontend.md §4.0) y traduce a
// mensajes por campo.
function validarCampos(
  schema: typeof crearCategoriaSchema | typeof editarCategoriaSchema,
  nombre: string,
  orden: string
): { datos: { nombre: string; orden: number } } | { errorNombre?: string; errorOrden?: string } {
  const ordenNum = orden.trim() === '' ? NaN : Number(orden);
  const parsed = schema.safeParse({ nombre, orden: ordenNum });
  if (parsed.success) return { datos: { nombre: nombre.trim(), orden: ordenNum } };
  const campos = parsed.error.flatten().fieldErrors as Record<string, string[] | undefined>;
  return {
    errorNombre: campos.nombre ? MENSAJE_NOMBRE : undefined,
    errorOrden: campos.orden ? MENSAJE_ORDEN : undefined,
  };
}

// Drawer de gestión de categorías (frontend.md §4.5, "Categorías
// autoadministrables"). Lista por orden + alta inline + editar nombre/orden +
// eliminar con confirmación inline (patrón FilaExcepcion).
export function CategoriasDrawer({ categorias, onCambio, onCerrar }: CategoriasDrawerProps) {
  const { mostrarToast } = useToast();

  const ordenSugerido = categorias.length === 0 ? 0 : Math.max(...categorias.map((c) => c.orden)) + 1;
  const [nombreNueva, setNombreNueva] = useState('');
  const [ordenNueva, setOrdenNueva] = useState<string | null>(null); // null = sugerido
  const [erroresNueva, setErroresNueva] = useState<{ errorNombre?: string; errorOrden?: string }>({});
  const [creando, setCreando] = useState(false);

  async function crear() {
    const ordenTexto = ordenNueva ?? String(ordenSugerido);
    const v = validarCampos(crearCategoriaSchema, nombreNueva, ordenTexto);
    if (!('datos' in v)) {
      setErroresNueva(v);
      return;
    }
    setCreando(true);
    try {
      await api.crearCategoria(v.datos);
      mostrarToast('Categoría creada.', 'exito');
      setNombreNueva('');
      setOrdenNueva(null);
      setErroresNueva({});
      await onCambio();
    } catch (err) {
      if (err instanceof HttpError && err.codigo === 'NOMBRE_DUPLICADO') {
        setErroresNueva({ errorNombre: 'Ya existe una categoría con ese nombre.' });
      } else {
        mostrarToast(mensajeError(err), 'error');
      }
    } finally {
      setCreando(false);
    }
  }

  async function editar(id: string, nombre: string, orden: string): Promise<ResultadoForm> {
    const v = validarCampos(editarCategoriaSchema, nombre, orden);
    if (!('datos' in v)) return { ok: false, ...v };
    try {
      await api.editarCategoria(id, v.datos);
      mostrarToast('Cambios guardados.', 'exito');
      await onCambio();
      return { ok: true };
    } catch (err) {
      if (err instanceof HttpError && err.codigo === 'NOMBRE_DUPLICADO') {
        return { ok: false, errorNombre: 'Ya existe una categoría con ese nombre.' };
      }
      mostrarToast(mensajeError(err), 'error');
      return { ok: false };
    }
  }

  // Devuelve el mensaje de error a mostrar en la fila, o null si se borró.
  async function eliminar(id: string): Promise<string | null> {
    try {
      await api.eliminarCategoria(id);
      mostrarToast('Categoría eliminada.', 'exito');
      await onCambio();
      return null;
    } catch (err) {
      if (err instanceof HttpError && err.codigo === 'CATEGORIA_CON_SERVICIOS') {
        return mensajeConServicios(err.detalle);
      }
      return mensajeError(err);
    }
  }

  const ordenadas = [...categorias].sort(
    (a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' })
  );

  return (
    <Drawer
      abierto
      onCerrar={onCerrar}
      titulo="Categorías"
      footer={
        <Button variant="secondary" onClick={onCerrar}>
          Cerrar
        </Button>
      }
    >
      <p className="categorias-drawer__aviso">Las categorías sin servicios activos no se muestran en la web.</p>

      {ordenadas.length === 0 ? (
        <p className="categorias-drawer__vacio">Todavía no hay categorías.</p>
      ) : (
        <ul className="categorias-drawer__lista">
          {ordenadas.map((c) => (
            <FilaCategoria key={c.id} categoria={c} onEditar={editar} onEliminar={eliminar} />
          ))}
        </ul>
      )}

      <div className="categorias-drawer__alta">
        <h3 className="categorias-drawer__alta-titulo">Nueva categoría</h3>
        <div className="categorias-drawer__form">
          <Input
            label="Nombre"
            value={nombreNueva}
            onChange={(e) => setNombreNueva(e.target.value)}
            placeholder="Ej: Depilación"
            maxLength={40}
            error={erroresNueva.errorNombre}
            onKeyDown={(e) => {
              if (e.key === 'Enter') crear();
            }}
          />
          <Input
            label="Orden"
            type="number"
            step={1}
            className="categorias-drawer__orden"
            value={ordenNueva ?? String(ordenSugerido)}
            onChange={(e) => setOrdenNueva(e.target.value)}
            error={erroresNueva.errorOrden}
          />
          <Button variant="primary" disabled={creando} onClick={crear} className="categorias-drawer__agregar">
            Agregar
          </Button>
        </div>
      </div>
    </Drawer>
  );
}

interface FilaCategoriaProps {
  categoria: CategoriaPanel;
  onEditar: (id: string, nombre: string, orden: string) => Promise<ResultadoForm>;
  onEliminar: (id: string) => Promise<string | null>;
}

function FilaCategoria({ categoria, onEditar, onEliminar }: FilaCategoriaProps) {
  const [modo, setModo] = useState<'ver' | 'editar' | 'confirmar'>('ver');
  const [nombre, setNombre] = useState(categoria.nombre);
  const [orden, setOrden] = useState(String(categoria.orden));
  const [errores, setErrores] = useState<{ errorNombre?: string; errorOrden?: string }>({});
  const [errorEliminar, setErrorEliminar] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  function empezarEdicion() {
    setNombre(categoria.nombre);
    setOrden(String(categoria.orden));
    setErrores({});
    setErrorEliminar(null);
    setModo('editar');
  }

  async function guardar() {
    setOcupado(true);
    const r = await onEditar(categoria.id, nombre, orden);
    setOcupado(false);
    if (r.ok) setModo('ver');
    else setErrores({ errorNombre: r.errorNombre, errorOrden: r.errorOrden });
  }

  async function confirmarEliminar() {
    setOcupado(true);
    const error = await onEliminar(categoria.id);
    // Si se borró, la fila se desmonta con el refetch del padre.
    if (error) {
      setOcupado(false);
      setErrorEliminar(error);
      setModo('ver');
    }
  }

  const cuenta = categoria.serviciosActivos === 1 ? '1 servicio' : `${categoria.serviciosActivos} servicios`;

  if (modo === 'editar') {
    return (
      <li className="fila-categoria fila-categoria--editando">
        <div className="categorias-drawer__form">
          <Input
            label="Nombre"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            maxLength={40}
            error={errores.errorNombre}
            autoFocus
          />
          <Input
            label="Orden"
            type="number"
            step={1}
            className="categorias-drawer__orden"
            value={orden}
            onChange={(e) => setOrden(e.target.value)}
            error={errores.errorOrden}
          />
        </div>
        <div className="fila-categoria__acciones">
          <Button variant="ghost" size="sm" disabled={ocupado} onClick={() => setModo('ver')}>
            Cancelar
          </Button>
          <Button variant="primary" size="sm" disabled={ocupado} onClick={guardar}>
            Guardar
          </Button>
        </div>
      </li>
    );
  }

  return (
    <li className="fila-categoria">
      <div className="fila-categoria__fila">
        <div className="fila-categoria__info">
          <span className="fila-categoria__nombre">{categoria.nombre}</span>
          <span className="fila-categoria__meta num">
            Orden {categoria.orden} · {cuenta}
          </span>
        </div>
        <div className="fila-categoria__acciones">
          {modo === 'confirmar' ? (
            <>
              <span className="fila-categoria__confirmar-texto">¿Eliminar? No se puede deshacer.</span>
              <Button variant="ghost" size="sm" disabled={ocupado} onClick={() => setModo('ver')}>
                Cancelar
              </Button>
              <Button variant="danger" size="sm" disabled={ocupado} onClick={confirmarEliminar}>
                Sí, eliminar
              </Button>
            </>
          ) : (
            <>
              <Button variant="secondary" size="sm" onClick={empezarEdicion}>
                Editar
              </Button>
              <Button
                variant="danger-outline"
                size="sm"
                onClick={() => {
                  setErrorEliminar(null);
                  setModo('confirmar');
                }}
              >
                Eliminar
              </Button>
            </>
          )}
        </div>
      </div>
      {errorEliminar ? (
        <p className="fila-categoria__error" role="alert">
          {errorEliminar}
        </p>
      ) : null}
    </li>
  );
}
