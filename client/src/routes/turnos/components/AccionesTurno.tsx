import { useState } from 'react';
import { Button } from '../../../components/ui';
import type { EstadoTurno } from '@shared/schemas/common.schema';

export interface AccionesTurnoProps {
  estado: EstadoTurno;
  ocupado: boolean;
  onAprobar: () => void;
  onRechazar: () => void;
  onCancelar: (motivo?: string) => void;
  onAusente: () => void;
}

type PasoConfirmacion = 'rechazar' | 'cancelar' | null;

// Acciones por estado (frontend.md §4.4): pendiente → aprobar/rechazar/
// cancelar; confirmado → cancelar/ausente; terminal → ninguna. Rechazar y
// cancelar pasan por un gate de confirmación (mismo patrón que el mockup,
// askMotivo) antes de ejecutar — aprobar/ausente son de un solo click.
//
// Cancelar SÍ manda motivo (cancelarTurnoPanelSchema lo acepta, §15.5).
// Rechazar NO ofrece campo de motivo: la ruta server no lo parsea (ver
// api.ts y el ⚠ REVISAR EN WEB en frontend.md §5) — ofrecer un campo que se
// pierde en silencio sería peor que no ofrecerlo. El gate de confirmación
// para rechazar es sólo eso, confirmación, sin texto libre.
export function AccionesTurno({ estado, ocupado, onAprobar, onRechazar, onCancelar, onAusente }: AccionesTurnoProps) {
  const [paso, setPaso] = useState<PasoConfirmacion>(null);
  const [motivo, setMotivo] = useState('');

  if (paso === 'rechazar') {
    return (
      <div className="acciones-turno__confirmar">
        <p className="acciones-turno__confirmar-texto">¿Rechazar este turno? La clienta va a recibir un aviso.</p>
        <div className="acciones-turno__confirmar-botones">
          <Button variant="secondary" disabled={ocupado} onClick={() => setPaso(null)}>
            Volver
          </Button>
          <Button
            variant="danger"
            disabled={ocupado}
            onClick={() => {
              setPaso(null);
              onRechazar();
            }}
          >
            Rechazar turno
          </Button>
        </div>
      </div>
    );
  }

  if (paso === 'cancelar') {
    return (
      <div className="acciones-turno__confirmar">
        <label className="acciones-turno__motivo">
          <span className="acciones-turno__motivo-label">Motivo (opcional) — queda en el historial</span>
          <textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            maxLength={200}
            rows={3}
            disabled={ocupado}
          />
        </label>
        <div className="acciones-turno__confirmar-botones">
          <Button variant="secondary" disabled={ocupado} onClick={() => setPaso(null)}>
            Volver
          </Button>
          <Button
            variant="danger"
            disabled={ocupado}
            onClick={() => {
              const motivoEnviado = motivo.trim();
              setPaso(null);
              setMotivo('');
              onCancelar(motivoEnviado || undefined);
            }}
          >
            Cancelar turno
          </Button>
        </div>
      </div>
    );
  }

  if (estado === 'pendiente') {
    return (
      <>
        <Button variant="primary" disabled={ocupado} onClick={onAprobar}>
          Aprobar
        </Button>
        <Button variant="secondary" disabled={ocupado} onClick={() => setPaso('rechazar')}>
          Rechazar
        </Button>
        <Button variant="secondary" disabled={ocupado} onClick={() => setPaso('cancelar')}>
          Cancelar
        </Button>
      </>
    );
  }

  if (estado === 'confirmado') {
    return (
      <>
        <Button variant="secondary" disabled={ocupado} onClick={() => setPaso('cancelar')}>
          Cancelar
        </Button>
        <Button variant="secondary" disabled={ocupado} onClick={onAusente}>
          Marcar ausente
        </Button>
      </>
    );
  }

  return <p className="acciones-turno__sin-acciones">Turno {estado} · sin acciones disponibles.</p>;
}
