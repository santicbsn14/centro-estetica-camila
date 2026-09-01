import { HttpError } from './http';

// Mensaje de usuario a partir de un error de red/API — nunca "fallar en
// silencio" (frontend.md §4.11, especialmente 429: POST /turnos 20/10min,
// GET disponibilidad/servicios 60/min). `HttpError.message` ya trae el
// `mensaje` curado del server (ApiError) o el fallback genérico del cliente
// HTTP (errorApiGenerico, ver lib/http/httpError.ts) para errores de red/
// CORS/5xx sin body — se reusa tal cual salvo el caso de rate limit, que
// pide una redacción propia más clara que "Demasiadas solicitudes,
// probá de nuevo en unos minutos" (texto del server, pensado para cualquier
// endpoint, no específico de este flujo).
export function mensajeDeError(err: unknown): string {
  if (err instanceof HttpError) {
    if (err.codigo === 'DEMASIADAS_SOLICITUDES') {
      return 'Demasiadas solicitudes seguidas. Esperá un momento y volvé a intentar.';
    }
    return err.message;
  }
  return 'Ocurrió un error inesperado. Probá de nuevo en unos segundos.';
}
