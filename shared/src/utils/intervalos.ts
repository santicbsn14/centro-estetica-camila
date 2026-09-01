// Primitivas de intervalos [inicio, fin] en ms epoch UTC — neutrales: sin
// dependencias de Mongoose/Luxon/Express. Vive en shared porque más de un
// consumidor las necesita (disponibilidad en el server, el validador de
// horarios acá mismo) y ninguno debe depender del otro (modelo-datos-turnos.md §10).

export interface Intervalo {
  inicio: number;
  fin: number;
}

/** Ordena por inicio y fusiona los que se solapan o se tocan (fin === inicio del siguiente). */
export function normalizar(intervalos: Intervalo[]): Intervalo[] {
  const validos = intervalos.filter((i) => i.fin > i.inicio);
  const ordenados = [...validos].sort((a, b) => a.inicio - b.inicio);

  const resultado: Intervalo[] = [];
  for (const actual of ordenados) {
    const ultimo = resultado[resultado.length - 1];
    if (ultimo && actual.inicio <= ultimo.fin) {
      ultimo.fin = Math.max(ultimo.fin, actual.fin);
    } else {
      resultado.push({ ...actual });
    }
  }
  return resultado;
}

/** Intersección de dos conjuntos de intervalos. */
export function interseccion(a: Intervalo[], b: Intervalo[]): Intervalo[] {
  const an = normalizar(a);
  const bn = normalizar(b);
  const resultado: Intervalo[] = [];

  let i = 0;
  let j = 0;
  while (i < an.length && j < bn.length) {
    const inicio = Math.max(an[i].inicio, bn[j].inicio);
    const fin = Math.min(an[i].fin, bn[j].fin);
    if (inicio < fin) resultado.push({ inicio, fin });

    if (an[i].fin < bn[j].fin) i++;
    else j++;
  }
  return resultado;
}

/** a menos b: lo que queda de a después de recortar cada intervalo de b. */
export function resta(a: Intervalo[], b: Intervalo[]): Intervalo[] {
  const bn = normalizar(b);
  const resultado: Intervalo[] = [];

  for (const ai of normalizar(a)) {
    let piezas: Intervalo[] = [ai];
    for (const bi of bn) {
      const nuevas: Intervalo[] = [];
      for (const p of piezas) {
        if (bi.fin <= p.inicio || bi.inicio >= p.fin) {
          nuevas.push(p);
          continue;
        }
        if (bi.inicio > p.inicio) nuevas.push({ inicio: p.inicio, fin: bi.inicio });
        if (bi.fin < p.fin) nuevas.push({ inicio: bi.fin, fin: p.fin });
      }
      piezas = nuevas;
    }
    resultado.push(...piezas);
  }
  return resultado;
}

/** ¿[inicio,fin] está contenido por completo en alguno de los intervalos? */
export function cabeEn(intervalo: Intervalo, contenedores: Intervalo[]): boolean {
  return contenedores.some((c) => intervalo.inicio >= c.inicio && intervalo.fin <= c.fin);
}

/** ¿a y b se solapan? */
export function solapan(a: Intervalo, b: Intervalo): boolean {
  return a.inicio < b.fin && a.fin > b.inicio;
}

/** ¿[inicio,fin] solapa a alguno de los intervalos? */
export function pisaAlguno(intervalo: Intervalo, otros: Intervalo[]): boolean {
  return otros.some((o) => solapan(intervalo, o));
}
