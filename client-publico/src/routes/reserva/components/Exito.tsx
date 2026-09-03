import { etiquetaDia, horaLocal } from '../../../lib/format/fecha';
import type { TurnoCreado } from '../types';

interface Props {
  resultado: TurnoCreado;
  profesionalNombre: string;
}

// Paso 4 — éxito (frontend.md §4.11). Clonado de .success/.wa-note del
// mockup. NUNCA muestra tokenGestion: la respuesta 201 no lo trae (§15.1).
export function Exito({ resultado, profesionalNombre }: Props) {
  return (
    <div className="success">
      <img src="/logo_lg.png" alt="Camila González · Salón de belleza" />
      <h1>
        <svg
          className="chk"
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.6"
          aria-hidden="true"
        >
          <path d="M20 6L9 17l-5-5" />
        </svg>
        ¡Listo, la enviamos!
      </h1>
      <p>Tu solicitud está pendiente de confirmación. Te avisamos por WhatsApp apenas Camila la confirme.</p>
      <div className="card">
        <div className="row">
          <span className="k">Servicio</span>
          <span className="v">{resultado.servicio.nombre}</span>
        </div>
        <div className="row">
          <span className="k">Con</span>
          <span className="v">{profesionalNombre}</span>
        </div>
        <div className="row">
          <span className="k">Cuándo</span>
          <span className="v">
            {etiquetaDia(resultado.inicio)} · {horaLocal(resultado.inicio)} hs
          </span>
        </div>
      </div>
      <div className="wa-note">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path
            d="M12 2C6.5 2 2 6.5 2 12c0 1.8.5 3.5 1.3 5L2 22l5.2-1.3c1.5.8 3.1 1.3 4.8 1.3 5.5 0 10-4.5 10-10S17.5 2 12 2zm0 18c-1.5 0-3-.4-4.2-1.1l-.3-.2-3.1.8.8-3-.2-.3C4.4 15 4 13.5 4 12c0-4.4 3.6-8 8-8s8 3.6 8 8-3.6 8-8 8z"
          />
        </svg>
        <span>Vas a recibir un WhatsApp con la confirmación y un link para cancelar si no podés venir.</span>
      </div>
    </div>
  );
}
