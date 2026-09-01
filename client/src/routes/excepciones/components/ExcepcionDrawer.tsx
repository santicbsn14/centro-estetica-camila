import { useId, useState } from 'react';
import { crearExcepcionSchema, editarExcepcionSchema } from '@shared/schemas/excepcion.schema';
import type { CrearExcepcionInput, EditarExcepcionInput } from '@shared/schemas/excepcion.schema';
import { Button, Drawer, Switch } from '../../../components/ui';
import { fechaHoraLocalUtc, finDiaLocalUtc, inicioDiaLocalUtc, aLocal, hoyLocalISODate } from '../../../lib/format/fecha';
import type { UsuarioPanel } from '../../profesionales/types';
import type { ExcepcionPanel, TipoExcepcion } from '../types';
import { TIPOS_EXCEPCION } from '../types';

export type ResultadoGuardar = { ok: true } | { ok: false };

export interface ExcepcionDrawerProps {
  // null = alta. Presente = edición de ESA excepción (frontend.md §4.8).
  excepcion: ExcepcionPanel | null;
  // Catálogo para el select de alcance — reusa listarUsuarios de
  // routes/profesionales/api.ts (encargo, punto 1: "vía listarUsuarios"),
  // ya filtrado a rol==='profesional' por el padre.
  profesionales: UsuarioPanel[];
  guardando: boolean;
  onGuardar: (payload: CrearExcepcionInput | EditarExcepcionInput) => Promise<ResultadoGuardar>;
  onCerrar: () => void;
}

const TIPO_LABEL: Record<TipoExcepcion, string> = {
  feriado: 'Feriado',
  vacaciones: 'Vacaciones',
  bloqueo: 'Bloqueo',
};

const HORA_DESDE_DEFAULT = '09:00';
const HORA_HASTA_DEFAULT = '18:00';

// Deriva el estado inicial de fecha/hora/todoElDia a partir de una excepción
// existente — mismo criterio de inferencia que FilaExcepcion/format.ts (no
// hay campo `todoElDia` persistido, §15.10: el server sólo guarda los dos
// instantes UTC ya armados).
function estadoFechaInicial(excepcion: ExcepcionPanel | null) {
  if (!excepcion) {
    const hoy = hoyLocalISODate();
    return { fechaDesde: hoy, fechaHasta: hoy, horaDesde: HORA_DESDE_DEFAULT, horaHasta: HORA_HASTA_DEFAULT, todoElDia: true };
  }
  const desde = aLocal(excepcion.desde);
  const hasta = aLocal(excepcion.hasta);
  const todoElDia = desde.hour === 0 && desde.minute === 0 && hasta.hour === 23 && hasta.minute === 59;
  return {
    fechaDesde: desde.toISODate() as string,
    fechaHasta: hasta.toISODate() as string,
    horaDesde: todoElDia ? HORA_DESDE_DEFAULT : desde.toFormat('HH:mm'),
    horaHasta: todoElDia ? HORA_HASTA_DEFAULT : hasta.toFormat('HH:mm'),
    todoElDia,
  };
}

