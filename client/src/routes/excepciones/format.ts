import { aLocal } from '../../lib/format/fecha';

// Formato de fila (frontend.md §4.8: "rango de fechas (local, Luxon)"). Sin
// campo `todoElDia` persistido (§15.10 — "el panel arma 00:00–23:59 y lo
// manda como dos ISO UTC", el server no lo guarda aparte): acá se INFIERE si
// el rango representa "todo el día" mirando la hora local de los dos
// extremos, sólo para decidir cómo mostrarlo — no cambia qué se envía al
// guardar (eso lo decide el toggle del drawer, no esta inferencia).
function esInicioDeDia(hora: number, minuto: number): boolean {
  return hora === 0 && minuto === 0;
}

function esFinDeDia(hora: number, minuto: number): boolean {
  return hora === 23 && minuto === 59;
}

export function formatearRangoExcepcion(desdeIso: string, hastaIso: string): string {
  const desde = aLocal(desdeIso);
  const hasta = aLocal(hastaIso);
  const mismoDia = desde.hasSame(hasta, 'day');
  const todoElDia = esInicioDeDia(desde.hour, desde.minute) && esFinDeDia(hasta.hour, hasta.minute);

  // Bloqueo parcial: un solo día, con horario (§4.8 "OFF ⇒ día único con
  // time desde/hasta").
  if (mismoDia && !todoElDia) {
    return `${desde.toFormat("d LLL yyyy", { locale: 'es' })} · ${desde.toFormat('HH:mm')}–${hasta.toFormat('HH:mm')}`;
  }

  if (mismoDia) {
    return desde.toFormat("d LLL yyyy", { locale: 'es' });
  }

  // Multi-día, siempre todo-el-día por contrato del drawer (§4.8) — se
  // muestra sin horario. Año una sola vez si coincide en ambos extremos.
  const mismoAnio = desde.year === hasta.year;
  const inicio = desde.toFormat(mismoAnio ? 'd LLL' : "d LLL yyyy", { locale: 'es' });
  const fin = hasta.toFormat("d LLL yyyy", { locale: 'es' });
  return `${inicio} – ${fin}`;
}
