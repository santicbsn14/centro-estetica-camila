import { useId, useRef, useState } from 'react';
import { crearExperienciaSchema, editarExperienciaSchema } from '@shared/schemas/experiencia.schema';
import type { CrearExperienciaInput, EditarExperienciaInput } from '@shared/schemas/experiencia.schema';
import { Button, Drawer, Input, Switch } from '../../../components/ui';
import type { ExperienciaPanel } from '../types';

export type ResultadoGuardar = { ok: true } | { ok: false; errorNombre?: string };

export interface ComboDrawerProps {
  // null = alta. Presente = edición de ESE combo (frontend.md §4.5.1).
  combo: ExperienciaPanel | null;
  // Chequeo optimista de nombre duplicado; la verdad la tiene el índice (409).
  combosExistentes: ExperienciaPanel[];
  guardando: boolean;
  toggleOcupado: boolean;
  onGuardar: (payload: CrearExperienciaInput | EditarExperienciaInput) => Promise<ResultadoGuardar>;
  onToggleActivo?: () => void;
  onCerrar: () => void;
}

const MIN_ITEMS = 2;
const MAX_ITEMS = 8;

const MENSAJE_CAMPO: Record<string, string> = {
  nombre: 'Poné un nombre de 2 a 80 caracteres.',
  descripcion: 'La descripción puede tener hasta 500 caracteres.',
  precio: 'Ingresá un precio válido.',
  orden: 'Ingresá un número de orden.',
  imagenUrl: 'Ingresá una URL válida (https://...).',
};

interface Item {
  key: number; // estable para React al quitar ítems del medio
  texto: string;
}

