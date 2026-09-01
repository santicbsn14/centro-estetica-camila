import { describe, expect, it } from 'vitest';
import { horariosSchema } from './common.schema';

// modelo-datos-turnos.md §10, "Validación de horarios" — bordes cubiertos en aislado.

function bloque(desde: string, hasta: string) {
  return { desde, hasta };
}

describe('horariosSchema', () => {
  it('null con nullable:true ⇒ ok; con nullable:false ⇒ error', () => {
    expect(horariosSchema({ nullable: true }).safeParse(null).success).toBe(true);
    expect(horariosSchema({ nullable: false }).safeParse(null).success).toBe(false);
  });

  it('array top [] ⇒ error en ambos modos', () => {
    expect(horariosSchema({ nullable: true }).safeParse([]).success).toBe(false);
    expect(horariosSchema({ nullable: false }).safeParse([]).success).toBe(false);
  });

  it('día con bloques:[] ⇒ error', () => {
    const resultado = horariosSchema({ nullable: false }).safeParse([{ dia: 1, bloques: [] }]);
    expect(resultado.success).toBe(false);
  });

  it('dia duplicado ⇒ error', () => {
    const resultado = horariosSchema({ nullable: false }).safeParse([
      { dia: 1, bloques: [bloque('09:00', '12:00')] },
      { dia: 1, bloques: [bloque('14:00', '18:00')] },
    ]);
    expect(resultado.success).toBe(false);
  });

  it('hasta <= desde ⇒ error', () => {
    const igual = horariosSchema({ nullable: false }).safeParse([{ dia: 1, bloques: [bloque('09:00', '09:00')] }]);
    const invertido = horariosSchema({ nullable: false }).safeParse([{ dia: 1, bloques: [bloque('12:00', '09:00')] }]);
    expect(igual.success).toBe(false);
    expect(invertido.success).toBe(false);
  });

  it('bloques solapados en el mismo día ⇒ error', () => {
    const resultado = horariosSchema({ nullable: false }).safeParse([
      { dia: 1, bloques: [bloque('09:00', '13:00'), bloque('12:00', '15:00')] },
    ]);
    expect(resultado.success).toBe(false);
  });

  it('bloques que sólo se tocan (fin === inicio del siguiente) NO solapan', () => {
    const resultado = horariosSchema({ nullable: false }).safeParse([
      { dia: 1, bloques: [bloque('09:00', '12:00'), bloque('12:00', '18:00')] },
    ]);
    expect(resultado.success).toBe(true);
  });

  it('input desordenado ⇒ ok, se persiste ordenado (días asc, bloques asc)', () => {
    const resultado = horariosSchema({ nullable: false }).safeParse([
      { dia: 4, bloques: [bloque('14:00', '18:00'), bloque('09:00', '12:00')] },
      { dia: 1, bloques: [bloque('09:00', '12:00')] },
    ]);

    expect(resultado.success).toBe(true);
    if (!resultado.success) return;

    expect(resultado.data.map((d) => d.dia)).toEqual([1, 4]);
    expect(resultado.data[1].bloques.map((b) => b.desde)).toEqual(['09:00', '14:00']);
  });

  it('válido multi-día multi-bloque ⇒ ok, orden estable', () => {
    const resultado = horariosSchema({ nullable: false }).safeParse([
      { dia: 2, bloques: [bloque('09:00', '13:00'), bloque('14:00', '18:00')] },
      { dia: 0, bloques: [bloque('10:00', '13:00')] },
      { dia: 5, bloques: [bloque('09:00', '12:00')] },
    ]);

    expect(resultado.success).toBe(true);
    if (!resultado.success) return;

    expect(resultado.data.map((d) => d.dia)).toEqual([0, 2, 5]);
    expect(resultado.data[1].bloques.map((b) => `${b.desde}-${b.hasta}`)).toEqual(['09:00-13:00', '14:00-18:00']);
  });

  it('idempotente: correr el schema sobre su propio output no cambia nada', () => {
    const primero = horariosSchema({ nullable: false }).safeParse([
      { dia: 4, bloques: [bloque('14:00', '18:00'), bloque('09:00', '12:00')] },
      { dia: 1, bloques: [bloque('09:00', '12:00')] },
    ]);
    expect(primero.success).toBe(true);
    if (!primero.success) return;

    const segundo = horariosSchema({ nullable: false }).safeParse(primero.data);
    expect(segundo.success).toBe(true);
    if (!segundo.success) return;

    expect(segundo.data).toEqual(primero.data);
  });
});
