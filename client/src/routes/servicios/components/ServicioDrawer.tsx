import { useId, useRef, useState } from 'react';
import { crearServicioSchema, editarServicioSchema } from '@shared/schemas/servicio.schema';
import type { CrearServicioInput, EditarServicioInput } from '@shared/schemas/servicio.schema';
import type { HorarioDia } from '@shared/schemas/common.schema';
import { Button, Drawer, Input, Switch } from '../../../components/ui';
import { EditorHorarios, type EditorHorariosHandle } from '../../../components/EditorHorarios/EditorHorarios';
import type { ServicioPanel } from '../types';

export type ResultadoGuardar = { ok: true } | { ok: false; errorNombre?: string };

export interface ServicioDrawerProps {
  // null = alta. Presente = edición de ESE servicio (frontend.md §4.5).
  servicio: ServicioPanel | null;
  // Para el chequeo optimista de nombre duplicado — la verdad la tiene el
  // índice del server (409 real, ver onGuardar/mapeo en ServiciosPage).
  serviciosExistentes: ServicioPanel[];
  guardando: boolean;
  toggleOcupado: boolean;
  onGuardar: (payload: CrearServicioInput | EditarServicioInput) => Promise<ResultadoGuardar>;
  onToggleActivo?: () => void;
  onCerrar: () => void;
}

const MENSAJE_CAMPO: Record<string, string> = {
  nombre: 'Poné un nombre (mínimo 2 caracteres).',
  duracionMin: 'Ingresá una duración en minutos, mayor a 0.',
  bufferPostMin: 'Ingresá minutos de limpieza (podés poner 0).',
  precio: 'Ingresá un precio válido.',
  orden: 'Ingresá un número de orden.',
};

