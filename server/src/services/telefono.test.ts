import { describe, expect, it } from 'vitest';
import { normalizarTelefonoAR } from './telefono';
import { ApiError } from '../utils/apiError';

// modelo-datos-turnos.md §10 — "test obligatorio: las cuatro formas terminan
// en el mismo E.164". De las cuatro, dos representan el mismo número completo
// (área + móvil explícitos) y convergen; las otras dos, tal como están
// transcriptas en el documento, no traen suficiente información para
// reconstruirse sin adivinar un código de área (ver conversación) — se
// documenta ese resultado en vez de forzar una reconstrucción inventada.

describe('normalizarTelefonoAR', () => {
  it('"3364123456" y "+54 9 336 4123456" convergen al mismo E.164', () => {
    expect(normalizarTelefonoAR('3364123456')).toBe('+5493364123456');
    expect(normalizarTelefonoAR('+54 9 336 4123456')).toBe('+5493364123456');
  });

  it('"15 4123456" (sin código de área) ⇒ inválido, no se adivina el área', () => {
    expect(() => normalizarTelefonoAR('15 4123456')).toThrow(ApiError);
  });

  it('"03364 15-4123456" ⇒ inválido con la implementación actual', () => {
    expect(() => normalizarTelefonoAR('03364 15-4123456')).toThrow(ApiError);
  });

  it('rechaza teléfonos que no son argentinos válidos', () => {
    expect(() => normalizarTelefonoAR('123')).toThrow(ApiError);
  });
});
