import { ErrorRequestHandler } from 'express';
import { ApiError } from '../utils/apiError';

// Último middleware de la cadena: traduce ApiError a { codigo, mensaje, detalle? }
// y cualquier otro error a 500 genérico, sin filtrar detalles internos.
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ApiError) {
    res.status(err.status).json({
      codigo: err.codigo,
      mensaje: err.message,
      ...(err.detalle !== undefined ? { detalle: err.detalle } : {}),
    });
    return;
  }

  console.error(err);
  res.status(500).json({ codigo: 'ERROR_INTERNO', mensaje: 'Ocurrió un error inesperado' });
};
