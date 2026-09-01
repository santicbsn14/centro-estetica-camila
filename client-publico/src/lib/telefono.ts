import { parsePhoneNumberFromString } from 'libphonenumber-js';

// El form fija el prefijo "+54 9" (frontend.md §4.11 — el mockup lo muestra
// como .telrow .pre no editable) y la clienta sólo tipea el resto (área +
// número, ej. "341 555-1234"). Acá se arma el E164 completo y se valida con
// libphonenumber-js ANTES de habilitar el submit (§2/§4.11) — no delegamos
// la validación al server, que además exige el 9 explícito y no reconstruye
// área faltante (server/src/services/telefono.ts).
//
// A diferencia de normalizarTelefonoAR (server), acá NO hace falta resolver
// el marcador doméstico "15" ni el caso "sin 9": la UI ya fuerza esos dos
// prefijos (+54 9) por construcción, así que sólo queda validar que el resto
// tipeado sea un número nacional argentino válido (libphonenumber-js cubre
// las áreas de 2 a 4 dígitos sin que el front tenga que conocerlas).
export function armarTelefonoE164(restoCrudo: string): string | null {
  const digitos = restoCrudo.replace(/\D/g, '');
  if (!digitos) return null;

  const candidato = `+549${digitos}`;
  const parsed = parsePhoneNumberFromString(candidato);
  if (!parsed || !parsed.isValid() || parsed.country !== 'AR') return null;

  return parsed.number; // E164 normalizado, ej. "+5493415551234"
}
