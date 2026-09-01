import { forwardRef, useImperativeHandle, useState, type ReactNode } from 'react';
import { horariosSchema } from '@shared/schemas/common.schema';
import type { BloqueHorario, HorarioDia } from '@shared/schemas/common.schema';
import './EditorHorarios.css';

// Editor semanal de horarios — pieza compartida (frontend.md "Componente
// reusable: editor de horarios"): hoy la usa servicios (nullable:true, §4.5);
// usuarios/configuración la reusan después con nullable:false (§4.6, sin el
// segmentado "Hereda"). NO reimplementa las reglas de horariosSchema (día
// vacío, array vacío, día duplicado, hasta<=desde, solape) — las corre de
// verdad vía validar(), reusando horariosSchema({nullable}) de @shared
// (mismo validador que el server, §10 backend), no una copia a mano.
//
// Por construcción de la UI, algunas reglas son imposibles de violar desde
// acá: togglear un día "on" siempre crea un bloque, y quitar el último bloque
// apaga el día ⇒ nunca hay día con bloques:[] ni día duplicado (un row fijo
// por día). Lo único que SÍ puede quedar en un estado inválido mientras el
// usuario edita es hasta<=desde, el solape entre bloques del mismo día, y
// "propio" sin ningún día encendido — de ahí que igual haga falta validar()
// antes de guardar, no sólo confiar en la construcción.

type Modo = 'hereda' | 'propio';

interface DiaEstado {
  on: boolean;
  bloques: BloqueHorario[];
}

type SchedState = Record<number, DiaEstado>;

// Display Lun→Dom (uso local); el valor que viaja al server usa la
// convención backend dia:0=domingo (§4.5/§10) — el orden acá es sólo visual,
// horariosSchema reordena por `dia` asc al transformar.
const DIAS_DISPLAY: { label: string; dia: number }[] = [
  { label: 'Lun', dia: 1 },
  { label: 'Mar', dia: 2 },
  { label: 'Mié', dia: 3 },
  { label: 'Jue', dia: 4 },
  { label: 'Vie', dia: 5 },
  { label: 'Sáb', dia: 6 },
  { label: 'Dom', dia: 0 },
];

const BLOQUE_INICIAL: BloqueHorario = { desde: '09:00', hasta: '13:00' };
const BLOQUE_NUEVO: BloqueHorario = { desde: '15:00', hasta: '20:00' };

function estadoDesde(horarios: HorarioDia[] | null): SchedState {
  const estado: SchedState = {};
  for (const { dia } of DIAS_DISPLAY) estado[dia] = { on: false, bloques: [] };
  (horarios ?? []).forEach((h) => {
    estado[h.dia] = { on: true, bloques: h.bloques.map((b) => ({ ...b })) };
  });
  return estado;
}

function salidaDesde(estado: SchedState, nullable: boolean, modo: Modo): HorarioDia[] | null {
  if (nullable && modo === 'hereda') return null;
  return DIAS_DISPLAY.filter(({ dia }) => estado[dia].on).map(({ dia }) => ({
    dia,
    bloques: estado[dia].bloques.map((b) => ({ ...b })),
  }));
}

export interface EditorHorariosHandle {
  // Corre horariosSchema({nullable}) sobre el valor actual; si falla, muestra
  // el mensaje inline (mismo lugar que el mockup, .schederr) y devuelve
  // false. El caller (drawer) lo llama antes de guardar.
  validar: () => boolean;
}

export interface EditorHorariosProps {
  value: HorarioDia[] | null;
  onChange: (value: HorarioDia[] | null) => void;
  // true (servicios): segmentado "Hereda de la profesional | Horario propio".
  // false (usuarios/configuración, futuro): sin segmentado, editor semanal
  // directo — ver frontend.md "Componente reusable: editor de horarios".
  nullable: boolean;
  // Copy específico de cada pantalla que la usa — el componente no asume de
  // quién "hereda" (acá es la profesional; en otra pantalla podría ser otra
  // cosa), así que no hardcodea el texto de ayuda.
  ayudaHereda?: ReactNode;
  ayudaPropio?: ReactNode;
}

