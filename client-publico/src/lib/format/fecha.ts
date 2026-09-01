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

/** Ventana [ahora, ahora+7 días) en ISO UTC con sufijo Z — "el tramo
 * visible (semana)", frontend.md §4.11, no los ~60 días de la ventana
 * completa (el server clampea igual, pero no tiene sentido pedirlos). */
export function rangoSemanaUtc(): { desde: string; hasta: string } {
  const ahora = DateTime.utc();
  return {
    desde: ahora.toUTC().toISO()!,
    hasta: ahora.plus({ days: 7 }).toUTC().toISO()!,
  };
}
