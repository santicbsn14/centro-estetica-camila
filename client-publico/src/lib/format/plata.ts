// Enteros en centavos desde el server; ÷100 SÓLO para mostrar (CLAUDE.md,
// frontend.md §2). Mismo criterio que client/src/lib/format/plata.ts.
const formateador = new Intl.NumberFormat('es-AR');

export function centavosAPesos(centavos: number): string {
  return `$${formateador.format(centavos / 100)}`;
}
