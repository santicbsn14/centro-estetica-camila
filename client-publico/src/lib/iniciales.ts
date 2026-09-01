// Avatar de iniciales — el endpoint público de profesionales sólo trae
// `_id`+`nombre` (frontend.md §4.11), no hay foto que mostrar.
export function iniciales(nombre: string): string {
  return nombre
    .split(' ')
    .filter(Boolean)
    .map((palabra) => palabra[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}
