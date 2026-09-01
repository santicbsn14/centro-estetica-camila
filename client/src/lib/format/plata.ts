// Plata: enteros en centavos desde el server; ÷100 SÓLO para mostrar
// (frontend.md §2/CLAUDE.md "reglas transversales"). Nunca un decimal viaja
// de vuelta al server desde acá — esta pantalla es sólo lectura de precio.
const formateadorARS = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0,
});

export function centavosAPesos(centavos: number): string {
  return formateadorARS.format(centavos / 100);
}