// Drawer de alta/edición de combos (frontend.md §4.5.1). Mismo patrón que
// ServicioDrawer: se monta sólo abierto, arranca desde cero. Reusa las
// clases .servicio-drawer__* (ServiciosPage.css) para campos/preview/contador.
export function ComboDrawer({
  combo,
  combosExistentes,
  guardando,
  toggleOcupado,
  onGuardar,
  onToggleActivo,
  onCerrar,
}: ComboDrawerProps) {
  const siguienteKey = useRef(0);
  const nuevoItem = (texto = ''): Item => ({ key: siguienteKey.current++, texto });

  const [nombre, setNombre] = useState(combo?.nombre ?? '');
  const [descripcion, setDescripcion] = useState(combo?.descripcion ?? '');
  const [items, setItems] = useState<Item[]>(() =>
    combo ? combo.incluye.map((t) => nuevoItem(t)) : Array.from({ length: MIN_ITEMS }, () => nuevoItem())
  );
  const [precioPesos, setPrecioPesos] = useState(combo ? String(combo.precio / 100) : '');
  const [mostrarPrecio, setMostrarPrecio] = useState(combo?.mostrarPrecio ?? true);
  const [orden, setOrden] = useState(combo ? String(combo.orden) : String(combosExistentes.length));
  const [imagenUrl, setImagenUrl] = useState(combo?.imagenUrl ?? '');
  const [imagenInvalida, setImagenInvalida] = useState(false);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [erroresItems, setErroresItems] = useState<Record<number, string>>({});

  const descripcionId = useId();
  const incluyeLabelId = useId();

  function actualizarItem(key: number, texto: string) {
    setItems((actual) => actual.map((it) => (it.key === key ? { ...it, texto } : it)));
  }

  function quitarItem(key: number) {
    setItems((actual) => actual.filter((it) => it.key !== key));
    setErroresItems({});
  }

  function agregarItem() {
    setItems((actual) => (actual.length >= MAX_ITEMS ? actual : [...actual, nuevoItem()]));
  }

  function validar(): CrearExperienciaInput | EditarExperienciaInput | null {
    const datos = {
      nombre: nombre.trim(),
      // '' explícito (no undefined) para poder vaciar la descripción en un
      // PATCH — mismo criterio que ServicioDrawer.
      descripcion: descripcion.trim(),
      incluye: items.map((it) => it.texto),
      precio: Math.round(Number(precioPesos || '0') * 100),
      mostrarPrecio,
      orden: Number(orden || '0'),
      // Sin '' (mismo límite que servicios §15.7): vacío ⇒ la key no viaja.
      imagenUrl: imagenUrl.trim() || undefined,
    };

    const nuevosErrores: Record<string, string> = {};
    const nuevosErroresItems: Record<number, string> = {};

    const dup = combosExistentes.some(
      (c) => c.id !== combo?.id && c.nombre.trim().toLocaleLowerCase('es') === datos.nombre.toLocaleLowerCase('es')
    );
    if (dup) nuevosErrores.nombre = 'Ya existe un combo con ese nombre.';

    // Schemas reales de @shared (frontend.md §4.0).
    const schema = combo ? editarExperienciaSchema : crearExperienciaSchema;
    const parsed = schema.safeParse(datos);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const [campo, indice] = issue.path;
        if (campo === 'incluye') {
          if (typeof indice === 'number') {
            nuevosErroresItems[items[indice].key] = 'Entre 2 y 80 caracteres (o quitá el ítem).';
          } else {
            nuevosErrores.incluye = `Tiene que incluir entre ${MIN_ITEMS} y ${MAX_ITEMS} ítems.`;
          }
        } else if (typeof campo === 'string' && !nuevosErrores[campo]) {
          nuevosErrores[campo] = MENSAJE_CAMPO[campo] ?? issue.message;
        }
      }
    }

    setErrores(nuevosErrores);
    setErroresItems(nuevosErroresItems);
    if (Object.keys(nuevosErrores).length > 0 || Object.keys(nuevosErroresItems).length > 0) return null;
    // Se manda lo parseado (ítems trimeados por el schema).
    return parsed.success ? parsed.data : null;
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
      titulo={combo ? 'Editar combo' : 'Nuevo combo'}
      footer={
        <>
          {/* Sin DELETE (§15.7.2): borrado lógico. Nunca "Eliminar". */}
          {combo && onToggleActivo ? (
            <Button variant="danger-outline" disabled={guardando || toggleOcupado} onClick={onToggleActivo}>
              {combo.activo ? 'Desactivar' : 'Activar'}
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
          placeholder="Ej: Día de spa"
          maxLength={80}
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
          placeholder="Para quién es, qué lo hace especial"
          rows={3}
          maxLength={500}
        />
        <p className="servicio-drawer__contador">{descripcion.length}/500</p>
      </div>

      <div className="servicio-drawer__campo" role="group" aria-labelledby={incluyeLabelId}>
        <span className="input-field__label combo-drawer__label" id={incluyeLabelId}>
          Incluye
        </span>
        <ul className="combo-drawer__items">
          {items.map((it, i) => (
            <li key={it.key} className="combo-drawer__item">
              <div className="combo-drawer__item-fila">
                <input
                  className={`input-field__control combo-drawer__item-input${
                    erroresItems[it.key] ? ' combo-drawer__item-input--error' : ''
                  }`}
                  value={it.texto}
                  onChange={(e) => actualizarItem(it.key, e.target.value)}
                  placeholder={i === 0 ? 'Ej: Limpieza facial profunda' : 'Otro servicio o detalle'}
                  maxLength={80}
                  aria-label={`Ítem ${i + 1}`}
                  aria-invalid={Boolean(erroresItems[it.key])}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={items.length <= MIN_ITEMS}
                  onClick={() => quitarItem(it.key)}
                  aria-label={`Quitar ítem ${i + 1}`}
                >
                  Quitar
                </Button>
              </div>
              {erroresItems[it.key] ? <p className="input-field__error">{erroresItems[it.key]}</p> : null}
            </li>
          ))}
        </ul>
        <div className="combo-drawer__items-pie">
          <Button variant="secondary" size="sm" disabled={items.length >= MAX_ITEMS} onClick={agregarItem}>
            + Agregar ítem
          </Button>
          <span className="servicio-drawer__ayuda combo-drawer__items-cuenta">
            {items.length}/{MAX_ITEMS} · mínimo {MIN_ITEMS}
          </span>
        </div>
        {errores.incluye ? <p className="input-field__error">{errores.incluye}</p> : null}
        <p className="servicio-drawer__ayuda">Texto libre: el combo no se agenda, se coordina por WhatsApp.</p>
      </div>

      <div className="servicio-drawer__campo">
        <Input
          label="Precio"
          type="number"
          min={0}
          step={1}
          value={precioPesos}
          onChange={(e) => setPrecioPesos(e.target.value)}
          placeholder="45000"
          prefijo={<span className="servicio-drawer__unidad">$</span>}
          error={errores.precio}
        />
        <p className="servicio-drawer__ayuda">En pesos. Lo fijás vos: no es la suma de los servicios.</p>
      </div>

      <div className="servicio-drawer__campo">
        <Switch checked={mostrarPrecio} onChange={setMostrarPrecio} label="Mostrar el precio en la web" />
      </div>

      <div className="servicio-drawer__campo">
        <Input
          label="Imagen"
          value={imagenUrl}
          onChange={(e) => {
            setImagenUrl(e.target.value);
            setImagenInvalida(false);
          }}
          placeholder="https://…"
          error={errores.imagenUrl}
        />
        <p className="servicio-drawer__ayuda">URL de la imagen. Opcional.</p>
        {imagenUrl.trim() && (
          <div className="servicio-drawer__imagen-preview">
            {imagenInvalida ? (
              <p className="servicio-drawer__imagen-error">Imagen no válida</p>
            ) : (
              <img
                src={imagenUrl.trim()}
                alt=""
                onError={() => setImagenInvalida(true)}
                onLoad={() => setImagenInvalida(false)}
              />
            )}
          </div>
        )}
      </div>

      <div className="servicio-drawer__orden">
        <Input
          label="Orden"
          type="number"
          step={1}
          value={orden}
          onChange={(e) => setOrden(e.target.value)}
          error={errores.orden}
        />
      </div>
    </Drawer>
  );
}
