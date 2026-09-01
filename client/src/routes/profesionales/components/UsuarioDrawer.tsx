import { useRef, useState } from 'react';
import { crearUsuarioSchema, editarUsuarioSchema, resetPasswordSchema } from '@shared/schemas/usuario.schema';
import type { CrearUsuarioInput, EditarUsuarioInput } from '@shared/schemas/usuario.schema';
import type { HorarioDia } from '@shared/schemas/common.schema';
import { Button, Drawer, Input, Switch } from '../../../components/ui';
import { EditorHorarios, type EditorHorariosHandle } from '../../../components/EditorHorarios/EditorHorarios';
import { normalizarTelefonoAR } from '../../../lib/format/telefono';
import type { ServicioPanel } from '../../servicios/types';
import type { RolUsuario, UsuarioPanel } from '../types';

export type ResultadoGuardar = { ok: true } | { ok: false; errorEmail?: string };
// turnosFuturosActivos presente ⇒ se desactivó pero tiene turnos futuros —
// informar, no bloquear (§15.9): el PATCH ya se aplicó, esto sólo decide si
// el drawer se cierra solo o se queda mostrando el aviso.
export type ResultadoToggle = { ok: true; turnosFuturosActivos?: number } | { ok: false };

export interface UsuarioDrawerProps {
  // null = alta. Presente = edición de ESE usuario (frontend.md §4.6).
  usuario: UsuarioPanel | null;
  usuariosExistentes: UsuarioPanel[];
  servicios: ServicioPanel[]; // catálogo para el multiselect (reusa listarServicios, no lo reimplementa)
  guardando: boolean;
  toggleOcupado: boolean;
  reseteando: boolean;
  onGuardar: (payload: CrearUsuarioInput | EditarUsuarioInput) => Promise<ResultadoGuardar>;
  onToggleActivo: () => Promise<ResultadoToggle>;
  onResetPassword: (nueva: string) => Promise<boolean>;
  onCerrar: () => void;
}

const MENSAJE_CAMPO: Record<string, string> = {
  nombre: 'Poné un nombre (mínimo 2 caracteres).',
  email: 'Ingresá un email válido.',
  password: 'Mínimo 8 caracteres.',
};

