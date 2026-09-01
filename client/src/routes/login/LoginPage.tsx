import { useRef, useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { loginSchema } from '@shared/schemas/auth.schema';
import { Button, Input } from '../../components/ui';
import { http, HttpError } from '../../lib/http';
import { useAuth, type SesionUsuario } from '../../lib/auth';
import './LoginPage.css';

// Puerta única del panel — la usan admin y profesional por igual, la
// diferenciación de rol ocurre DESPUÉS de entrar (frontend.md §4.3).

type ErroresCampos = Partial<Record<'email' | 'password', string>>;

// Validación inline previa al submit (frontend.md §4.3: "campo vacío ⇒ hint
// bajo el campo"). Reusa el schema de @shared en vez de redefinir reglas: la
// verdad de qué es una credencial válida la tiene el server (§2).
function validarCampos(email: string, password: string): ErroresCampos {
  const resultado = loginSchema.safeParse({ email, password });
  if (resultado.success) {
    return {};
  }

  const errores: ErroresCampos = {};
  for (const issue of resultado.error.issues) {
    const campo = issue.path[0];
    if (campo === 'email' && !errores.email) {
      errores.email = email.trim() === '' ? 'Ingresá tu email' : 'Ingresá un email válido';
    }
    if (campo === 'password' && !errores.password) {
      errores.password = 'Ingresá tu contraseña';
    }
  }
  return errores;
}

// Mapeo por `codigo`, nunca por `mensaje` (frontend.md §2/§4.3). El resto
// (red caída, 5xx, etc.) cae al genérico sin romper la pantalla.
function mensajeError(err: unknown): string {
  if (err instanceof HttpError) {
    if (err.status === 401 && err.codigo === 'CREDENCIALES_INVALIDAS') {
      return 'Email o contraseña incorrectos';
    }
    if (err.status === 429 && err.codigo === 'DEMASIADOS_INTENTOS') {
      return 'Demasiados intentos, esperá unos minutos';
    }
  }
  return 'Ocurrió un error. Probá de nuevo en unos segundos.';
}

interface LocationState {
  // Seteado por RequireSesion cuando redirige acá sin sesión (routes/guards/
  // RequireSesion.tsx) — volver a la ruta pedida en vez de mandar siempre a
  // /turnos.
  from?: { pathname: string; search: string };
}

export function LoginPage() {
  const { usuario, loading, establecerSesion } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mostrarPassword, setMostrarPassword] = useState(false);
  const [erroresCampos, setErroresCampos] = useState<ErroresCampos>({});
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  // Ya hay sesión (AuthProvider ya resolvió GET /api/auth/me) ⇒ no mostrar el
  // login a alguien logueado (frontend.md §4.3, punto 5 del encargo).
  if (!loading && usuario) {
    return <Navigate to="/turnos" replace />;
  }

  function actualizarEmail(valor: string) {
    setEmail(valor);
    setErroresCampos((prev) => (prev.email ? { ...prev, email: undefined } : prev));
    setErrorBanner(null);
  }

  function actualizarPassword(valor: string) {
    setPassword(valor);
    setErroresCampos((prev) => (prev.password ? { ...prev, password: undefined } : prev));
    setErrorBanner(null);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (enviando) return;

    const errores = validarCampos(email, password);
    setErroresCampos(errores);
    setErrorBanner(null);

    if (errores.email) {
      emailRef.current?.focus();
      return;
    }
    if (errores.password) {
      passwordRef.current?.focus();
      return;
    }

    setEnviando(true);
    try {
      const sesion = await http.post<SesionUsuario>('/api/auth/login', { email, password });
      establecerSesion(sesion);
      const from = (location.state as LocationState | null)?.from;
      const destino = from ? `${from.pathname}${from.search}` : '/turnos';
      navigate(destino, { replace: true });
    } catch (err) {
      setErrorBanner(mensajeError(err));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-page__wrap">
        {/* Lockup de marca (frontend.md §3): monograma + wordmark serif
            versalitas + tagline tracked, clonado de login-camila.html. El
            monograma es texto ("cg") como placeholder — la extracción del
            PNG transparente de la hoja de marca sigue PENDIENTE (§3), mismo
            estado que el de la sidebar. */}
        <div className="login-page__lockup">
          <div className="login-page__monograma" aria-hidden="true">
            cg
          </div>
          <h1 className="login-page__wordmark">Camila González</h1>
          <p className="login-page__tagline">Salón de belleza</p>
        </div>

        <div className="login-page__card">
          <p className="login-page__eyebrow">Panel de gestión</p>

          {loading ? (
            <p className="login-page__cargando" role="status" aria-live="polite">
              Verificando sesión…
            </p>
          ) : (
            <form className="login-form" onSubmit={onSubmit} noValidate>
              {errorBanner ? (
                <p className="login-form__banner" role="alert">
                  <IconoAlerta />
                  <span>{errorBanner}</span>
                </p>
              ) : null}

              <Input
                ref={emailRef}
                label="Email"
                type="email"
                name="email"
                autoComplete="username"
                placeholder="camila@camigonzalez.com"
                value={email}
                onChange={(event) => actualizarEmail(event.target.value)}
                error={erroresCampos.email}
                disabled={enviando}
              />

              <Input
                ref={passwordRef}
                label="Contraseña"
                type={mostrarPassword ? 'text' : 'password'}
                name="password"
                autoComplete="current-password"
                placeholder="Tu contraseña"
                value={password}
                onChange={(event) => actualizarPassword(event.target.value)}
                error={erroresCampos.password}
                disabled={enviando}
                suffix={
                  <button
                    type="button"
                    className="login-form__toggle"
                    onClick={() => setMostrarPassword((valor) => !valor)}
                    aria-label={mostrarPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  >
                    <IconoOjo />
                  </button>
                }
              />

              <Button type="submit" variant="primary" className="login-form__submit" disabled={enviando}>
                {enviando ? 'Ingresando…' : 'Ingresar'}
              </Button>
            </form>
          )}
        </div>

        <p className="login-page__foot">
          ¿Olvidaste tu contraseña? <span className="login-page__foot-enlace">Pedísela a Camila.</span>
        </p>
      </div>
    </div>
  );
}

// Toggle de visibilidad con ícono (no texto "Mostrar"/"Ocultar") — clonado de
// login-camila.html. El mismo glifo de ojo para ambos estados (el mockup no
// cambia de ícono entre mostrar/ocultar), la distinción real vive en
// `aria-label`, que sí cambia — sin eso un lector de pantalla no tendría
// forma de saber qué hace el botón.
function IconoOjo() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function IconoAlerta() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}
