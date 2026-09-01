import { useCallback, useEffect, useRef, useState } from 'react';
import { miPerfilSchema, cambiarPasswordSchema } from '@shared/schemas/usuario.schema';
import type { HorarioDia } from '@shared/schemas/common.schema';
import { Button, Input, useToast } from '../../components/ui';
import { EditorHorarios, type EditorHorariosHandle } from '../../components/EditorHorarios/EditorHorarios';
import { HttpError } from '../../lib/http';
import { useAuth } from '../../lib/auth';
import * as api from './api';
import type { MiPerfil } from './types';
import './MiPerfilPage.css';

// Mi perfil (frontend.md §4.9) — cierra el panel. Superficie de
// auto-gestión: cualquier usuario logueado (requireAuth, NO admin-gate, ver
// App.tsx: /mi cuelga de <RequireSesion/> pero NO de <RequireRol/>). Recurso
// = sesión, tres endpoints SIN :id, cada uno con su propio botón guardar —
// a diferencia de Configuracion (un solo PATCH con dirty-tracking global),
// acá son tres superficies independientes que conviene poder guardar sin
// esperar a que las otras dos también estén "limpias".

function mensajeError(err: unknown): string {
  if (err instanceof HttpError) return err.message;
  return 'Ocurrió un error inesperado. Probá de nuevo en unos segundos.';
}

const MENSAJE_CAMPO_PERFIL: Record<string, string> = {
  nombre: 'Poné un nombre (mínimo 2 caracteres).',
};

