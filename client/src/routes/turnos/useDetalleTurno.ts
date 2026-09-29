import { useCallback, useState } from 'react';
import { useToast } from '../../components/ui';
import { HttpError } from '../../lib/http';
import * as api from './api';
import type { TurnoPanel } from './types';

// Mensaje mapeado por `codigo` (nunca por texto, frontend.md §2). El resto de
// códigos que puede devolver una transición (403 SIN_PERMISO, 404, etc.) cae
// en el mensaje que ya trae el HttpError — son casos que no deberían pasar
// desde un turno que la propia vista mostró, así que no ameritan copy
// dedicado.
export function mensajeError(err: unknown): string {
  if (err instanceof HttpError) return err.message;
  return 'Ocurrió un error inesperado. Probá de nuevo en unos segundos.';
}

/**
 * Orquestación del drawer de detalle de turno (frontend.md §4.4), compartida
 * entre el listado (TurnosPage) y la agenda semanal (AgendaPage, §4.14):
 * fetch de GET /api/turnos/:id, estado del drawer y `ejecutarAccion` para las
 * transiciones. `recargar` es el refetch de la vista que lo usa — se llama
 * después de cada acción, con éxito o sin él.
 */
export function useDetalleTurno(recargar: () => Promise<void>) {
  const { mostrarToast } = useToast();

  const [turnoAbiertoId, setTurnoAbiertoId] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<TurnoPanel | null>(null);
  const [detalleCargando, setDetalleCargando] = useState(false);
  const [detalleError, setDetalleError] = useState<string | null>(null);

  const [ocupados, setOcupados] = useState<Set<string>>(new Set());

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

  // Toda transición pasa por acá: refresca la vista + detalle (si está
  // abierto) en vez de asumir éxito y parchear el estado local (frontend.md
  // §4.4, "manejar 409 ESTADO_INVALIDO → releer y avisar, no asumir éxito").
  // El 409 y el éxito terminan en el mismo lugar: una relectura real. La
  // diferencia es sólo el toast.
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
      await recargar();
      if (turnoAbiertoId === id) await cargarDetalle(id);
    }
  }

  const aprobar = (id: string) => ejecutarAccion(id, () => api.aprobarTurno(id), 'Turno aprobado.');
  const rechazar = (id: string) => ejecutarAccion(id, () => api.rechazarTurno(id), 'Turno rechazado.');
  const ausente = (id: string) => ejecutarAccion(id, () => api.marcarAusente(id), 'Turno marcado como ausente.');
  const cancelar = (id: string, motivo?: string) =>
    ejecutarAccion(id, () => api.cancelarTurno(id, motivo), 'Turno cancelado.');

  return {
    turnoAbiertoId,
    detalle,
    detalleCargando,
    detalleError,
    ocupados,
    abrirDetalle,
    cerrarDetalle,
    aprobar,
    rechazar,
    ausente,
    cancelar,
  };
}

export type DetalleTurnoControl = ReturnType<typeof useDetalleTurno>;