// Drawer de alta/edición (frontend.md §4.6). Sólo se monta mientras está
// abierto (mismo criterio que ServicioDrawer) — arranca siempre desde cero,
// sin necesitar resetear estado por props.
export function UsuarioDrawer({
  usuario,
  usuariosExistentes,
  servicios,
  guardando,
  toggleOcupado,
  reseteando,
  onGuardar,
  onToggleActivo,
  onResetPassword,
  onCerrar,
}: UsuarioDrawerProps) {
  const [nombre, setNombre] = useState(usuario?.nombre ?? '');
  const [telefono, setTelefono] = useState(usuario?.telefonoE164 ?? '');
  const [email, setEmail] = useState(usuario?.email ?? '');
  const [rol, setRol] = useState<RolUsuario>(usuario?.rol ?? 'profesional');
  const [atiende, setAtiende] = useState(usuario?.atiende ?? true);
  const [serviciosSel, setServiciosSel] = useState<string[]>(usuario?.servicios ?? []);
  const [horarios, setHorarios] = useState<HorarioDia[]>(usuario?.horarios ?? []);
  const [passwordInicial, setPasswordInicial] = useState('');
  const [errores, setErrores] = useState<Record<string, string>>({});

  // Reset de contraseña — acción dedicada, sólo en edición (§15.9: nunca hay
  // campo password en el form de edición).
  const [resetAbierto, setResetAbierto] = useState(false);
  const [passwordNueva, setPasswordNueva] = useState('');
  const [errorReset, setErrorReset] = useState<string | undefined>();

  // Aviso post-desactivación con turnos futuros (§15.9) — ver handleToggleActivo.
  const [avisoTurnosFuturos, setAvisoTurnosFuturos] = useState<number | null>(null);

  const editorRef = useRef<EditorHorariosHandle>(null);

  function toggleServicio(id: string) {
    setServiciosSel((actual) => (actual.includes(id) ? actual.filter((s) => s !== id) : [...actual, id]));
  }

  function validar(): CrearUsuarioInput | EditarUsuarioInput | null {
    const nuevosErrores: Record<string, string> = {};

    // Teléfono: opcional, pero si viene tiene que normalizar a E164 ANTES de
    // mandarlo (frontend.md §2 — "el server no reconstruye área faltante").
    const telefonoCrudo = telefono.trim();
    const telefonoNormalizado = telefonoCrudo ? normalizarTelefonoAR(telefonoCrudo) : null;
    const telefonoE164 = telefonoNormalizado ?? undefined;
    if (telefonoCrudo && !telefonoNormalizado) {
      nuevosErrores.telefono = 'Teléfono inválido. Probá con código de área, ej: 341 555-2847.';
    }

    // editarUsuarioSchema es .strict() (§15.9): password NUNCA en este
    // payload, ni siquiera como key con valor undefined (un key desconocido
    // con valor undefined igual cuenta como "no reconocido" para Zod) — por
    // eso se arma condicionalmente con spread, no con `password: undefined`.
    const base = {
      nombre: nombre.trim(),
      email: email.trim(),
      rol,
      atiende,
      servicios: serviciosSel,
      horarios,
      telefonoE164,
    };
    const datos = usuario ? base : { ...base, password: passwordInicial };

    // Chequeo optimista de email duplicado (case-insensitive, frontend.md
    // §4.6, punto 4) — sólo UX rápida; el 409 EMAIL_DUPLICADO real del
    // server pisa esto igual si el chequeo local no lo agarra.
    const dup = usuariosExistentes.some(
      (u) => u.id !== usuario?.id && u.email.trim().toLocaleLowerCase('es') === datos.email.toLocaleLowerCase('es')
    );
    if (dup) nuevosErrores.email = 'Ya hay una cuenta con ese email.';

    // Reusa el schema real de @shared (frontend.md §4.0) en vez de
    // reimplementar reglas de forma. horarios se valida aparte, vía
    // editorRef — acá no importa si horarios pasa o no.
    const schema = usuario ? editarUsuarioSchema : crearUsuarioSchema;
    const parsed = schema.safeParse(datos);
    if (!parsed.success) {
      const campos = parsed.error.flatten().fieldErrors as Record<string, string[] | undefined>;
      for (const campo of Object.keys(campos)) {
        if (campo === 'horarios' || campo === 'telefonoE164') continue; // mensaje propio arriba
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
    if (!resultado.ok && resultado.errorEmail) {
      setErrores((actual) => ({ ...actual, email: resultado.errorEmail! }));
    }
  }

  async function handleToggleActivo() {
    const resultado = await onToggleActivo();
    if (!resultado.ok) return;
    if (resultado.turnosFuturosActivos) {
      setAvisoTurnosFuturos(resultado.turnosFuturosActivos);
    } else {
      onCerrar();
    }
  }

  // "Reactivar" del aviso de turnos futuros — a diferencia de
  // handleToggleActivo (footer), NO limpia el aviso antes de saber si el
  // segundo PATCH funcionó: si falla (red/5xx), la profesional SIGUE
  // desactivada de verdad (el primer PATCH ya se aplicó, éste es un intento
  // aparte) — no hay que asumir que revirtió. El toast de error ya lo
  // dispara `onToggleActivo` en el padre; acá sólo se decide qué hacer con
  // el aviso en pantalla según el resultado.
  async function handleReactivar() {
    const resultado = await onToggleActivo();
    if (!resultado.ok) return; // sigue desactivada — el aviso se queda tal cual, con el toast de error ya disparado
    setAvisoTurnosFuturos(null);
    onCerrar(); // usuario.activo ya refleja el nuevo estado (prop actualizada por el padre) ⇒ este segundo llamado reactivó
  }

  async function handleReset() {
    const parsed = resetPasswordSchema.safeParse({ nueva: passwordNueva });
    if (!parsed.success) {
      setErrorReset('Mínimo 8 caracteres.');
      return;
    }
    setErrorReset(undefined);
    const ok = await onResetPassword(passwordNueva);
    if (ok) onCerrar();
  }

  return (
    <Drawer
      abierto
      onCerrar={onCerrar}
      titulo={usuario ? 'Editar profesional' : 'Nueva profesional'}
      footer={
        <>
          {usuario ? (
            <Button variant="danger-outline" disabled={guardando || toggleOcupado} onClick={handleToggleActivo}>
              {usuario.activo ? 'Desactivar' : 'Activar'}
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
      {avisoTurnosFuturos ? (
        <div className="callout callout--warn">
          {/* La desactivación YA pasó (el PATCH es inmediato, no hay preview
              del lado del server) — el copy tiene que hablar en pasado, no
              como si estuviera pidiendo confirmación de algo que todavía no
              ocurrió (frontend.md §4.6, corrección sobre la ⚠ de la tarea
              anterior). */}
          {usuario?.nombre} quedó desactivada. Tiene <b>{avisoTurnosFuturos} turnos futuros</b> ya reservados — no se
          cancelaron. Reasignalos o cancelalos por WhatsApp.
          <div className="callout__acciones">
            <Button variant="ghost" onClick={() => setAvisoTurnosFuturos(null)}>
              Entendido
            </Button>
            <Button variant="secondary" onClick={handleReactivar} disabled={toggleOcupado}>
              Reactivar
            </Button>
          </div>
        </div>
      ) : null}

      <div className="usuario-drawer__grid2">
        <Input
          label="Nombre"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Nombre y apellido"
          error={errores.nombre}
        />
        <Input
          label="Teléfono"
          value={telefono}
          onChange={(e) => setTelefono(e.target.value)}
          placeholder="341 555-0000"
          error={errores.telefono}
          hint={errores.telefono ? undefined : 'Le avisa cuando entra un turno nuevo.'}
        />
      </div>

      <div className="usuario-drawer__campo">
        <Input
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="nombre@camigonzalez.com"
          error={errores.email}
          hint={errores.email || !usuario ? undefined : 'Cambiar el email cambia con qué se loguea esta profesional.'}
        />
      </div>

      <div className="usuario-drawer__grid2">
        <div className="usuario-drawer__campo">
          <span className="input-field__label">Rol</span>
          <div className="usuario-drawer__seg">
            <button type="button" className={rol === 'profesional' ? 'is-on' : ''} onClick={() => setRol('profesional')}>
              Profesional
            </button>
            <button type="button" className={rol === 'admin' ? 'is-on' : ''} onClick={() => setRol('admin')}>
              Admin
            </button>
          </div>
        </div>
        <div className="usuario-drawer__campo">
          <span className="input-field__label">Toma turnos</span>
          <Switch checked={atiende} onChange={setAtiende} label="Aparece en la web" />
          <p className="usuario-drawer__ayuda">Desactivá para que no tome turnos nuevos sin dar de baja la cuenta.</p>
        </div>
      </div>

      <div className="usuario-drawer__campo">
        <span className="input-field__label">Servicios que presta</span>
        <div className="usuario-drawer__chips">
          {servicios.map((s) => {
            const on = serviciosSel.includes(s.id);
            return (
              <button
                key={s.id}
                type="button"
                className={`chip${on ? ' is-on' : ''}`}
                onClick={() => toggleServicio(s.id)}
                aria-pressed={on}
              >
                {s.nombre}
                {s.activo ? '' : ' (inactivo)'}
              </button>
            );
          })}
          {servicios.length === 0 ? <p className="usuario-drawer__ayuda">Todavía no hay servicios cargados.</p> : null}
        </div>
      </div>

      <div className="usuario-drawer__campo">
        <span className="input-field__label">Horario de trabajo</span>
        <EditorHorarios ref={editorRef} value={horarios} onChange={(v) => setHorarios(v ?? [])} nullable={false} />
      </div>

      {!usuario ? (
        <div className="usuario-drawer__campo">
          <Input
            label="Contraseña inicial"
            type="password"
            value={passwordInicial}
            onChange={(e) => setPasswordInicial(e.target.value)}
            placeholder="Mínimo 8 caracteres"
            error={errores.password}
            hint={errores.password ? undefined : 'Se la comunicás por fuera. Ella puede cambiarla después.'}
          />
        </div>
      ) : (
        <div className="usuario-drawer__campo">
          <span className="input-field__label">Contraseña</span>
          {!resetAbierto ? (
            <Button variant="secondary" className="usuario-drawer__boton-ancho" onClick={() => setResetAbierto(true)}>
              Resetear contraseña
            </Button>
          ) : (
            <div className="usuario-drawer__reset">
              <Input
                label="Nueva contraseña"
                type="password"
                value={passwordNueva}
                onChange={(e) => setPasswordNueva(e.target.value)}
                placeholder="Mínimo 8 caracteres"
                error={errorReset}
              />
              <div className="callout callout--warn">Al resetear, se cierran las sesiones abiertas de la profesional.</div>
              <Button
                variant="primary"
                className="usuario-drawer__boton-ancho"
                disabled={reseteando}
                onClick={handleReset}
              >
                Guardar contraseña nueva
              </Button>
            </div>
          )}
        </div>
      )}
    </Drawer>
  );
}
