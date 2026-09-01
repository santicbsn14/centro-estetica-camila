import { useCallback, useEffect, useRef, useState } from 'react';
import { editarConfiguracionSchema } from '@shared/schemas/configuracion.schema';
import type { EditarConfiguracionInput } from '@shared/schemas/configuracion.schema';
import type { HorarioDia } from '@shared/schemas/common.schema';
import { Button, Input, useToast } from '../../components/ui';
import { EditorHorarios, type EditorHorariosHandle } from '../../components/EditorHorarios/EditorHorarios';
import { HttpError } from '../../lib/http';
import { normalizarTelefonoAR } from '../../lib/format/telefono';
import * as api from './api';
import type { ConfiguracionPanel } from './types';
import './ConfiguracionPage.css';

// Configuración del centro (frontend.md §4.7) — singleton, NO CRUD: sin
// drawer, sin lista, sin alta/baja. Página de ajustes: cargar → editar →
// guardar, con PATCH parcial de sólo los campos "sucios" (dirty-tracking).
// El gate admin-only ya vive en App.tsx (RequireRol).

// Mensaje mapeado por `codigo` (nunca por texto, frontend.md §2) — mismo
// criterio que TurnosPage/ServiciosPage.
function mensajeError(err: unknown): string {
  if (err instanceof HttpError) return err.message;
  return 'Ocurrió un error inesperado. Probá de nuevo en unos segundos.';
}

const MENSAJE_CAMPO: Record<string, string> = {
  nombre: 'Poné un nombre (mínimo 2 caracteres).',
  pasoGrillaMin: 'Mínimo 5 minutos.',
  antelacionMinimaHoras: 'Ingresá un número de horas, 0 o más.',
  ventanaMaximaDias: 'Ingresá un número de días, mínimo 1.',
  cancelacionMinimaHoras: 'Ingresá un número de horas, 0 o más.',
  vencimientoPendienteHoras: 'Ingresá un número de horas, mínimo 1.',
};

type CampoRegla =
  | 'pasoGrillaMin'
  | 'antelacionMinimaHoras'
  | 'ventanaMaximaDias'
  | 'cancelacionMinimaHoras'
  | 'vencimientoPendienteHoras';

interface DefinicionRegla {
  campo: CampoRegla;
  label: string;
  ayuda: string;
  unidad: string;
  min: number;
}

// Labels/help/orden exactos de frontend.md §4.7 punto 3.
const REGLAS: DefinicionRegla[] = [
  { campo: 'pasoGrillaMin', label: 'Paso de grilla', ayuda: 'Cada cuántos minutos se ofrece un turno.', unidad: 'min', min: 5 },
  {
    campo: 'antelacionMinimaHoras',
    label: 'Antelación mínima',
    ayuda: 'Mínimo de horas antes para reservar; también asegura tiempo de confirmar antes del vencimiento.',
    unidad: 'hs',
    min: 0,
  },
  {
    campo: 'ventanaMaximaDias',
    label: 'Ventana máxima',
    ayuda: 'Con cuánta anticipación máxima se puede reservar.',
    unidad: 'días',
    min: 1,
  },
  {
    campo: 'cancelacionMinimaHoras',
    label: 'Cancelación mínima',
    ayuda: 'Hasta cuántas horas antes la clienta puede cancelar desde el link.',
    unidad: 'hs',
    min: 0,
  },
  {
    campo: 'vencimientoPendienteHoras',
    label: 'Vencimiento de pendientes',
    ayuda: 'Cuánto dura una solicitud sin confirmar antes de vencer sola.',
    unidad: 'hs',
    min: 1,
  },
];

const REGLAS_INICIALES: Record<CampoRegla, string> = {
  pasoGrillaMin: '',
  antelacionMinimaHoras: '',
  ventanaMaximaDias: '',
  cancelacionMinimaHoras: '',
  vencimientoPendienteHoras: '',
};

// Sub-schema real de contacto, desenvuelto de editarConfiguracionSchema (no
// una redefinición a mano) — permite validar telefono/email/direccion por
// separado y mapear el error al campo que corresponde. flatten() sobre el
// schema COMPLETO colapsa los 3 al mismo key 'contacto' (probado a mano),
// así que hace falta parsear el sub-objeto solo para tener fieldErrors por
// campo.
const contactoSchema = editarConfiguracionSchema.shape.contacto.unwrap();

