import { DateTime } from 'luxon';
import type { EstadoTurno } from '@shared/schemas/common.schema';
import { TIMEZONE_CENTRO } from '../../lib/format/fecha';
import type { TurnoPanelLista } from '../turnos/types';

// Agenda semanal (frontend.md §4.14). Todo en el huso del centro con Luxon —
// nunca sobre UTC crudo ni sobre el huso del browser.

// `rechazado` y `cancelado` no ocupan la silla: se ocultan en el cliente.
const OCULTOS = new Set<EstadoTurno>(['rechazado', 'cancelado']);
export const HORA_MIN = 8;
export const HORA_MAX = 20; // última fila

export interface Agenda {
  dias: DateTime[]; // columnas
  horas: number[]; // filas
  celdas: Map<string, TurnoPanelLista[]>; // key `${isoDate}|${hora}` (claveCelda)
}

export function claveCelda(dia: DateTime, hora: number): string {
  return `${dia.toISODate()}|${hora}`;
}

/**
 * Buckets por (día local, hora local de `inicio`). Un turno de 14:30 cae sólo
 * en la celda de las 14. Horas 08–20 fijas, expandidas si algún turno visible
 * cae afuera; lunes a sábado fijos, domingo sólo si hay algún turno visible
 * ese día. Preserva el orden de `turnos` dentro de cada celda (el server los
 * manda por `inicio` asc, §15.6 — no se reordena).
 *
 * `lunes` es un DateTime en el huso del centro con startOf('week') (ver
 * lunesDeSemana).
 */
export function construirAgenda(turnos: TurnoPanelLista[], lunes: DateTime): Agenda {
  const celdas = new Map<string, TurnoPanelLista[]>();
  let hMin = HORA_MIN;
  let hMax = HORA_MAX;
  let hayDomingo = false;

  for (const t of turnos) {
    if (OCULTOS.has(t.estado)) continue;
    const ini = DateTime.fromISO(t.inicio, { zone: 'utc' }).setZone(TIMEZONE_CENTRO);
    const key = claveCelda(ini, ini.hour);
    const lista = celdas.get(key);
    if (lista) lista.push(t);
    else celdas.set(key, [t]);
    hMin = Math.min(hMin, ini.hour);
    hMax = Math.max(hMax, ini.hour);
    if (ini.weekday === 7) hayDomingo = true;
  }

  return {
    dias: Array.from({ length: hayDomingo ? 7 : 6 }, (_, i) => lunes.plus({ days: i })),
    horas: Array.from({ length: hMax - hMin + 1 }, (_, i) => hMin + i),
    celdas,
  };
}

const RE_ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Lunes (00:00 local del centro) de la semana indicada por `?semana=` —
 * cualquier día de la semana sirve, se normaliza con startOf('week') (ISO:
 * arranca en lunes). Param ausente o inválido ⇒ semana actual.
 */
export function lunesDeSemana(param: string | null, ahora: DateTime = DateTime.now()): DateTime {
  const base =
    param && RE_ISO_DATE.test(param) ? DateTime.fromISO(param, { zone: TIMEZONE_CENTRO }) : null;
  const dia = base && base.isValid ? base : ahora.setZone(TIMEZONE_CENTRO);
  return dia.startOf('week');
}
