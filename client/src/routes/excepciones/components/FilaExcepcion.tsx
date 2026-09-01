import { useState } from 'react';
import { Button } from '../../../components/ui';
import { formatearRangoExcepcion } from '../format';
import type { ExcepcionPanel, TipoExcepcion } from '../types';

export interface FilaExcepcionProps {
  excepcion: ExcepcionPanel;
  // Resuelto por el padre (lookup sobre el listado de usuarios ya cargado
  // para el select del drawer, frontend.md §4.8: "nombre profesional vía
  // listarUsuarios") — null cuando profesionalId es null (todo el centro) o
  // cuando el usuario referenciado ya no está en el listado.
  nombreProfesional: string | null;
  ocupado: boolean;
  onEditar: (id: string) => void;
  onEliminar: (id: string) => void;
}

// Fila de listado (frontend.md §4.8): tag de tipo · rango · alcance · motivo ·
// acciones. A diferencia de servicios/profesionales (fila entera abre el
// drawer, la acción destructiva vive adentro) acá "editar"/"eliminar" son
// botones EXPLÍCITOS en la fila — el encargo los pide ahí, no en el drawer,
// justamente porque "eliminar" es el único DELETE físico del sistema y tiene
// que quedar visible, no escondido un nivel más adentro.
export function FilaExcepcion({ excepcion, nombreProfesional, ocupado, onEditar, onEliminar }: FilaExcepcionProps) {
  // Confirmación irreversible inline (mismo lenguaje que el gate de
  // paso-de-confirmación de AccionesTurno.tsx — ahí vive en el footer del
  // drawer, acá en la celda de acciones de la fila porque no hay drawer
  // intermedio para esta acción).
  const [confirmando, setConfirmando] = useState(false);

  return (
    <div className="fila-excepcion">
      <div className="fila-excepcion__celda">
        <TagExcepcion tipo={excepcion.tipo} />
      </div>

      <div className="fila-excepcion__celda fila-excepcion__rango">
        {formatearRangoExcepcion(excepcion.desde, excepcion.hasta)}
      </div>

      <div className="fila-excepcion__celda">
        {excepcion.profesionalId ? nombreProfesional ?? 'Profesional' : 'Todo el centro'}
      </div>

      <div className="fila-excepcion__celda fila-excepcion__motivo">
        {excepcion.motivo || <span className="fila-excepcion__sin-motivo">Sin motivo</span>}
      </div>

      <div className="fila-excepcion__celda fila-excepcion__acciones">
        {confirmando ? (
          <>
            <span className="fila-excepcion__confirmar-texto">¿Eliminar? No se puede deshacer.</span>
            <Button variant="ghost" size="sm" disabled={ocupado} onClick={() => setConfirmando(false)}>
              Cancelar
            </Button>
            <Button variant="danger" size="sm" disabled={ocupado} onClick={() => onEliminar(excepcion.id)}>
              Sí, eliminar
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" size="sm" disabled={ocupado} onClick={() => onEditar(excepcion.id)}>
              Editar
            </Button>
            <Button variant="danger-outline" size="sm" disabled={ocupado} onClick={() => setConfirmando(true)}>
              Eliminar
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

const TAG_LABEL: Record<TipoExcepcion, string> = {
  feriado: 'Feriado',
  vacaciones: 'Vacaciones',
  bloqueo: 'Bloqueo',
};

// Mapping de tonos (frontend.md §4.8: "tres tonos diferenciables tomados del
// set de §3, NO hues nuevos" — documentado acá, no hay mockup que clonar):
//   feriado    → tono "confirmado" (verde) — el centro cierra, sin urgencia,
//                más cerca de "algo programado y positivo" que de un aviso.
//   vacaciones → tono "pendiente" (ámbar) — alguien está afuera, amerita
//                atención al armar la agenda, sin ser un bloqueo duro.
//   bloqueo    → tono "rechazado" (rojo) — el más restrictivo de los tres,
//                un corte de horario puntual.
// Verde/ámbar/rojo da la mayor separación de hue posible dentro del set
// cerrado de §3, sin inventar un color nuevo.
function TagExcepcion({ tipo }: { tipo: TipoExcepcion }) {
  return <span className={`tag-excepcion tag-excepcion--${tipo}`}>{TAG_LABEL[tipo]}</span>;
}
