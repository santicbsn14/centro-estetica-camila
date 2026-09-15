// Agrupado del catálogo por categoría (paso 1, acordeón — frontend.md §4.11
// punto 3a). Mapeo hardcodeado nombre→categoría, SOLO para presentación en
// client-publico: no existe "categoría" en el modelo ni en @shared, y no se
// agrega ahí a propósito (decisión de esta tarea, no reabre el modelo).
//
// Match case-insensitive (.toLowerCase()) para no romper por una mayúscula
// editada desde el panel. Cualquier servicio activo no listado acá cae en
// "Otros" (CATEGORIA_FALLBACK), al final.
export const CATEGORIAS_SERVICIO = [
  'UÑAS',
  'CEJAS',
  'PESTAÑAS',
  'TRATAMIENTOS FACIALES',
  'MASAJES',
] as const;

export type CategoriaServicio = (typeof CATEGORIAS_SERVICIO)[number];

export const CATEGORIA_FALLBACK = 'Otros';

const NOMBRE_A_CATEGORIA: Record<string, CategoriaServicio> = {
  'esmaltado semipermanente': 'UÑAS',
  'kapping gel': 'UÑAS',
  'extensión soft gel': 'UÑAS',
  'semis en manos y pies': 'UÑAS',
  'soft gel en manos y semis en pies': 'UÑAS',
  retirados: 'UÑAS',

  'diseño y perfilado de cejas': 'CEJAS',
  'laminado de cejas': 'CEJAS',

  'lifting tradicional': 'PESTAÑAS',
  'lifting técnica coreana': 'PESTAÑAS',

  'limpieza profunda + espátula ultrasónica': 'TRATAMIENTOS FACIALES',
  'limpieza profunda + peeling químico + masaje anti age': 'TRATAMIENTOS FACIALES',
  'limpieza profunda + electroporador + espátula ultrasónica': 'TRATAMIENTOS FACIALES',
  'limpieza profunda + máscara led y máscara gold': 'TRATAMIENTOS FACIALES',

  'reflexología podal': 'MASAJES',
  'reflexología podal opción 2': 'MASAJES',
};

export function categoriaDe(nombreServicio: string): CategoriaServicio | typeof CATEGORIA_FALLBACK {
  return NOMBRE_A_CATEGORIA[nombreServicio.trim().toLowerCase()] ?? CATEGORIA_FALLBACK;
}
