import { DateTime } from 'luxon';

// Fechas: siempre ISO UTC con Z por API, agrupadas/mostradas en hora local del
// centro (frontend.md §2, CLAUDE.md "reglas transversales"). Nunca
// Date.getDay()/Date.toLocaleString() del browser para el día de la semana —
// el visor del panel puede estar en cualquier huso; el negocio vive en AR.
export const TIMEZONE_CENTRO = 'America/Argentina/Buenos_Aires';

export function aLocal(isoUtc: string): DateTime {
  return DateTime.fromISO(isoUtc, { zone: 'utc' }).setZone(TIMEZONE_CENTRO).setLocale('es');
}

// Convierte una fecha de calendario elegida en un <input type="date"> (string
// 'yyyy-MM-dd', sin huso) al instante UTC correspondiente al inicio/fin de ESE
// día en el huso del centro — no en el huso del browser. Evita que un
// visor logueado desde otro huso pida "hoy" y reciba el día de otro lado.
export function inicioDiaLocalUtc(fechaISODate: string): string {
  return DateTime.fromISO(fechaISODate, { zone: TIMEZONE_CENTRO }).startOf('day').toUTC().toISO() as string;
}

export function finDiaLocalUtc(fechaISODate: string): string {
  return DateTime.fromISO(fechaISODate, { zone: TIMEZONE_CENTRO }).endOf('day').toUTC().toISO() as string;
}

// Combina una fecha de calendario ('yyyy-MM-dd') + una hora de reloj
// ('HH:mm', misma convención que horariosSchema) en el instante UTC
// correspondiente en el huso del centro — para el bloqueo parcial de
// excepciones (frontend.md §4.8: "OFF ⇒ día único con time desde/hasta").
// Mismo criterio que inicioDiaLocalUtc/finDiaLocalUtc: quien arma el instante
// es el front, en local, y lo manda como ISO UTC con Z, nunca offset.
export function fechaHoraLocalUtc(fechaISODate: string, horaHHmm: string): string {
  const [hora, minuto] = horaHHmm.split(':').map(Number);
  return DateTime.fromISO(fechaISODate, { zone: TIMEZONE_CENTRO })
    .set({ hour: hora, minute: minuto, second: 0, millisecond: 0 })
    .toUTC()
    .toISO() as string;
}

export function hoyLocalISODate(): string {
  return DateTime.now().setZone(TIMEZONE_CENTRO).toISODate() as string;
}

export function sumarDiasISODate(fechaISODate: string, dias: number): string {
  return (DateTime.fromISO(fechaISODate, { zone: TIMEZONE_CENTRO }).plus({ days: dias }).toISODate() as string) ?? fechaISODate;
}

export function formatHora(isoUtc: string): string {
  return aLocal(isoUtc).toFormat('HH:mm');
}

function capitalizar(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Etiqueta de grupo de día — mockup turnos-camila.html: "Hoy · jueves 13 ago",
// "Mañana · viernes 14 ago". Extendido acá con "Ayer" (el listado sí muestra
// pasado, §15.6/§4.4) y una forma larga para el resto (con año si no es el
// año en curso, para no confundir históricos de otra temporada).
export function etiquetaDia(dt: DateTime): string {
  const hoy = DateTime.now().setZone(TIMEZONE_CENTRO).startOf('day');
  const dia = dt.startOf('day');
  const diff = dia.diff(hoy, 'days').days;

  const fechaCorta = dia.toFormat("cccc d 'de' LLL", { locale: 'es' });
  const fechaConAnio = dia.toFormat("cccc d 'de' LLL yyyy", { locale: 'es' });
  const esOtroAnio = dia.year !== hoy.year;

  if (diff === 0) return `Hoy · ${capitalizar(fechaCorta)}`;
  if (diff === 1) return `Mañana · ${capitalizar(fechaCorta)}`;
  if (diff === -1) return `Ayer · ${capitalizar(fechaCorta)}`;
  return capitalizar(esOtroAnio ? fechaConAnio : fechaCorta);
}

// Clave de agrupado — día calendario local, no el string ISO UTC crudo (dos
// turnos del mismo día local pueden caer en días UTC distintos cerca de
// medianoche, ver CLAUDE.md "reglas transversales").
export function claveDiaLocal(isoUtc: string): string {
  return aLocal(isoUtc).toISODate() as string;
}

/**
 * Agrupa una lista YA ordenada por `inicio` asc (garantía del server, §15.6)
 * en buckets por día local, preservando el orden de aparición de los días
 * (no hace falta volver a ordenar: el primer turno de cada día determina la
 * posición del grupo).
 */
export function agruparPorDiaLocal<T>(items: T[], getInicioUtc: (item: T) => string): { clave: string; etiqueta: string; items: T[] }[] {
  const grupos = new Map<string, { clave: string; etiqueta: string; items: T[] }>();

  for (const item of items) {
    const iso = getInicioUtc(item);
    const clave = claveDiaLocal(iso);
    let grupo = grupos.get(clave);
    if (!grupo) {
      grupo = { clave, etiqueta: etiquetaDia(aLocal(iso)), items: [] };
      grupos.set(clave, grupo);
    }
    grupo.items.push(item);
  }

  return [...grupos.values()];
}
