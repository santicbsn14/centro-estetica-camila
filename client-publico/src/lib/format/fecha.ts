import { DateTime } from 'luxon';
import type { Slot } from '../../routes/reserva/types';

// Mismo criterio transversal que el panel (CLAUDE.md / frontend.md §2): día
// de la semana SIEMPRE en America/Argentina/Buenos_Aires con Luxon, nunca
// Date.getDay() sobre UTC crudo. Constante propia (no compartida con
// client/, cada app arma la suya — mismo valor).
export const TIMEZONE_CENTRO = 'America/Argentina/Buenos_Aires';

export function aLocal(iso: string): DateTime {
  return DateTime.fromISO(iso, { zone: 'utc' }).setZone(TIMEZONE_CENTRO);
}

/** Clave de agrupado — yyyy-MM-dd en LOCAL, no el string ISO UTC crudo. */
export function claveDiaLocal(iso: string): string {
  return aLocal(iso).toFormat('yyyy-MM-dd');
}

export function horaLocal(iso: string): string {
  return aLocal(iso).toFormat('HH:mm');
}

/** "Hoy · jueves 13 ago" / "Mañana · viernes 14 ago" / "sábado 15 ago" —
 * mismo formato que mockups/reserva-camila.html. El CSS del mockup
 * (.daylabel{text-transform:capitalize}) se clona tal cual y capitaliza la
 * primera letra de cada palabra en pantalla, así que acá no hace falta
 * mayusculizar nada a mano. */
export function etiquetaDia(iso: string): string {
  const dt = aLocal(iso);
  const hoy = DateTime.now().setZone(TIMEZONE_CENTRO).startOf('day');
  const diasDeDiferencia = Math.round(dt.startOf('day').diff(hoy, 'days').days);
  const fechaCorta = dt.setLocale('es').toFormat('cccc d LLL');

  if (diasDeDiferencia === 0) return `Hoy · ${fechaCorta}`;
  if (diasDeDiferencia === 1) return `Mañana · ${fechaCorta}`;
  return fechaCorta;
}

export interface GrupoDia {
  clave: string;
  etiqueta: string;
  slots: Slot[];
}

/** Agrupa una lista plana de slots (ISO UTC) por día LOCAL, orden asc por
 * día y por hora dentro del día (frontend.md §4.11: "lista plana; el front
 * agrupa por día local con Luxon"). */
export function agruparPorDiaLocal(slots: Slot[]): GrupoDia[] {
  const porDia = new Map<string, Slot[]>();
  for (const slot of slots) {
    const clave = claveDiaLocal(slot.inicio);
    const grupo = porDia.get(clave);
    if (grupo) grupo.push(slot);
    else porDia.set(clave, [slot]);
  }

  return [...porDia.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([clave, slotsDelDia]) => ({
      clave,
      etiqueta: etiquetaDia(slotsDelDia[0].inicio),
      slots: [...slotsDelDia].sort((a, b) => a.inicio.localeCompare(b.inicio)),
    }));
}

/** Días que cubre el calendario: hoy … hoy+30, fijos (frontend.md 2026-09-21,
 * "Elegir fecha"), no "mismo día del mes siguiente". Un único GET pide todo
 * el rango al entrar al paso 2; el default (7 días) y el calendario leen del
 * mismo array. */
export const DIAS_CALENDARIO = 30;

/** Días de la vista default de la grilla, contados desde hoy inclusive. */
export const DIAS_VISTA_DEFAULT = 7;

/** Hoy a las 00:00 en zona Argentina — nunca la zona del dispositivo. */
export function hoyLocal(): DateTime {
  return DateTime.now().setZone(TIMEZONE_CENTRO).startOf('day');
}

/** yyyy-MM-dd (clave de `claveDiaLocal`) → medianoche local de ese día. */
export function diaDeClave(clave: string): DateTime {
  return DateTime.fromFormat(clave, 'yyyy-MM-dd', { zone: TIMEZONE_CENTRO });
}

/** Ventana [ahora, fin del día hoy+dias] en ISO UTC con sufijo Z. El `hasta`
 * es exclusivo: arranca el día siguiente al último, así el último día entra
 * completo (mismo límite que usa el server para clampear por
 * ventanaMaximaDias). */
export function rangoDisponibilidadUtc(dias: number): { desde: string; hasta: string } {
  return {
    desde: DateTime.utc().toISO()!,
    hasta: hoyLocal()
      .plus({ days: dias + 1 })
      .toUTC()
      .toISO()!,
  };
}

/** Clave del último día de la vista default (hoy + 6). Comparable como string. */
export function claveUltimoDiaVistaDefault(): string {
  return hoyLocal()
    .plus({ days: DIAS_VISTA_DEFAULT - 1 })
    .toFormat('yyyy-MM-dd');
}

/** Días (yyyy-MM-dd local) que tienen al menos un slot. */
export function diasConSlots(slots: Slot[]): Set<string> {
  return new Set(slots.map((s) => claveDiaLocal(s.inicio)));
}

/** "lunes 21 de septiembre de 2026" — para aria-label de cada día. */
export function fechaCompleta(clave: string): string {
  return diaDeClave(clave).setLocale('es').toFormat("cccc d 'de' LLLL 'de' yyyy");
}

/** "lunes 21 sep" — mismo formato corto que las etiquetas de día de la grilla. */
export function fechaCorta(clave: string): string {
  return diaDeClave(clave).setLocale('es').toFormat('cccc d LLL');
}
