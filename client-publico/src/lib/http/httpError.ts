import type { ErrorApi } from '@shared/schemas/common.schema';

// Espejo del contrato de error del server: { codigo, mensaje, detalle? }
// (modelo-datos-turnos.md §10, frontend.md §2). Nunca se mapea por `mensaje`,
// siempre por `codigo`. Idéntico al del panel (client/src/lib/http/httpError.ts)
// — esta parte del contrato no cambia entre superficies, sólo credentials/CSRF
// cambian (frontend.md §4.10).
export class HttpError extends Error {
  readonly status: number;
  readonly codigo: string;
  readonly detalle?: unknown;

  constructor(status: number, error: ErrorApi) {
    super(error.mensaje);
    this.name = 'HttpError';
    this.status = status;
    this.codigo = error.codigo;
    this.detalle = error.detalle;
  }
}

// Fallback para respuestas de error que NO cumplen { codigo, mensaje, detalle? }
// (ej. el server cayó y devolvió HTML, un 5xx sin body de error propio, un
// proxy intermedio, o CORS bloqueó el request y el browser nunca dejó ver la
// respuesta real).
export const CODIGO_ERROR_DESCONOCIDO = 'ERROR_DESCONOCIDO';

export function errorApiGenerico(): ErrorApi {
  return {
    codigo: CODIGO_ERROR_DESCONOCIDO,
    mensaje: 'Ocurrió un error inesperado. Probá de nuevo en unos segundos.',
  };
}