// Drawer de alta/edición (frontend.md §4.8). Sólo se monta mientras está
// abierto (mismo criterio que ServicioDrawer/UsuarioDrawer) — arranca
// siempre desde cero, sin necesitar resetear estado por props.
export function ExcepcionDrawer({ excepcion, profesionales, guardando, onGuardar, onCerrar }: ExcepcionDrawerProps) {
  const [tipo, setTipo] = useState<TipoExcepcion>(excepcion?.tipo ?? 'feriado');
  const [profesionalId, setProfesionalId] = useState<string>(excepcion?.profesionalId ?? '');
  const inicial = estadoFechaInicial(excepcion);
  const [fechaDesde, setFechaDesde] = useState(inicial.fechaDesde);
  const [fechaHasta, setFechaHasta] = useState(inicial.fechaHasta);
  const [horaDesde, setHoraDesde] = useState(inicial.horaDesde);
  const [horaHasta, setHoraHasta] = useState(inicial.horaHasta);
  const [todoElDia, setTodoElDia] = useState(inicial.todoElDia);
  const [motivo, setMotivo] = useState(excepcion?.motivo ?? '');
  const [errorRango, setErrorRango] = useState<string | undefined>();
  const [errorGeneral, setErrorGeneral] = useState<string | undefined>();

  const motivoId = useId();

  // Toggle OFF ⇒ día único (§4.8: "OFF ⇒ día único con time desde/hasta") —
  // fuerza fechaHasta = fechaDesde para que no quede un rango multi-día
  // stale escondido detrás del campo que se oculta.
  function handleTodoElDia(valor: boolean) {
    setTodoElDia(valor);
    if (!valor) setFechaHasta(fechaDesde);
  }

  // Arma los dos instantes en local y los manda como ISO UTC con Z (§4.8,
  // CONTRATO DE FECHAS — mismo helper que el filtro de fecha de turnos,
  // inicioDiaLocalUtc/finDiaLocalUtc, más fechaHoraLocalUtc para el bloqueo
  // parcial, agregado en esta tarea a lib/format/fecha.ts para no duplicarlo
  // acá adentro).
  function construirRango(): { desde: string; hasta: string } {
    if (todoElDia) {
      return { desde: inicioDiaLocalUtc(fechaDesde), hasta: finDiaLocalUtc(fechaHasta) };
    }
    return { desde: fechaHoraLocalUtc(fechaDesde, horaDesde), hasta: fechaHoraLocalUtc(fechaDesde, horaHasta) };
  }

  function validar(): CrearExcepcionInput | EditarExcepcionInput | null {
    setErrorRango(undefined);
    setErrorGeneral(undefined);

    const rango = construirRango();
    const datos = {
      profesionalId: profesionalId || null,
      desde: rango.desde,
      hasta: rango.hasta,
      tipo,
      motivo: motivo.trim(), // '' explícito, no undefined — mismo criterio que descripción en ServicioDrawer: si se borró, se manda vacío de verdad.
    };

    // Reusa el schema real de @shared (frontend.md §4.0/§4.8, punto 4):
    // "sólo hasta>desde. NO validar solape" — nada de reglas propias acá.
    const schema = excepcion ? editarExcepcionSchema : crearExcepcionSchema;
    const parsed = schema.safeParse(datos);
    if (!parsed.success) {
      const campos = parsed.error.flatten().fieldErrors as Record<string, string[] | undefined>;
      if (campos.hasta || campos.desde) {
        setErrorRango('La fecha/hora "hasta" tiene que ser posterior a "desde".');
      } else {
        setErrorGeneral(parsed.error.issues[0]?.message ?? 'Revisá los datos del formulario.');
      }
      return null;
    }
    return datos;
  }

  async function handleGuardar() {
    const payload = validar();
    if (!payload) return;
    await onGuardar(payload);
  }

  return (
    <Drawer
      abierto
      onCerrar={onCerrar}
      titulo={excepcion ? 'Editar excepción' : 'Nueva excepción'}
      footer={
        <>
          <Button variant="secondary" disabled={guardando} onClick={onCerrar}>
            Cancelar
          </Button>
          <Button variant="primary" disabled={guardando} onClick={handleGuardar}>
            Guardar
          </Button>
        </>
      }
    >
      <div className="excepcion-drawer__campo">
        <span className="input-field__label">Tipo</span>
        <div className="excepcion-drawer__seg">
          {TIPOS_EXCEPCION.map((t) => (
            <button key={t} type="button" className={tipo === t ? 'is-on' : ''} onClick={() => setTipo(t)}>
              {TIPO_LABEL[t]}
            </button>
          ))}
        </div>
      </div>

      <div className="excepcion-drawer__campo">
        <label className="input-field__label" htmlFor="excepcion-alcance">
          Alcance
        </label>
        <select
          id="excepcion-alcance"
          className="excepcion-drawer__select"
          value={profesionalId}
          onChange={(e) => setProfesionalId(e.target.value)}
        >
          <option value="">Todo el centro</option>
          {profesionales.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
              {p.activo ? '' : ' (inactiva)'}
            </option>
          ))}
        </select>
      </div>

      <div className="excepcion-drawer__campo">
        <Switch checked={todoElDia} onChange={handleTodoElDia} label="Todo el día" />
        <p className="excepcion-drawer__ayuda">
          {todoElDia
            ? 'Se aplica de 00:00 a 23:59, del día "desde" al día "hasta" — sirve para feriados y vacaciones de varios días.'
            : 'Un solo día, con horario de inicio y fin — para un bloqueo puntual (ej. un turno médico).'}
        </p>
      </div>

      {todoElDia ? (
        <div className="excepcion-drawer__grid2">
          <label className="excepcion-drawer__campo-fecha">
            <span className="input-field__label">Desde</span>
            <input
              type="date"
              className="excepcion-drawer__input-fecha"
              value={fechaDesde}
              onChange={(e) => setFechaDesde(e.target.value)}
            />
          </label>
          <label className="excepcion-drawer__campo-fecha">
            <span className="input-field__label">Hasta</span>
            <input
              type="date"
              className="excepcion-drawer__input-fecha"
              value={fechaHasta}
              onChange={(e) => setFechaHasta(e.target.value)}
            />
          </label>
        </div>
      ) : (
        <>
          <label className="excepcion-drawer__campo-fecha excepcion-drawer__campo">
            <span className="input-field__label">Día</span>
            <input
              type="date"
              className="excepcion-drawer__input-fecha"
              value={fechaDesde}
              onChange={(e) => setFechaDesde(e.target.value)}
            />
          </label>
          <div className="excepcion-drawer__grid2">
            <label className="excepcion-drawer__campo-fecha">
              <span className="input-field__label">Desde</span>
              <input
                type="time"
                className="excepcion-drawer__input-fecha"
                value={horaDesde}
                onChange={(e) => setHoraDesde(e.target.value)}
              />
            </label>
            <label className="excepcion-drawer__campo-fecha">
              <span className="input-field__label">Hasta</span>
              <input
                type="time"
                className="excepcion-drawer__input-fecha"
                value={horaHasta}
                onChange={(e) => setHoraHasta(e.target.value)}
              />
            </label>
          </div>
        </>
      )}

      {errorRango ? <p className="excepcion-drawer__error">{errorRango}</p> : null}

      <div className="excepcion-drawer__campo">
        <label className="input-field__label" htmlFor={motivoId}>
          Motivo <span className="excepcion-drawer__opcional">(opcional)</span>
        </label>
        <textarea
          id={motivoId}
          className="input-field__control excepcion-drawer__textarea"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Ej: Feriado nacional, licencia, turno médico…"
          rows={2}
        />
      </div>

      {errorGeneral ? <p className="excepcion-drawer__error">{errorGeneral}</p> : null}
    </Drawer>
  );
}
