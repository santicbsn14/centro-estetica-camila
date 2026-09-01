import { errorApiSchema } from '@shared/schemas/common.schema';
import { HttpError, errorApiGenerico } from './httpError';

// Cliente HTTP del PANEL (frontend.md §4.0/§4.2). No es el cliente de la web
// pública — ese es otro, sin credentials/CSRF, cuando se construya esa fase.

const BASE_URL = import.meta.env.VITE_API_URL;

if (!BASE_URL) {
  // eslint-disable-next-line no-console
  console.warn(
    'VITE_API_URL no está definida — copiar client/.env.example a client/.env. ' +
      'El cliente HTTP va a pegarle a rutas relativas, que no van a resolver contra el server.'
  );
}

const METODOS_MUTANTES = new Set(['POST', 'PATCH', 'DELETE', 'PUT']);

// Debe coincidir exactamente con server/src/middleware/auth.ts (HEADER_CSRF/VALOR_CSRF).
const HEADER_CSRF = 'X-Requested-With';
const VALOR_CSRF = 'XMLHttpRequest';

// El único código 401 que emite requireAuth para "no hay sesión válida"
// (server/src/middleware/auth.ts: NO_AUTENTICADO). CREDENCIALES_INVALIDAS es
// un 401 distinto — el de POST /api/auth/login, que no pasa por requireAuth.
// Ese NO dispara el interceptor global: es un login fallido, se muestra
// inline en la pantalla de login (frontend.md §4.3), no "perdí la sesión".
const CODIGO_SESION_INVALIDA = 'NO_AUTENTICADO';

// Disparado en `window` cuando un request autenticado vuelve con sesión
// inválida/ausente. lib/auth/AuthContext escucha esto para limpiar el estado
// y redirigir a /login — un solo lugar, no repetido por pantalla
// (frontend.md §4.0: "401 en cualquier request (interceptor) → limpiar sesión
// y redirigir a /login").
export const EVENTO_NO_AUTENTICADO = 'panel:no-autenticado';

interface RequestOptions {
  body?: unknown;
  signal?: AbortSignal;
}

async function request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (METODOS_MUTANTES.has(method)) {
    headers[HEADER_CSRF] = VALOR_CSRF;
  }

  let res: Response;
  try {
    res = await fetch(`${BASE_URL ?? ''}${path}`, {
      method,
      credentials: 'include', // cookie de sesión cross-site, SIEMPRE — frontend.md §2/§4.2
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw err;
    }
    // Server caído, sin red, CORS bloqueado, mixed content, etc. — no hay
    // response que parsear. Se normaliza al mismo shape que el resto de los
    // errores para que el caller no tenga que distinguir "no hubo respuesta"
    // de "respuesta con error".
    throw new HttpError(0, errorApiGenerico());
  }

  if (res.status === 204) {
    return undefined as T;
  }

  const body: unknown = await res.json().catch(() => undefined);

  if (!res.ok) {
    const parsed = errorApiSchema.safeParse(body);
    const errorApi = parsed.success ? parsed.data : errorApiGenerico();

    if (res.status === 401 && errorApi.codigo === CODIGO_SESION_INVALIDA) {
      window.dispatchEvent(new CustomEvent(EVENTO_NO_AUTENTICADO));
    }

    throw new HttpError(res.status, errorApi);
  }

  return body as T;
}

export const http = {
  get: <T>(path: string, opts?: RequestOptions): Promise<T> => request<T>('GET', path, opts),
  post: <T>(path: string, body?: unknown, opts?: RequestOptions): Promise<T> =>
    request<T>('POST', path, { ...opts, body }),
  patch: <T>(path: string, body?: unknown, opts?: RequestOptions): Promise<T> =>
    request<T>('PATCH', path, { ...opts, body }),
  delete: <T>(path: string, opts?: RequestOptions): Promise<T> => request<T>('DELETE', path, opts),
};