// Config del centro (panel, admin, §4.7). Consume /api/admin/configuracion:
// GET singleton + PATCH parcial (.strict()).
export function ConfiguracionPage() {
  const { mostrarToast } = useToast();

  const [config, setConfig] = useState<ConfiguracionPanel | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [email, setEmail] = useState('');
  const [direccion, setDireccion] = useState('');

  const [horarios, setHorarios] = useState<HorarioDia[]>([]);
  const [horariosTocado, setHorariosTocado] = useState(false);
  // EditorHorarios sólo lee `value` una vez al montar (pensado para drawers
  // que se desmontan/remontan, ver EditorHorarios.tsx) — esta página nunca se
  // desmonta, así que forzamos remount con `key` cada vez que hay que
  // resincronizar el editor contra el server (carga inicial, post-guardado,
  // descartar cambios).
  const [horariosKey, setHorariosKey] = useState(0);

  const [reglas, setReglas] = useState<Record<CampoRegla, string>>(REGLAS_INICIALES);

  const [errores, setErrores] = useState<Record<string, string>>({});
  const editorRef = useRef<EditorHorariosHandle>(null);

  function aplicarConfig(data: ConfiguracionPanel) {
    setConfig(data);
    setNombre(data.nombre);
    setTelefono(data.contacto.telefonoE164);
    setEmail(data.contacto.email);
    setDireccion(data.contacto.direccion);
    setHorarios(data.horarios);
    setHorariosTocado(false);
    setHorariosKey((k) => k + 1);
    setReglas({
      pasoGrillaMin: String(data.pasoGrillaMin),
      antelacionMinimaHoras: String(data.antelacionMinimaHoras),
      ventanaMaximaDias: String(data.ventanaMaximaDias),
      cancelacionMinimaHoras: String(data.cancelacionMinimaHoras),
      vencimientoPendienteHoras: String(data.vencimientoPendienteHoras),
    });
    setErrores({});
  }

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      aplicarConfig(await api.obtenerConfiguracion());
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const nombreSucio = config ? nombre.trim() !== config.nombre : false;
  const contactoSucio = config
    ? telefono.trim() !== config.contacto.telefonoE164 ||
      email.trim() !== config.contacto.email ||
      direccion.trim() !== config.contacto.direccion
    : false;
  const reglaSucia = (campo: CampoRegla) => (config ? reglas[campo] !== String(config[campo]) : false);
  const hayReglaSucia = REGLAS.some((r) => reglaSucia(r.campo));
  const haySucio = nombreSucio || contactoSucio || horariosTocado || hayReglaSucia;

  function handleHorariosChange(valor: HorarioDia[] | null) {
    setHorarios(valor ?? []);
    setHorariosTocado(true);
  }

  function validar(): EditarConfiguracionInput | null {
    if (!config) return null;

    const nuevosErrores: Record<string, string> = {};
    const payload: EditarConfiguracionInput = {};

    if (nombreSucio) {
      const nombreTrim = nombre.trim();
      if (nombreTrim.length < 2) {
        nuevosErrores.nombre = MENSAJE_CAMPO.nombre;
      } else {
        payload.nombre = nombreTrim;
      }
    }

    if (contactoSucio) {
      // Teléfono: normalizar a E164 ANTES de enviar (frontend.md §2) — el
      // server no reconstruye área faltante, así que un teléfono sin área se
      // rechaza acá, no en el 400 del server.
      const telCrudo = telefono.trim();
      const telNorm = telCrudo ? normalizarTelefonoAR(telCrudo) : null;
      if (!telNorm) {
        nuevosErrores.telefono = 'Teléfono inválido. Probá con código de área, ej: 341 555-2847.';
      }

      const candidato = { telefonoE164: telNorm ?? telCrudo, email: email.trim(), direccion: direccion.trim() };
      const parsedContacto = contactoSchema.safeParse(candidato);
      if (!parsedContacto.success) {
        const campos = parsedContacto.error.flatten().fieldErrors as Record<string, string[] | undefined>;
        if (campos.email) nuevosErrores.email = 'Ingresá un email válido.';
        if (campos.direccion) nuevosErrores.direccion = 'Ingresá una dirección.';
      }

      if (telNorm && parsedContacto.success) {
        payload.contacto = { telefonoE164: telNorm, email: candidato.email, direccion: candidato.direccion };
      }
    }

    if (horariosTocado) {
      payload.horarios = horarios;
    }

    for (const { campo } of REGLAS) {
      if (reglaSucia(campo)) {
        payload[campo] = Number(reglas[campo]);
      }
    }

    // horarios se valida aparte, vía editorRef (mismo criterio que
    // ServicioDrawer/UsuarioDrawer) — reusa horariosConfigSchema
    // (nullable:false) por dentro de EditorHorarios, no una copia a mano.
    const horarioValido = horariosTocado ? (editorRef.current?.validar() ?? true) : true;

    // Corre el schema real sobre el payload completo — atrapa lo que el
    // chequeo manual de arriba no cubre (pasoGrillaMin<5, ventanaMaximaDias<1,
    // etc.). 'horarios' y 'contacto' se ignoran acá porque ya tienen su
    // propio manejo de error más arriba.
    const parsed = editarConfiguracionSchema.safeParse(payload);
    if (!parsed.success) {
      const campos = parsed.error.flatten().fieldErrors as Record<string, string[] | undefined>;
      for (const campo of Object.keys(campos)) {
        if (campo === 'horarios' || campo === 'contacto') continue;
        if (!nuevosErrores[campo]) {
          nuevosErrores[campo] = MENSAJE_CAMPO[campo] ?? campos[campo]?.[0] ?? 'Valor inválido.';
        }
      }
    }

    setErrores(nuevosErrores);
    if (Object.keys(nuevosErrores).length > 0 || !horarioValido) return null;
    if (Object.keys(payload).length === 0) return null; // nada sucio — no debería llegar acá, botón deshabilitado

    return payload;
  }

  async function guardar() {
    const payload = validar();
    if (!payload) return;
    setGuardando(true);
    try {
      const actualizado = await api.editarConfiguracion(payload);
      mostrarToast('Cambios guardados.', 'exito');
      aplicarConfig(actualizado);
    } catch (err) {
      mostrarToast(mensajeError(err), 'error');
    } finally {
      setGuardando(false);
    }
  }

  function descartar() {
    if (config) aplicarConfig(config);
  }

  if (cargando) {
    return (
      <div className="configuracion-page">
        <h1 className="configuracion-page__titulo">Configuración</h1>
        <div className="configuracion-page__vacio">Cargando configuración…</div>
      </div>
    );
  }

  if (error || !config) {
    return (
      <div className="configuracion-page">
        <h1 className="configuracion-page__titulo">Configuración</h1>
        <div className="configuracion-page__aviso configuracion-page__aviso--error">
          {error ?? 'No se pudo cargar la configuración.'}
        </div>
      </div>
    );
  }

  return (
    <div className="configuracion-page">
      <div className="configuracion-page__head">
        <h1 className="configuracion-page__titulo">Configuración</h1>
      </div>
      <p className="configuracion-page__sub">Ajustes generales del centro. Los cambios se guardan por sección.</p>

      <section className="configuracion-page__seccion">
        <h2 className="configuracion-page__seccion-titulo">Datos del centro</h2>

        <div className="configuracion-page__campo">
          <Input label="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} error={errores.nombre} />
        </div>

        <h3 className="configuracion-page__subtitulo">Contacto</h3>
        <div className="configuracion-page__grid2">
          <Input
            label="Teléfono"
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
            placeholder="341 555-0000"
            error={errores.telefono}
            hint={errores.telefono ? undefined : 'El que recibe la clienta en el link de cancelación vencido.'}
          />
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="hola@camigonzalez.com"
            error={errores.email}
          />
        </div>
        <div className="configuracion-page__campo">
          <Input
            label="Dirección"
            value={direccion}
            onChange={(e) => setDireccion(e.target.value)}
            error={errores.direccion}
          />
        </div>

        <div className="configuracion-page__campo">
          <Input label="Zona horaria" value="Buenos Aires (no editable)" disabled hint="Fija en todo el sistema — nunca se envía al guardar." />
        </div>
      </section>

      <section className="configuracion-page__seccion">
        <h2 className="configuracion-page__seccion-titulo">Horario del centro</h2>
        <EditorHorarios
          key={horariosKey}
          ref={editorRef}
          value={horarios}
          onChange={handleHorariosChange}
          nullable={false}
          ayudaPropio="El horario en que el centro está abierto. Es el tope: los horarios de profesionales y servicios se recortan dentro de éste, nunca lo amplían."
        />
      </section>

      <section className="configuracion-page__seccion">
        <h2 className="configuracion-page__seccion-titulo">Reglas de reserva</h2>
        <div className="configuracion-page__grid-reglas">
          {REGLAS.map((r) => (
            <div key={r.campo} className="configuracion-page__campo">
              <Input
                label={r.label}
                type="number"
                min={r.min}
                step={1}
                value={reglas[r.campo]}
                onChange={(e) => setReglas((actual) => ({ ...actual, [r.campo]: e.target.value }))}
                suffix={<span className="configuracion-page__unidad">{r.unidad}</span>}
                error={errores[r.campo]}
              />
              <p className="configuracion-page__ayuda">{r.ayuda}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="configuracion-page__acciones">
        <p className="configuracion-page__nota">
          Los cambios aplican a nuevas reservas. Los turnos ya tomados no se tocan.
        </p>
        <div className="configuracion-page__botones">
          {haySucio ? (
            <Button variant="ghost" disabled={guardando} onClick={descartar}>
              Descartar cambios
            </Button>
          ) : null}
          <Button variant="primary" disabled={!haySucio || guardando} onClick={guardar}>
            {guardando ? 'Guardando…' : 'Guardar'}
          </Button>
        </div>
      </div>
    </div>
  );
}
