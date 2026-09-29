import { Drawer } from '../../../components/ui';
import type { DetalleTurnoControl } from '../useDetalleTurno';
import { AccionesTurno } from './AccionesTurno';
import { DetalleTurno } from './DetalleTurno';
// Los estilos del contenido (detalle-turno__*, acciones-turno__*,
// turnos-page__vacio/aviso) viven en la hoja del listado; se importa acá para
// que el drawer quede estilado también fuera de /turnos (agenda, §4.14).
import '../TurnosPage.css';

export interface DrawerDetalleTurnoProps {
  control: DetalleTurnoControl;
}

// Drawer de detalle (frontend.md §4.4), alimentado por useDetalleTurno. Mismo
// markup que tenía inline TurnosPage — extraído para reusarlo en la agenda.
export function DrawerDetalleTurno({ control }: DrawerDetalleTurnoProps) {
  const { turnoAbiertoId, detalle, detalleCargando, detalleError, ocupados, cerrarDetalle } = control;

  return (
    <Drawer
      abierto={turnoAbiertoId !== null}
      onCerrar={cerrarDetalle}
      titulo={detalle?.codigo}
      footer={
        detalle ? (
          <AccionesTurno
            estado={detalle.estado}
            ocupado={ocupados.has(detalle.id)}
            onAprobar={() => control.aprobar(detalle.id)}
            onRechazar={() => control.rechazar(detalle.id)}
            onCancelar={(motivo) => control.cancelar(detalle.id, motivo)}
            onAusente={() => control.ausente(detalle.id)}
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
  );
}
