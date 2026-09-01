// Shapes de los reads/write públicos consumidos por esta pantalla
// (frontend.md §4.11, modelo-datos-turnos.md §15.1/15.2/15.3). Espejados a
// mano porque el server no tiene schema Zod para sus RESPUESTAS (sólo para
// los inputs, que sí viven en @shared) — mismo criterio que
// client/src/routes/turnos/types.ts.

export interface ServicioPublico {
  _id: string;
  nombre: string;
  descripcion?: string;
  duracionMin: number;
  precio?: number; // ausente si !mostrarPrecio — nunca inventar un precio acá
}

export interface ProfesionalPublico {
  _id: string;
  nombre: string;
}

export interface Slot {
  inicio: string; // ISO UTC
  fin: string; // ISO UTC
}

// Respuesta de POST /api/turnos (201) — server/src/services/turnos.service.ts
// CrearTurnoResultado. NUNCA trae tokenGestion (§15.1: no viaja en la 201).
export interface TurnoCreado {
  codigo: string;
  estado: 'pendiente';
  inicio: string;
  fin: string;
  servicio: {
    nombre: string;
    duracionMin: number;
    precio: number;
  };
  fueraDeHorario: boolean;
}

// Datos tipeados en el paso 3 — se conservan en memoria si un 409 obliga a
// volver al paso 2 (frontend.md §4.11: "cortesía de UX, a discreción de
// impl", no vuelve a pedir que retipeen si eligen otro horario).
export interface DatosClienta {
  nombre: string;
  telefonoResto: string; // sin el prefijo fijo "+54 9", crudo tal como lo tipeó
  email: string;
}

// Estado de una carga async con mensaje de error explícito (nunca "fallar en
// silencio" — frontend.md §4.11, 429 de servicios/disponibilidad incluido).
// Preferido sobre un union T[]|'cargando'|'error' plano porque el mensaje de
// error varía (rate limit vs. genérico) y no hay dónde colgarlo en ese union.
export type Carga<T> = { tipo: 'cargando' } | { tipo: 'error'; mensaje: string } | { tipo: 'ok'; datos: T };

