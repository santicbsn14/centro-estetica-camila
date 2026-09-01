// Forma fija de error de la API (modelo-datos-turnos.md §10): { codigo, mensaje, detalle? }.
// Se lanza desde cualquier capa de servicio y lo traduce errorHandler middleware.

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly codigo: string,
    mensaje: string,
    public readonly detalle?: unknown
  ) {
    super(mensaje);
    this.name = 'ApiError';
  }
}
