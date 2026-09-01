import { useMemo, useState } from 'react';
import { crearTurnoSchema, type CrearTurnoInput } from '@shared/schemas/turno.schema';
import { armarTelefonoE164 } from '../../../lib/telefono';
import { centavosAPesos } from '../../../lib/format/plata';
import { etiquetaDia, horaLocal } from '../../../lib/format/fecha';
import type { DatosClienta, Slot } from '../types';

interface Props {
  servicioId: string;
  profesionalId: string;
  servicioNombre: string;
  profesionalNombre: string;
  slot: Slot;
  duracionMin: number;
  precio?: number;
  datos: DatosClienta;
  enviando: boolean;
  errorGeneral: string | null;
  onDatosChange: (datos: DatosClienta) => void;
  onCerrar: () => void;
  onConfirmar: (input: CrearTurnoInput) => void;
}

interface Touched {
  nombre: boolean;
  telefono: boolean;
  email: boolean;
}

// Paso 3 — bottom sheet de datos SOBRE la grilla, no navegación (frontend.md
// §4.11). Clonado de .sheet/.fld/.telrow del mockup. Valida reusando
// crearTurnoSchema de @shared (nombre/email) + armarTelefonoE164 (el gate
// real del teléfono — el schema sólo exige min(6), no E164 válido).
export function HojaDatos({
  servicioId,
  profesionalId,
  servicioNombre,
  profesionalNombre,
  slot,
  duracionMin,
  precio,
  datos,
  enviando,
  errorGeneral,
  onDatosChange,
  onCerrar,
  onConfirmar,
}: Props) {
  const [touched, setTouched] = useState<Touched>({ nombre: false, telefono: false, email: false });

  const telefonoE164 = useMemo(() => armarTelefonoE164(datos.telefonoResto), [datos.telefonoResto]);

  const candidato = useMemo(
    () => ({
      servicioId,
      profesionalId,
      inicio: slot.inicio,
      nombre: datos.nombre.trim(),
      telefono: telefonoE164 ?? datos.telefonoResto.trim(),
      email: datos.email.trim() ? datos.email.trim() : undefined,
    }),
    [servicioId, profesionalId, slot.inicio, datos, telefonoE164]
  );

  const erroresSchema = useMemo(() => {
    const parsed = crearTurnoSchema.safeParse(candidato);
    return parsed.success ? {} : parsed.error.flatten().fieldErrors;
  }, [candidato]);

  const nombreInvalido = Boolean(erroresSchema.nombre);
  const telefonoInvalido = telefonoE164 === null || Boolean(erroresSchema.telefono);
  const emailInvalido = Boolean(erroresSchema.email);
  const formValido = !nombreInvalido && !telefonoInvalido && !emailInvalido;

  function marcarTodoTocado() {
    setTouched({ nombre: true, telefono: true, email: true });
  }

  function confirmar() {
    marcarTodoTocado();
    if (!formValido || enviando) return;
    onConfirmar({ ...candidato, telefono: telefonoE164! });
  }

  return (
    <>
      <div className="sheet-handle" />
      <div className="sheet-hd">
        <h2>Confirmá tu turno</h2>
        <div className="sheet-sum">
          <b>{servicioNombre}</b> con {profesionalNombre}
          <br />
          {etiquetaDia(slot.inicio)} · {horaLocal(slot.inicio)} hs · {duracionMin} min
          {precio !== undefined ? ` · ${centavosAPesos(precio)}` : ''}
        </div>
      </div>

      <div className="sheet-body">
        {errorGeneral && (
          <p className="banner-error" role="alert">
            {errorGeneral}
          </p>
        )}

        <div className="fld">
          <label htmlFor="f_nom">Tu nombre</label>
          <input
            type="text"
            id="f_nom"
            placeholder="Nombre y apellido"
            value={datos.nombre}
            aria-invalid={touched.nombre && nombreInvalido}
            onChange={(e) => onDatosChange({ ...datos, nombre: e.target.value })}
            onBlur={() => setTouched((t) => ({ ...t, nombre: true }))}
          />
          {touched.nombre && nombreInvalido && <p className="hint hint--show">Ingresá tu nombre y apellido.</p>}
        </div>

        <div className="fld">
          <label htmlFor="f_tel">Tu teléfono</label>
          <div className="telrow">
            <span className="pre">+54 9</span>
            <input
              type="tel"
              id="f_tel"
              placeholder="341 555-1234"
              value={datos.telefonoResto}
              aria-invalid={touched.telefono && telefonoInvalido}
              onChange={(e) => onDatosChange({ ...datos, telefonoResto: e.target.value })}
              onBlur={() => setTouched((t) => ({ ...t, telefono: true }))}
            />
          </div>
          {touched.telefono && telefonoInvalido && (
            <p className="hint hint--show">Ingresá tu número con característica (ej: 341...).</p>
          )}
          <p className="help">Te vamos a confirmar por WhatsApp a este número.</p>
        </div>

        <div className="fld">
          <label htmlFor="f_mail">
            Email <span className="fld__opcional">(opcional)</span>
          </label>
          <input
            type="email"
            id="f_mail"
            placeholder="tu@email.com"
            value={datos.email}
            aria-invalid={touched.email && emailInvalido}
            onChange={(e) => onDatosChange({ ...datos, email: e.target.value })}
            onBlur={() => setTouched((t) => ({ ...t, email: true }))}
          />
          {touched.email && emailInvalido && <p className="hint hint--show">Ingresá un email válido.</p>}
        </div>
      </div>

      <div className="sheet-foot">
        <button className="btn solid" onClick={confirmar} disabled={!formValido || enviando}>
          {enviando ? 'Confirmando…' : 'Confirmar turno'}
        </button>
        <button className="btn btn--texto" onClick={onCerrar} disabled={enviando}>
          Cancelar
        </button>
      </div>
    </>
  );
}