export const EditorHorarios = forwardRef<EditorHorariosHandle, EditorHorariosProps>(function EditorHorarios(
  { value, onChange, nullable, ayudaHereda, ayudaPropio },
  ref
) {
  const [modo, setModo] = useState<Modo>(nullable && value === null ? 'hereda' : 'propio');
  const [estado, setEstado] = useState<SchedState>(() => estadoDesde(value));
  const [error, setError] = useState<string | null>(null);

  useImperativeHandle(ref, () => ({
    validar() {
      const salida = salidaDesde(estado, nullable, modo);
      const schema = nullable ? horariosSchema({ nullable: true }) : horariosSchema({ nullable: false });
      const parsed = schema.safeParse(salida);
      if (!parsed.success) {
        // Caso especial: "propio" sin ningún día prendido. El mensaje crudo
        // de horariosSchema ("usar null para 'no aplica'") es correcto pero
        // habla en términos del backend — acá lo traducimos al lenguaje del
        // segmentado que el usuario tiene enfrente (frontend.md "editor de
        // horarios": "Propio sin ningún día ⇒ error que empuja a Hereda").
        // El resto de los mensajes (hasta<=desde, solape) sí se muestran tal
        // cual los devuelve el schema — ya son específicos y accionables.
        const sinDias = Array.isArray(salida) && salida.length === 0;
        const mensaje = sinDias
          ? nullable
            ? 'Elegí al menos un día, o cambiá a "Hereda de la profesional".'
            : 'Elegí al menos un día.'
          : parsed.error.issues[0]?.message ?? 'Revisá el horario cargado.';
        setError(mensaje);
        return false;
      }
      setError(null);
      return true;
    },
  }));

  function cambiarModo(siguiente: Modo) {
    setModo(siguiente);
    setError(null);
    onChange(salidaDesde(estado, nullable, siguiente));
  }

  function toggleDia(dia: number, on: boolean) {
    const actual = estado[dia];
    const siguiente: SchedState = {
      ...estado,
      [dia]: on
        ? { on: true, bloques: actual.bloques.length ? actual.bloques : [{ ...BLOQUE_INICIAL }] }
        : { on: false, bloques: [] },
    };
    setEstado(siguiente);
    setError(null);
    onChange(salidaDesde(siguiente, nullable, modo));
  }

  function agregarBloque(dia: number) {
    const siguiente: SchedState = {
      ...estado,
      [dia]: { ...estado[dia], bloques: [...estado[dia].bloques, { ...BLOQUE_NUEVO }] },
    };
    setEstado(siguiente);
    onChange(salidaDesde(siguiente, nullable, modo));
  }

  // Quitar el último bloque de un día lo apaga (mismo criterio que el
  // mockup, rmBlk) — así nunca queda un día "on" con bloques:[].
  function quitarBloque(dia: number, indice: number) {
    const bloques = estado[dia].bloques.filter((_, i) => i !== indice);
    const siguiente: SchedState = { ...estado, [dia]: { on: bloques.length > 0, bloques } };
    setEstado(siguiente);
    onChange(salidaDesde(siguiente, nullable, modo));
  }

  function editarBloque(dia: number, indice: number, campo: keyof BloqueHorario, valor: string) {
    const bloques = estado[dia].bloques.map((b, i) => (i === indice ? { ...b, [campo]: valor } : b));
    const siguiente: SchedState = { ...estado, [dia]: { ...estado[dia], bloques } };
    setEstado(siguiente);
    onChange(salidaDesde(siguiente, nullable, modo));
  }

  const mostrarEditorSemanal = !nullable || modo === 'propio';

  return (
    <div className="editor-horarios">
      {nullable ? (
        <div className="editor-horarios__seg">
          <button
            type="button"
            aria-pressed={modo === 'hereda'}
            className={modo === 'hereda' ? 'is-on' : ''}
            onClick={() => cambiarModo('hereda')}
          >
            Hereda de la profesional
          </button>
          <button
            type="button"
            aria-pressed={modo === 'propio'}
            className={modo === 'propio' ? 'is-on' : ''}
            onClick={() => cambiarModo('propio')}
          >
            Horario propio
          </button>
        </div>
      ) : null}

      {nullable && modo === 'hereda' ? (
        <p className="editor-horarios__ayuda">
          {ayudaHereda ?? 'Se ofrece en los mismos horarios que cada profesional que lo presta.'}
        </p>
      ) : null}

      {mostrarEditorSemanal ? (
        <>
          <div className="editor-horarios__semana">
            {DIAS_DISPLAY.map(({ label, dia }) => {
              const diaEstado = estado[dia];
              return (
                <div className={`editor-horarios__dia${diaEstado.on ? ' is-on' : ''}`} key={dia}>
                  <div className="editor-horarios__dia-cabecera">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={diaEstado.on}
                      aria-label={`${label}${diaEstado.on ? '' : ' (cerrado)'}`}
                      className={`switch${diaEstado.on ? ' is-on' : ''}`}
                      onClick={() => toggleDia(dia, !diaEstado.on)}
                    >
                      <span className="switch__perilla" />
                    </button>
                    <span className="editor-horarios__dia-nombre">{label}</span>
                    {!diaEstado.on ? <span className="editor-horarios__dia-cerrado">cerrado</span> : null}
                  </div>
                  {diaEstado.on ? (
                    <div className="editor-horarios__bloques">
                      {diaEstado.bloques.map((bloque, indice) => (
                        <div className="editor-horarios__bloque" key={indice}>
                          <input
                            type="time"
                            value={bloque.desde}
                            onChange={(e) => editarBloque(dia, indice, 'desde', e.target.value)}
                            aria-label={`${label}: desde`}
                          />
                          <span className="editor-horarios__separador">a</span>
                          <input
                            type="time"
                            value={bloque.hasta}
                            onChange={(e) => editarBloque(dia, indice, 'hasta', e.target.value)}
                            aria-label={`${label}: hasta`}
                          />
                          <button
                            type="button"
                            className="editor-horarios__quitar"
                            onClick={() => quitarBloque(dia, indice)}
                            aria-label={`Quitar bloque ${bloque.desde}-${bloque.hasta} de ${label}`}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                      <button type="button" className="editor-horarios__agregar" onClick={() => agregarBloque(dia)}>
                        + Agregar bloque
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
          {error ? (
            <p className="editor-horarios__error" role="alert">
              {error}
            </p>
          ) : null}
          {ayudaPropio ? <p className="editor-horarios__ayuda">{ayudaPropio}</p> : null}
        </>
      ) : null}
    </div>
  );
});
EditorHorarios.displayName = 'EditorHorarios';