// Drawer de alta/edición (frontend.md §4.5). Sólo se monta mientras está
// abierto (ver ServiciosPage) — arranca siempre desde cero, sin necesidad de
// resetear estado por props: no se puede reabrir sobre otro registro sin
// pasar por cerrado primero (el scrim bloquea la lista de atrás).
export function ServicioDrawer({
  servicio,
  serviciosExistentes,
  guardando,
  toggleOcupado,
  onGuardar,
  onToggleActivo,
  onCerrar,
}: ServicioDrawerProps) {
  const [nombre, setNombre] = useState(servicio?.nombre ?? '');
  const [descripcion, setDescripcion] = useState(servicio?.descripcion ?? '');
  const [duracionMin, setDuracionMin] = useState(servicio ? String(servicio.duracionMin) : '');
  const [bufferPostMin, setBufferPostMin] = useState(servicio ? String(servicio.bufferPostMin) : '0');
  const [precioPesos, setPrecioPesos] = useState(servicio ? String(servicio.precio / 100) : '');
  const [mostrarPrecio, setMostrarPrecio] = useState(servicio?.mostrarPrecio ?? true);
  const [orden, setOrden] = useState(servicio ? String(servicio.orden) : String(serviciosExistentes.length));
  const [horarios, setHorarios] = useState<HorarioDia[] | null>(servicio?.horarios ?? null);
  const [errores, setErrores] = useState<Record<string, string>>({});

  const editorRef = useRef<EditorHorariosHandle>(null);
  const descripcionId = useId();

  function validar(): CrearServicioInput | EditarServicioInput | null {
    const datos = {
      nombre: nombre.trim(),
      // '' explícito, no undefined: un PATCH que omite la key deja la
      // descripción vieja intacta (JSON.stringify tira las keys undefined) —
      // si la clienta borró el texto para vaciarlo, hay que mandarlo vacío
      // de verdad, no omitirlo (crearServicioSchema/editarServicioSchema
      // aceptan '' — z.string().optional() sin .min()).
      descripcion: descripcion.trim(),
      duracionMin: Number(duracionMin),
      bufferPostMin: Number(bufferPostMin),
      precio: Math.round(Number(precioPesos || '0') * 100),
      mostrarPrecio,
      horarios,
      orden: Number(orden || '0'),
    };

    const nuevosErrores: Record<string, string> = {};

    // Chequeo optimista de duplicado (case-insensitive, frontend.md §4.5,
    // punto 4) — sólo UX rápida; el 409 NOMBRE_DUPLICADO real del server
    // pisa esto igual si el chequeo local no lo agarra (carrera, u otro
    // admin creó el mismo nombre entre medio).
    const dup = serviciosExistentes.some(
      (s) => s.id !== servicio?.id && s.nombre.trim().toLocaleLowerCase('es') === datos.nombre.toLocaleLowerCase('es')
    );
    if (dup) nuevosErrores.nombre = 'Ya existe un servicio con ese nombre.';

    // Reusa el schema real de @shared en vez de reimplementar reglas de forma
    // (frontend.md §4.0: "reusar los schemas de Zod de @shared para validar
    // formularios"). horarios se valida aparte, con horariosSchema, vía
    // editorRef — acá no importa si horarios pasa o no.
    const schema = servicio ? editarServicioSchema : crearServicioSchema;
    const parsed = schema.safeParse(datos);
    if (!parsed.success) {
      const campos = parsed.error.flatten().fieldErrors as Record<string, string[] | undefined>;
      for (const campo of Object.keys(campos)) {
        if (campo === 'horarios') continue; // lo valida EditorHorarios, mensaje propio
        if (!nuevosErrores[campo]) {
          nuevosErrores[campo] = MENSAJE_CAMPO[campo] ?? campos[campo]?.[0] ?? 'Valor inválido.';
        }
      }
    }

    const horarioValido = editorRef.current?.validar() ?? true;

    setErrores(nuevosErrores);
    if (Object.keys(nuevosErrores).length > 0 || !horarioValido) return null;
    return datos;
  }

  async function handleGuardar() {
    const payload = validar();
    if (!payload) return;
    const resultado = await onGuardar(payload);
    if (!resultado.ok && resultado.errorNombre) {
      setErrores((actual) => ({ ...actual, nombre: resultado.errorNombre! }));
    }
  }

  return (
    <Drawer
      abierto
      onCerrar={onCerrar}
      titulo={servicio ? 'Editar servicio' : 'Nuevo servicio'}
      footer={
        <>
          {servicio && onToggleActivo ? (
            <Button
              variant="danger-outline"
              disabled={guardando || toggleOcupado}
              onClick={onToggleActivo}
            >
              {servicio.activo ? 'Desactivar' : 'Activar'}
            </Button>
          ) : null}
          <Button variant="secondary" disabled={guardando} onClick={onCerrar}>
            Cancelar
          </Button>
          <Button variant="primary" disabled={guardando} onClick={handleGuardar}>
            Guardar
          </Button>
        </>
      }
    >
      <div className="servicio-drawer__campo">
        <Input
          label="Nombre"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Ej: Perfilado de cejas"
          error={errores.nombre}
        />
      </div>

      <div className="servicio-drawer__campo">
        <label className="input-field__label" htmlFor={descripcionId}>
          Descripción <span className="servicio-drawer__opcional">(opcional)</span>
        </label>
        <textarea
          id={descripcionId}
          className="input-field__control servicio-drawer__textarea"
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          placeholder="Qué incluye el servicio"
          rows={3}
        />
      </div>

      <div className="servicio-drawer__grid2">
        <Input
          label="Duración"
          type="number"
          min={1}
          step={1}
          value={duracionMin}
          onChange={(e) => setDuracionMin(e.target.value)}
          placeholder="60"
          suffix={<span className="servicio-drawer__unidad">min</span>}
          error={errores.duracionMin}
        />
        <div>
          <Input
            label="Limpieza posterior"
            type="number"
            min={0}
            step={1}
            value={bufferPostMin}
            onChange={(e) => setBufferPostMin(e.target.value)}
            placeholder="15"
            suffix={<span className="servicio-drawer__unidad">min</span>}
            error={errores.bufferPostMin}
          />
          <p className="servicio-drawer__ayuda">Ocupa agenda, no se cobra.</p>
        </div>
      </div>

      <div className="servicio-drawer__campo">
        <Input
          label="Precio"
          type="number"
          min={0}
          step={1}
          value={precioPesos}
          onChange={(e) => setPrecioPesos(e.target.value)}
          placeholder="15000"
          prefijo={<span className="servicio-drawer__unidad">$</span>}
          error={errores.precio}
        />
        <p className="servicio-drawer__ayuda">En pesos. Se guarda en centavos.</p>
      </div>

      <div className="servicio-drawer__campo">
        <Switch
          checked={mostrarPrecio}
          onChange={setMostrarPrecio}
          label="Mostrar el precio en la web"
        />
      </div>

      <div className="servicio-drawer__campo">
        <span className="input-field__label servicio-drawer__label-horario">Horario del servicio</span>
        <EditorHorarios
          ref={editorRef}
          value={horarios}
          onChange={setHorarios}
          nullable
          ayudaPropio="Este horario se cruza con el de la profesional y el del centro. Sólo lo restringe; no abre horas nuevas."
        />
      </div>

      <div className="servicio-drawer__orden">
        <Input
          label="Orden"
          type="number"
          min={0}
          step={1}
          value={orden}
          onChange={(e) => setOrden(e.target.value)}
          error={errores.orden}
        />
      </div>
    </Drawer>
  );
}
