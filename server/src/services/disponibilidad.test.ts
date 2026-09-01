import { describe, expect, it } from 'vitest';
import { DateTime } from 'luxon';
import { calcularDisponibilidad, Config, Profesional, Servicio, TurnoActivo } from './disponibilidad';
import { IHorarioDia } from '../models/subschemas/horario.subschema';

const ZONE = 'America/Argentina/Buenos_Aires';

function horario(dias: number[], desde = '09:00', hasta = '18:00'): IHorarioDia[] {
  return dias.map((dia) => ({ dia, bloques: [{ desde, hasta }] }));
}

function local(obj: { year: number; month: number; day: number; hour?: number; minute?: number }): Date {
  return DateTime.fromObject(obj, { zone: ZONE }).toJSDate();
}

function horasLocales(slots: { inicio: string }[]): string[] {
  return slots.map((s) => DateTime.fromISO(s.inicio, { zone: ZONE }).toFormat('HH:mm'));
}

function baseConfig(overrides: Partial<Config> = {}): Config {
  return {
    timezone: ZONE,
    horarios: horario([0, 1, 2, 3, 4, 5, 6]),
    pasoGrillaMin: 30,
    antelacionMinimaHoras: 0,
    ventanaMaximaDias: 0,
    ...overrides,
  };
}

describe('calcularDisponibilidad', () => {
  it('profesional y servicio en días que no se cruzan ⇒ sin slots', () => {
    const ahora = local({ year: 2026, month: 8, day: 3, hour: 6 }); // lunes
    const config = baseConfig({ ventanaMaximaDias: 14 });
    const profesional: Profesional = { horarios: horario([2, 4]) }; // martes y jueves
    const servicio: Servicio = { duracionMin: 60, bufferPostMin: 0, horarios: horario([3, 5]) }; // miércoles y viernes

    const slots = calcularDisponibilidad({ ahora, config, profesional, servicio, excepciones: [], turnos: [] });

    expect(slots).toEqual([]);
  });

  it('turno 09:00–10:45 (dur 90 + buffer 15) ⇒ próximo slot 11:00, no 10:45', () => {
    const fecha = { year: 2026, month: 8, day: 4 };
    const ahora = local({ ...fecha, hour: 0 });
    const config = baseConfig();
    const profesional: Profesional = { horarios: horario([diaLocal(ahora)]) };
    const servicio: Servicio = { duracionMin: 90, bufferPostMin: 15, horarios: null };
    const turno: TurnoActivo = {
      inicio: local({ ...fecha, hour: 9, minute: 0 }),
      finBloqueo: local({ ...fecha, hour: 10, minute: 45 }),
    };

    const slots = calcularDisponibilidad({ ahora, config, profesional, servicio, excepciones: [], turnos: [turno] });
    const horas = horasLocales(slots);

    expect(horas).not.toContain('10:45');
    expect(horas).not.toContain('10:30');
    expect(horas).not.toContain('10:00');
    expect(horas).not.toContain('09:30');
    expect(horas).not.toContain('09:00');
    expect(horas[0]).toBe('11:00');
  });

  it('bloque hasta 20:00, servicio 90 ⇒ último slot 18:30; 19:00 rechazado (el buffer derrama sin bloquear)', () => {
    const fecha = { year: 2026, month: 8, day: 4 };
    const ahora = local({ ...fecha, hour: 0 });
    const config = baseConfig({ horarios: horario([diaLocal(ahora)], '09:00', '20:00') });
    const profesional: Profesional = { horarios: horario([diaLocal(ahora)], '09:00', '20:00') };
    const servicio: Servicio = { duracionMin: 90, bufferPostMin: 15, horarios: null };

    const slots = calcularDisponibilidad({ ahora, config, profesional, servicio, excepciones: [], turnos: [] });
    const horas = horasLocales(slots);

    expect(horas).not.toContain('19:00');
    expect(horas[horas.length - 1]).toBe('18:30');
    const ultimo = slots[slots.length - 1];
    expect(DateTime.fromISO(ultimo.fin, { zone: ZONE }).toFormat('HH:mm')).toBe('20:00');
  });

  it('antelacionMinimaHoras recorta los slots tempranos del primer día; ventanaMaximaDias+1 no aparece', () => {
    const fecha = { year: 2026, month: 8, day: 3 };
    const ahora = local({ ...fecha, hour: 10 }); // antelación de 3hs ⇒ recién a partir de las 13:00
    const config = baseConfig({
      horarios: horario([0, 1, 2, 3, 4, 5, 6], '08:00', '22:00'),
      pasoGrillaMin: 60,
      antelacionMinimaHoras: 3,
      ventanaMaximaDias: 5,
    });
    const profesional: Profesional = { horarios: horario([0, 1, 2, 3, 4, 5, 6], '08:00', '22:00') };
    const servicio: Servicio = { duracionMin: 30, bufferPostMin: 0, horarios: null };

    const slots = calcularDisponibilidad({ ahora, config, profesional, servicio, excepciones: [], turnos: [] });

    const hoyLocal = DateTime.fromJSDate(ahora, { zone: ZONE }).startOf('day');
    const horasDia0 = horasLocales(
      slots.filter((s) => DateTime.fromISO(s.inicio, { zone: ZONE }).hasSame(hoyLocal, 'day'))
    );
    expect(horasDia0).not.toContain('08:00');
    expect(horasDia0).not.toContain('12:00');
    expect(horasDia0[0]).toBe('13:00');

    const offsets = slots.map((s) =>
      Math.round(DateTime.fromISO(s.inicio, { zone: ZONE }).startOf('day').diff(hoyLocal, 'days').days)
    );
    expect(Math.max(...offsets)).toBe(5); // ventanaMaximaDias
    expect(offsets).not.toContain(6); // ventanaMaximaDias + 1
  });

  it('turno fuera de horario igual bloquea su rango (se resta contra todos los turnos activos)', () => {
    const fecha = { year: 2026, month: 8, day: 4 };
    const ahora = local({ ...fecha, hour: 0 });
    const config = baseConfig();
    const profesional: Profesional = { horarios: horario([diaLocal(ahora)]) };
    const servicio: Servicio = { duracionMin: 30, bufferPostMin: 0, horarios: null };
    // Arranca antes de que abra el centro (08:30 < 09:00): un turno cargado por el admin fuera de política.
    const turno: TurnoActivo = {
      inicio: local({ ...fecha, hour: 8, minute: 30 }),
      finBloqueo: local({ ...fecha, hour: 9, minute: 20 }),
    };

    const slots = calcularDisponibilidad({ ahora, config, profesional, servicio, excepciones: [], turnos: [turno] });
    const horas = horasLocales(slots);

    expect(horas).not.toContain('09:00');
    expect(horas[0]).toBe('09:30');
  });
});

function diaLocal(fecha: Date): number {
  const weekday = DateTime.fromJSDate(fecha, { zone: ZONE }).weekday;
  return weekday === 7 ? 0 : weekday;
}
