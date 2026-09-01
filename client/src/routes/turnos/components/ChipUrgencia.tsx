import { DateTime } from 'luxon';

// Cola de acción (frontend.md §4.4): pendientes muestran "vence en Xh",
// derivado de `expiraEn` — el vencimiento en sí lo decide el worker
// (modelo-datos-turnos.md §7), esto sólo lo muestra. Umbral "hot" = <3h,
// DECISIÓN DE UI, no del backend (§4.4 lo aclara explícitamente).
const UMBRAL_HOT_HORAS = 3;

function formatearRestante(ms: number): string {
  if (ms <= 0) return 'vencido';
  const minutos = Math.round(ms / 60_000);
  if (minutos < 60) return `vence en ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  if (horas < 24) return resto > 0 ? `vence en ${horas}h ${resto}min` : `vence en ${horas}h`;
  const dias = Math.floor(horas / 24);
  return `vence en ${dias}d`;
}

export interface ChipUrgenciaProps {
  expiraEn: string; // ISO UTC — sólo se renderiza este chip si expiraEn no es null (turno pendiente)
  ahora?: DateTime; // inyectable para tests; default Date.now()
}

export function ChipUrgencia({ expiraEn, ahora }: ChipUrgenciaProps) {
  const referencia = ahora ?? DateTime.now();
  const ms = DateTime.fromISO(expiraEn, { zone: 'utc' }).toMillis() - referencia.toMillis();
  const hot = ms <= UMBRAL_HOT_HORAS * 3600_000;

  return <span className={`chip-urgencia${hot ? ' chip-urgencia--hot' : ''}`}>{formatearRestante(ms)}</span>;
}