export function MiPerfilPage() {
  const { usuario: sesion, establecerSesion } = useAuth();
  const { mostrarToast } = useToast();

  const [perfil, setPerfil] = useState<MiPerfil | null>(null);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  // --- Sección 1: mis datos (PATCH /api/mi/perfil, sólo nombre — email y
  // telefonoE164 no están en miPerfilSchema.strict(), ver @shared: quedan
  // readonly, no por elección de UI sino porque el server los rechazaría con
  // 400 BODY_INVALIDO si vinieran en el body). ------------------------------
  const [nombre, setNombre] = useState('');
  const [errorNombre, setErrorNombre] = useState<string | undefined>();
  const [guardandoDatos, setGuardandoDatos] = useState(false);

  // --- Sección 2: mis horarios (PATCH /api/mi/horarios). -------------------
  const [horarios, setHorarios] = useState<HorarioDia[]>([]);
  const [horariosTocado, setHorariosTocado] = useState(false);
  // EditorHorarios sólo lee `value` una vez al montar — esta página nunca se
  // desmonta, así que se fuerza remount con `key` cada vez que hay que
  // resincronizar contra el server (mismo patrón que ConfiguracionPage.tsx).
  const [horariosKey, setHorariosKey] = useState(0);
  const [guardandoHorarios, setGuardandoHorarios] = useState(false);
  const editorRef = useRef<EditorHorariosHandle>(null);

  // --- Sección 3: cambiar mi contraseña (POST /api/mi/password). -----------
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [repetir, setRepetir] = useState('');
  const [erroresPassword, setErroresPassword] = useState<{ actual?: string; nueva?: string; repetir?: string }>({});
  const [guardandoPassword, setGuardandoPassword] = useState(false);

  function aplicarPerfil(data: MiPerfil) {
    setPerfil(data);
    setNombre(data.nombre);
    setErrorNombre(undefined);
    setHorarios(data.horarios);
    setHorariosTocado(false);
    setHorariosKey((k) => k + 1);
  }

  const cargar = useCallback(async () => {
    setCargando(true);
    setErrorCarga(null);
    try {
      aplicarPerfil(await api.obtenerMiPerfil());
    } catch (err) {
      setErrorCarga(mensajeError(err));
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const nombreSucio = perfil ? nombre.trim() !== perfil.nombre : false;

  // --- Handlers: mis datos ---------------------------------------------
  async function guardarDatos() {
    if (!perfil || !nombreSucio) return;

    const nombreTrim = nombre.trim();
    const parsed = miPerfilSchema.safeParse({ nombre: nombreTrim });
    if (!parsed.success) {
      setErrorNombre(MENSAJE_CAMPO_PERFIL.nombre);
      return;
    }
    setErrorNombre(undefined);

    setGuardandoDatos(true);
    try {
      const actualizado = await api.editarMiPerfil({ nombre: nombreTrim });
      aplicarPerfil(actualizado);
      // Sincroniza el nombre del bloque de usuario en la sidebar (AuthContext)
      // sin un round-trip extra a /api/auth/me — la respuesta de PATCH ya
      // trae todo lo que SesionUsuario necesita.
      if (sesion) {
        establecerSesion({ id: actualizado.id, nombre: actualizado.nombre, rol: actualizado.rol, atiende: actualizado.atiende });
      }
      mostrarToast('Nombre actualizado.', 'exito');
    } catch (err) {
      mostrarToast(mensajeError(err), 'error');
    } finally {
      setGuardandoDatos(false);
    }
  }

  // --- Handlers: mis horarios -------------------------------------------
  function handleHorariosChange(valor: HorarioDia[] | null) {
    setHorarios(valor ?? []);
    setHorariosTocado(true);
  }

  async function guardarHorarios() {
    if (!perfil || !horariosTocado) return;
    const horarioValido = editorRef.current?.validar() ?? true;
    if (!horarioValido) return;

    setGuardandoHorarios(true);
    try {
      const actualizado = await api.editarMisHorarios({ horarios });
      aplicarPerfil(actualizado);
      mostrarToast('Horarios actualizados.', 'exito');
    } catch (err) {
      mostrarToast(mensajeError(err), 'error');
    } finally {
      setGuardandoHorarios(false);
    }
  }

  // --- Handlers: cambiar contraseña --------------------------------------
  function validarPassword(): { actual: string; nueva: string } | null {
    const nuevosErrores: { actual?: string; nueva?: string; repetir?: string } = {};

    const parsed = cambiarPasswordSchema.safeParse({ actual, nueva });
    if (!parsed.success) {
      const campos = parsed.error.flatten().fieldErrors as Record<string, string[] | undefined>;
      if (campos.actual) nuevosErrores.actual = 'Ingresá tu contraseña actual.';
      if (campos.nueva) nuevosErrores.nueva = 'La nueva contraseña necesita mínimo 8 caracteres.';
    }
    // nueva===repetir: sólo del lado del front, cambiarPasswordSchema no
    // conoce "repetir" (no viaja al server, es sólo para evitar un typo).
    if (!nuevosErrores.nueva && repetir !== nueva) {
      nuevosErrores.repetir = 'No coincide con la nueva contraseña.';
    }

    setErroresPassword(nuevosErrores);
    if (Object.keys(nuevosErrores).length > 0) return null;
    return { actual, nueva };
  }

  async function guardarPassword() {
    const payload = validarPassword();
    if (!payload) return;

    setGuardandoPassword(true);
    try {
      await api.cambiarMiPassword(payload);
      setActual('');
      setNueva('');
      setRepetir('');
      setErroresPassword({});
      mostrarToast('Contraseña actualizada.', 'exito');
    } catch (err) {
      // Mapeo por `codigo`, no por texto (frontend.md §2): la actual
      // incorrecta es un 401 CREDENCIALES_INVALIDAS (usuarios.service.ts,
      // cambiarMiPassword) — se muestra inline bajo el campo, no como toast
      // genérico. Cualquier otro caso (red, 5xx) cae al toast.
      if (err instanceof HttpError && err.codigo === 'CREDENCIALES_INVALIDAS') {
        setErroresPassword({ actual: 'La contraseña actual no es correcta.' });
      } else {
        mostrarToast(mensajeError(err), 'error');
      }
    } finally {
      setGuardandoPassword(false);
    }
  }

  if (cargando) {
    return (
      <div className="mi-page">
        <h1 className="mi-page__titulo">Mi perfil</h1>
        <div className="mi-page__vacio">Cargando tu perfil…</div>
      </div>
    );
  }

  if (errorCarga || !perfil) {
    return (
      <div className="mi-page">
        <h1 className="mi-page__titulo">Mi perfil</h1>
        <div className="mi-page__aviso mi-page__aviso--error">{errorCarga ?? 'No se pudo cargar tu perfil.'}</div>
      </div>
    );
  }

  return (
    <div className="mi-page">
      <div className="mi-page__head">
        <h1 className="mi-page__titulo">Mi perfil</h1>
      </div>
      <p className="mi-page__sub">Tus datos, tu horario y tu contraseña. Cada sección se guarda por separado.</p>

      {/* Sección 1: mis datos */}
      <section className="mi-page__seccion">
        <h2 className="mi-page__seccion-titulo">Mis datos</h2>

        <div className="mi-page__campo">
          <Input label="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} error={errorNombre} />
        </div>

        <div className="mi-page__grid2">
          <Input
            label="Teléfono"
            value={perfil.telefonoE164 ?? ''}
            disabled
            hint="Lo cambia Camila desde el CRUD de profesionales."
          />
          <Input label="Email" value={perfil.email} disabled hint="Es tu usuario de acceso. Lo cambia Camila." />
        </div>

        <div className="mi-page__seccion-acciones">
          <Button variant="primary" disabled={!nombreSucio || guardandoDatos} onClick={guardarDatos}>
            {guardandoDatos ? 'Guardando…' : 'Guardar'}
          </Button>
        </div>
      </section>

      {/* Bloque readonly de contexto: rol/atiende/servicios son política del
          centro, no preferencia personal — miPerfilSchema.strict() los
          rechazaría con 400 BODY_INVALIDO si vinieran en el body, así que el
          front ni los muestra editables ni los envía nunca. */}
      <section className="mi-page__seccion">
        <h2 className="mi-page__seccion-titulo">Tu perfil en el centro</h2>
        <div className="mi-page__grid2">
          <Input label="Rol" value={perfil.rol === 'admin' ? 'Admin' : 'Profesional'} disabled />
          <Input label="Atiende turnos" value={perfil.atiende ? 'Sí' : 'No'} disabled />
        </div>
        <div className="mi-page__campo">
          <Input
            label="Servicios que presta"
            value={perfil.servicios.length === 1 ? '1 servicio' : `${perfil.servicios.length} servicios`}
            disabled
          />
        </div>
        <p className="mi-page__ayuda">Tu rol, servicios y disponibilidad los administra Camila.</p>
      </section>

      {/* Sección 2: mis horarios */}
      <section className="mi-page__seccion">
        <h2 className="mi-page__seccion-titulo">Mis horarios</h2>
        <EditorHorarios key={horariosKey} ref={editorRef} value={horarios} onChange={handleHorariosChange} nullable={false} />
        <div className="mi-page__seccion-acciones">
          <Button variant="primary" disabled={!horariosTocado || guardandoHorarios} onClick={guardarHorarios}>
            {guardandoHorarios ? 'Guardando…' : 'Guardar'}
          </Button>
        </div>
      </section>

      {/* Sección 3: cambiar mi contraseña */}
      <section className="mi-page__seccion">
        <h2 className="mi-page__seccion-titulo">Cambiar mi contraseña</h2>

        <div className="mi-page__campo">
          <Input
            label="Contraseña actual"
            type="password"
            autoComplete="current-password"
            value={actual}
            onChange={(e) => setActual(e.target.value)}
            error={erroresPassword.actual}
          />
        </div>
        <div className="mi-page__grid2">
          <Input
            label="Nueva contraseña"
            type="password"
            autoComplete="new-password"
            value={nueva}
            onChange={(e) => setNueva(e.target.value)}
            error={erroresPassword.nueva}
            hint={erroresPassword.nueva ? undefined : 'Mínimo 8 caracteres.'}
          />
          <Input
            label="Repetir nueva contraseña"
            type="password"
            autoComplete="new-password"
            value={repetir}
            onChange={(e) => setRepetir(e.target.value)}
            error={erroresPassword.repetir}
          />
        </div>

        <div className="mi-page__seccion-acciones">
          <Button variant="primary" disabled={guardandoPassword} onClick={guardarPassword}>
            {guardandoPassword ? 'Guardando…' : 'Cambiar contraseña'}
          </Button>
        </div>
      </section>
    </div>
  );
}
