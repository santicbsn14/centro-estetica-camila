import { DateTime } from 'luxon';
import { IHorarioDia } from '../models/subschemas/horario.subschema';
import { Intervalo, interseccion, resta, cabeEn, pisaAlguno } from '@shared/utils/intervalos';

// Algoritmo de disponibilidad — modelo-datos-turnos.md §5 y §5.1.
// Función pura: excepciones y turnos llegan ya filtrados por la capa de datos.

export interface Config {
  timezone: string;
  horarios: IHorarioDia[];
  pasoGrillaMin: number;
  antelacionMinimaHoras: number;
  ventanaMaximaDias: number;
}

export interface Profesional {
  horarios: IHorarioDia[];
}

export interface Servicio {
  duracionMin: number;
  bufferPostMin: number;
  horarios: IHorarioDia[] | null; // null = hereda de la profesional
}

export interface Excepcion {
  desde: Date;
  hasta: Date;
}

export interface TurnoActivo {
  inicio: Date;
  finBloqueo: Date;
}

export interface Slot {
  inicio: string; // ISO UTC, sólo el servicio (sin buffer)
  fin: string;
}

interface CalcularDisponibilidadParams {
  ahora: Date;
  config: Config;
  profesional: Profesional;
  servicio: Servicio;
  excepciones: Excepcion[];
  turnos: TurnoActivo[];
}

const MIN_EN_MS = 60_000;
const MIN_EN_DIA = 1440;

/** Día de la semana en `timezone`, convención 0=domingo (nunca Date.getDay() sobre UTC). */
function diaDeLaSemana(fechaLocal: DateTime): number {
  return fechaLocal.weekday === 7 ? 0 : fechaLocal.weekday;
}

/** Convierte un bloque 'HH:mm' local a epoch ms UTC para el día dado (medianoche local + offset). */
function bloqueAIntervalo(fechaLocal: DateTime, desde: string, hasta: string): Intervalo {
  const [hIni, mIni] = desde.split(':').map(Number);
  const [hFin, mFin] = hasta.split(':').map(Number);
  return {
    inicio: fechaLocal.set({ hour: hIni, minute: mIni, second: 0, millisecond: 0 }).toMillis(),
    fin: fechaLocal.set({ hour: hFin, minute: mFin, second: 0, millisecond: 0 }).toMillis(),
  };
}

function bloquesDelDia(horarios: IHorarioDia[], dow: number, fechaLocal: DateTime): Intervalo[] {
  const dia = horarios.find((h) => h.dia === dow);
  if (!dia) return [];
  return dia.bloques.map((b) => bloqueAIntervalo(fechaLocal, b.desde, b.hasta));
}

/** ¿el instante cae en un punto de grilla anclado a medianoche local? Misma regla que la disponibilidad. */
export function estaEnGrilla(inicio: Date, timezone: string, pasoGrillaMin: number): boolean {
  const local = DateTime.fromJSDate(inicio, { zone: timezone });
  const msDesdeMedianoche = local.toMillis() - local.startOf('day').toMillis();
  return msDesdeMedianoche % (pasoGrillaMin * MIN_EN_MS) === 0;
}

export function calcularDisponibilidad(p: CalcularDisponibilidadParams): Slot[] {
  const { ahora, config, profesional, servicio, excepciones, turnos } = p;

  const excepcionesIntervalos: Intervalo[] = excepciones.map((e) => ({
    inicio: e.desde.getTime(),
    fin: e.hasta.getTime(),
  }));
  const turnosIntervalos: Intervalo[] = turnos.map((t) => ({
    inicio: t.inicio.getTime(),
    fin: t.finBloqueo.getTime(),
  }));

  const minInicio = ahora.getTime() + config.antelacionMinimaHoras * 3600_000;
  const hoyLocal = DateTime.fromJSDate(ahora, { zone: config.timezone }).startOf('day');

  const slots: Slot[] = [];

  for (let offset = 0; offset <= config.ventanaMaximaDias; offset++) {
    const fechaLocal = hoyLocal.plus({ days: offset });
    const dow = diaDeLaSemana(fechaLocal);

    const centroBloques = bloquesDelDia(config.horarios, dow, fechaLocal);
    const profesionalBloques = bloquesDelDia(profesional.horarios, dow, fechaLocal);

    let ventanas = interseccion(centroBloques, profesionalBloques);

    if (servicio.horarios !== null) {
      const servicioDia = servicio.horarios.find((h) => h.dia === dow);
      if (!servicioDia) {
        // servicio no-null sin bloque ese día ⇒ intersección vacía ⇒ 0 slots.
        continue;
      }
      const servicioBloques = servicioDia.bloques.map((b) => bloqueAIntervalo(fechaLocal, b.desde, b.hasta));
      ventanas = interseccion(ventanas, servicioBloques);
    }

    const ventanasLibres = resta(ventanas, excepcionesIntervalos);
    if (ventanasLibres.length === 0) continue;

    for (let minuto = 0; minuto < MIN_EN_DIA; minuto += config.pasoGrillaMin) {
      const inicioCandidato = fechaLocal.plus({ minutes: minuto }).toMillis();
      if (inicioCandidato < minInicio) continue;

      const finServicio = inicioCandidato + servicio.duracionMin * MIN_EN_MS;
      const finOcupacion = inicioCandidato + (servicio.duracionMin + servicio.bufferPostMin) * MIN_EN_MS;

      const servicioInterval: Intervalo = { inicio: inicioCandidato, fin: finServicio };
      const ocupacionInterval: Intervalo = { inicio: inicioCandidato, fin: finOcupacion };

      if (!cabeEn(servicioInterval, ventanasLibres)) continue;
      if (pisaAlguno(ocupacionInterval, turnosIntervalos)) continue;

      slots.push({
        inicio: new Date(servicioInterval.inicio).toISOString(),
        fin: new Date(servicioInterval.fin).toISOString(),
      });
    }
  }

  return slots;
}
