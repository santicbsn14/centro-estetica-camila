import type { ErrorApi } from '@shared/schemas/common.schema';

// Espejo del contrato de error del server: { codigo, mensaje, detalle? }
// (modelo-datos-turnos.md §10, frontend.md §2). Nunca se mapea por `mensaje`,
// siempre por `codigo` — ver los `case` en cada pantalla que consuma esto.
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
// (ej. el server cayó y devolvió HTML, o un 5xx sin body de error propio, o un
// proxy intermedio). No se filtra el body crudo al resto de la app — se
// normaliza acá, una sola vez.
export const CODIGO_ERROR_DESCONOCIDO = 'ERROR_DESCONOCIDO';

export function errorApiGenerico(): ErrorApi {
  return {
    codigo: CODIGO_ERROR_DESCONOCIDO,
    mensaje: 'Ocurrió un error inesperado. Probá de nuevo en unos segundos.',
  };
}
