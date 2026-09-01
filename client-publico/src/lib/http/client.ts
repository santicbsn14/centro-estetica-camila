import { errorApiSchema } from '@shared/schemas/common.schema';
import { HttpError, errorApiGenerico } from './httpError';

// Cliente HTTP de la WEB PÚBLICA (frontend.md §4.10). Deliberadamente más
// simple que el del panel (client/src/lib/http/client.ts):
// - SIN `credentials: 'include'` — las rutas públicas (POST /api/turnos,
//   GET /api/disponibilidad, GET /api/servicios*) no llevan cookie de sesión,
//   la web pública es anónima (frontend.md §2/§4.2, §4.10).
// - SIN header `X-Requested-With` — ese header es el gate CSRF de las rutas
//   AUTENTICADAS del panel (server/src/middleware/auth.ts); las rutas
//   públicas no pasan por ahí. Mandarlo acá no rompería nada, pero no
//   corresponde: esta app no tiene nada que proteger con CSRF (no hay sesión
//   que un tercero pueda montar).
// - SIN interceptor 401 — no hay concepto de sesión que perder. Un 401 acá
//   (si llegara a pasar) es un error de API más, lo maneja el caller como
//   cualquier otro código.
//
// Depende únicamente de que este origen esté en la allowlist de CORS del
// server — ver ⚠ REVISAR EN WEB en frontend.md §5 (entrada de esta tarea):
// hoy el server sólo permite UN origen (PANEL_ORIGIN).

const BASE_URL = import.meta.env.VITE_API_URL;

if (!BASE_URL) {
  // eslint-disable-next-line no-console
  console.warn(
    'VITE_API_URL no está definida — copiar client-publico/.env.example a client-publico/.env. ' +
      'El cliente HTTP va a pegarle a rutas relativas, que no van a resolver contra el server.'
  );
}

interface RequestOptions {
  body?: unknown;
  signal?: AbortSignal;
}

async function request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  let res: Response;
  try {
    res = await fetch(`${BASE_URL ?? ''}${path}`, {
      method,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw err;
    }
    // Server caído, sin red, CORS bloqueado, etc. — no hay response que
    // parsear. Se normaliza al mismo shape que el resto de los errores para
    // que el caller no tenga que distinguir "no hubo respuesta" de
    // "respuesta con error".
    throw new HttpError(0, errorApiGenerico());
  }

  if (res.status === 204) {
    return undefined as T;
  }

  const body: unknown = await res.json().catch(() => undefined);

  if (!res.ok) {
    const parsed = errorApiSchema.safeParse(body);
    throw new HttpError(res.status, parsed.success ? parsed.data : errorApiGenerico());
  }

  return body as T;
}

export const http = {
  get: <T>(path: string, opts?: RequestOptions): Promise<T> => request<T>('GET', path, opts),
  post: <T>(path: string, body?: unknown, opts?: RequestOptions): Promise<T> =>
    request<T>('POST', path, { ...opts, body }),
};
