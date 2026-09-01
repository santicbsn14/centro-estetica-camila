import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { ApiError } from '../utils/apiError';

// modelo-datos-turnos.md §10: los móviles argentinos necesitan el 9 después del
// +54 en el E.164, y es clásico que la normalización se lo coma. Argentina no
// distingue fijo/móvil en el número nacional de 10 dígitos — libphonenumber-js
// no puede adivinarlo solo. Como en este dominio `telefono` es SIEMPRE un
// contacto de WhatsApp, se fuerza el 9 en vez de confiar en su clasificación.

const NACIONAL_CON_NUEVE = /^9\d{10}$/;
const NACIONAL_SIN_NUEVE = /^\d{10}$/;

export function normalizarTelefonoAR(crudo: string): string {
  const directo = intentarNormalizar(crudo);
  if (directo) return directo;

  // Convención doméstica: '15' como marcador de móvil, pegado justo después
  // del código de área (ej. '011 15-1234-5678'). libphonenumber-js no lo
  // resuelve solo. Se prueba sacándolo; si el resultado no da justo un
  // nacional de 10 dígitos no se fuerza nada más — no se adivina un código de
  // área que el input no trae (eso sí sería inventar datos del cliente).
  const soloDigitos = crudo.replace(/\D/g, '').replace(/^0/, '');
  const indiceQuince = soloDigitos.indexOf('15');
  if (indiceQuince >= 0) {
    const sinMarcador = soloDigitos.slice(0, indiceQuince) + soloDigitos.slice(indiceQuince + 2);
    const conMarcadorSacado = intentarNormalizar(sinMarcador);
    if (conMarcadorSacado) return conMarcadorSacado;
  }

  throw new ApiError(400, 'TELEFONO_INVALIDO', 'El teléfono no es un número argentino válido');
}

function intentarNormalizar(valor: string): string | null {
  const parsed = parsePhoneNumberFromString(valor, 'AR');
  if (!parsed) return null;

  const nacional = parsed.nationalNumber;
  if (parsed.isValid() && NACIONAL_CON_NUEVE.test(nacional)) {
    return `+54${nacional}`;
  }
  if (NACIONAL_SIN_NUEVE.test(nacional)) {
    return `+549${nacional}`;
  }
  return null;
}
