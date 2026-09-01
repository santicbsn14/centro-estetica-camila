import { parsePhoneNumberFromString } from 'libphonenumber-js';

// Réplica de server/src/services/telefono.ts (normalizarTelefonoAR) — MISMO
// criterio (9 después de +54, convención doméstica '15'), pero sin ApiError:
// ese tipo vive en server/utils, fuera de lo que el bundle de client puede
// importar. Acá devuelve null si no se pudo normalizar y quien llama decide
// el mensaje — frontend.md §2: "normalizar con libphonenumber-js ANTES de
// enviar [...] el server no reconstruye área faltante" (si el usuario no
// tipeó el código de área, ni el front ni el server pueden inventarlo; la
// normalización del lado del front es para dar el error ANTES de pegarle a
// la red, no porque el server no vuelva a validar — sí lo hace, con esta
// misma función, ver usuarios.service.ts).
//
// Duplicado a propósito en vez de mover la lógica a `shared/`: es la primera
// vez que el front necesita normalizar un teléfono para ENVIAR (turnos sólo
// lo mostraba, ya normalizado, para el link `tel:`); si aparece un tercer
// consumidor server-side con esta misma necesidad vale la pena moverlo a
// `shared/src/utils`, no antes.

const NACIONAL_CON_NUEVE = /^9\d{10}$/;
const NACIONAL_SIN_NUEVE = /^\d{10}$/;

export function normalizarTelefonoAR(crudo: string): string | null {
  const directo = intentarNormalizar(crudo);
  if (directo) return directo;

  // Convención doméstica: '15' como marcador de móvil pegado al código de
  // área (ej. '011 15-1234-5678'). Se prueba sacándolo; si el resultado no
  // da justo un nacional de 10 dígitos no se fuerza nada más — no se adivina
  // un código de área que el input no trae.
  const soloDigitos = crudo.replace(/\D/g, '').replace(/^0/, '');
  const indiceQuince = soloDigitos.indexOf('15');
  if (indiceQuince >= 0) {
    const sinMarcador = soloDigitos.slice(0, indiceQuince) + soloDigitos.slice(indiceQuince + 2);
    const conMarcadorSacado = intentarNormalizar(sinMarcador);
    if (conMarcadorSacado) return conMarcadorSacado;
  }

  return null;
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
