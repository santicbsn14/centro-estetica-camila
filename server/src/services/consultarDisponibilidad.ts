import { DateTime } from 'luxon';
import { Types } from 'mongoose';
import { Configuracion, Usuario, Servicio, Excepcion, Turno } from '../models';
import { calcularDisponibilidad, Slot } from './disponibilidad';
import { ApiError } from '../utils/apiError';

// Wrapper fino sobre calcularDisponibilidad (§5.1) — modelo-datos-turnos.md §15.2.
// Read puro, sin transacción: nada de lo que se lee acá se escribe.

export interface ConsultarDisponibilidadParams {
  servicioId: string;
  profesionalId: string;
  desde?: Date;
  hasta?: Date;
}

export async function consultarDisponibilidad(p: ConsultarDisponibilidadParams): Promise<{ slots: Slot[] }> {
  if (!Types.ObjectId.isValid(p.servicioId) || !Types.ObjectId.isValid(p.profesionalId)) {
    throw new ApiError(400, 'ID_INVALIDO', 'servicioId o profesionalId inválido');
  }

  const config = await Configuracion.findById('centro').lean();
  if (!config) {
    throw new ApiError(500, 'CONFIG_FALTANTE', 'Falta configurar el centro');
  }

  const [profesional, servicio] = await Promise.all([
    Usuario.findById(p.profesionalId).lean(),
    Servicio.findById(p.servicioId).lean(),
  ]);

  // Mismas precondiciones que turnos.service.ts (§15.1). Se repiten acá — sin
  // sesión, en un read — en vez de compartirlas entre las dos capas: no vale
  // la pena acoplar el service transaccional a uno que no lo es por estas
  // pocas líneas.
  if (!profesional || !profesional.activo || !profesional.atiende) {
    throw new ApiError(404, 'PROFESIONAL_NO_DISPONIBLE', 'La profesional no está disponible');
  }
  if (!servicio || !servicio.activo) {
    throw new ApiError(404, 'SERVICIO_NO_DISPONIBLE', 'El servicio no está disponible');
  }
  const prestaElServicio = profesional.servicios.some((id) => id.equals(servicio._id));
  if (!prestaElServicio) {
    throw new ApiError(400, 'SERVICIO_NO_PRESTADO', 'Esa profesional no presta ese servicio');
  }

  const ahora = new Date();
  const minInicioPolitica = new Date(ahora.getTime() + config.antelacionMinimaHoras * 3600_000);
  // Mismo límite exclusivo de día calendario que usa calcularDisponibilidad
  // internamente (offset 0..ventanaMaximaDias): el día siguiente al último permitido.
  const maxFinPolitica = DateTime.now()
    .setZone(config.timezone)
    .startOf('day')
    .plus({ days: config.ventanaMaximaDias + 1 })
    .toJSDate();

  const desdeEfectivo = new Date(Math.max(p.desde?.getTime() ?? -Infinity, minInicioPolitica.getTime()));
  const hastaEfectivo = new Date(Math.min(p.hasta?.getTime() ?? Infinity, maxFinPolitica.getTime()));

  if (desdeEfectivo >= hastaEfectivo) {
    return { slots: [] };
  }

  const margenMs = await margenMaximoServicios();

  // Margen hacia atrás (§15.2 — el TODO que quedó pendiente en el POST): un
  // turno con `inicio` anterior a la ventana pero `finBloqueo` dentro sigue
  // ocupando, y no hay índice por finBloqueo (§9). Hacia adelante el corte es
  // limpio: un turno que arranca después de `hastaEfectivo` no puede ocupar
  // nada dentro de la ventana (su finBloqueo es todavía más tarde). El margen
  // es sólo hacia atrás.
  const turnos = await Turno.find({
    profesionalId: profesional._id,
    estado: { $in: ['pendiente', 'confirmado'] },
    inicio: { $gte: new Date(desdeEfectivo.getTime() - margenMs), $lt: hastaEfectivo },
  }).lean();

  const excepciones = await Excepcion.find({
    profesionalId: { $in: [null, profesional._id] },
    desde: { $lt: hastaEfectivo },
    hasta: { $gt: desdeEfectivo },
  }).lean();

  const slots = calcularDisponibilidad({
    ahora,
    config,
    profesional,
    servicio,
    excepciones,
    turnos,
  }).filter((s) => {
    const inicioMs = new Date(s.inicio).getTime();
    return inicioMs >= desdeEfectivo.getTime() && inicioMs < hastaEfectivo.getTime();
  });

  return { slots };
}

/** max(duracionMin + bufferPostMin) sobre servicios activos, en ms. */
async function margenMaximoServicios(): Promise<number> {
  const [resultado] = await Servicio.aggregate<{ margenMax: number }>([
    { $match: { activo: true } },
    { $group: { _id: null, margenMax: { $max: { $add: ['$duracionMin', '$bufferPostMin'] } } } },
  ]);
  return (resultado?.margenMax ?? 0) * 60_000;
}
