// Agrupado del catálogo por categoría (paso 1 — frontend.md §4.11, "Catálogo
// público: agrupado por categoría real", 2026-11-16). La categoría es dato:
// llega en GET /api/servicios como `categoria: { id, nombre, orden } | null`
// (modelo-datos-turnos.md §15.7.1). El mapeo hardcodeado nombre→categoría que
// vivía acá se borró (lo copió el script de backfill del server).
//
// Servicio con `categoria: null` (sin categoría, o id huérfano) cae en "Otros",
// al final.
export const CATEGORIA_FALLBACK = 'Otros';

// Clave del bucket "Otros" en `categoriasAbiertas` (que guarda ids). No puede
// chocar con un ObjectId real (24 hex).
export const CATEGORIA_OTROS_ID = 'otros';

// Número de WhatsApp del salón (E164 sin "+"). Un solo lugar: lo usan el
// Footer (§4.13, mensaje propio sin cambios) y Experiencias (combos, §4.11
// 2026-11-19). Antes estaba hardcodeado en el href del Footer.
export const WHATSAPP_NUMERO = '543364328062';

// Link de "click to chat" con mensaje precargado. `texto` va crudo: acá se
// encodea con encodeURIComponent (no armar el query string a mano).
export function linkWhatsApp(texto: string): string {
  return `https://api.whatsapp.com/send?phone=${WHATSAPP_NUMERO}&text=${encodeURIComponent(texto)}`;
}
