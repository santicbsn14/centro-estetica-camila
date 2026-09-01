import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { DateTime } from 'luxon';
import { Types } from 'mongoose';
import { Configuracion, Usuario, Servicio, Turno } from '../models';
import { ApiError } from '../utils/apiError';
import { consultarDisponibilidad } from './consultarDisponibilidad';
import { conectarDbTest, desconectarDbTest, limpiarDbTest } from '../test/dbTestSetup';

const ZONE = 'America/Argentina/Buenos_Aires';

beforeAll(async () => {
  await conectarDbTest();
}, 550_000); // primera corrida descarga el binario de mongod (~600mb); se cachea después

afterEach(async () => {
  await limpiarDbTest();
});

afterAll(async () => {
  await desconectarDbTest();
});

function horario(desde = '09:00', hasta = '20:00') {
  return Array.from({ length: 7 }, (_, dia) => ({ dia, bloques: [{ desde, hasta }] }));
}

async function seedCentroYProfesional(servicioIds: string[]) {
  await Configuracion.create({
    _id: 'centro',
    nombre: 'Centro',
    timezone: ZONE,
    horarios: horario(),
    pasoGrillaMin: 30,
    antelacionMinimaHoras: 0,
    ventanaMaximaDias: 7,
    cancelacionMinimaHoras: 24,
    vencimientoPendienteHoras: 12,
    contacto: { telefonoE164: '+5493364000000', email: 'centro@test.com', direccion: 'Calle 1' },
  });

  const profesional = await Usuario.create({
    nombre: 'Profesional Test',
    email: 'profesional@test.com',
    passwordHash: 'x',
    rol: 'profesional',
    atiende: true,
    servicios: servicioIds,
    horarios: horario(),
    activo: true,
  });

  return profesional;
}

async function crearTurnoDePrueba(opts: {
  profesionalId: unknown;
  inicio: Date;
  duracionMin: number;
  bufferPostMin: number;
  estado?: 'pendiente' | 'confirmado';
}) {
  const fin = new Date(opts.inicio.getTime() + opts.duracionMin * 60_000);
  const finBloqueo = new Date(fin.getTime() + opts.bufferPostMin * 60_000);
  await Turno.create({
    codigo: `TRN-${Math.floor(Math.random() * 9000 + 1000)}`,
    clienteId: idFalso(),
    clienteSnapshot: { nombre: 'Clienta Test', telefonoE164: '+5493364111111' },
    profesionalId: opts.profesionalId,
    profesionalNombre: 'Profesional Test',
    servicio: { servicioId: idFalso(), nombre: 'Otro', duracionMin: opts.duracionMin, bufferPostMin: opts.bufferPostMin, precio: 1000 },
    inicio: opts.inicio,
    fin,
    finBloqueo,
    estado: opts.estado ?? 'confirmado',
    historial: [],
    origen: 'web',
    fueraDeHorario: false,
  });
}

// ObjectId cualquiera, sólo hace falta que exista sintácticamente — no se popula.
function idFalso() {
  return new Types.ObjectId();
}

describe('consultarDisponibilidad', () => {
  it('un turno de OTRO servicio con buffer más largo, que arranca antes de la ventana, bloquea igual (margen hacia atrás)', async () => {
    const servicioPedido = await Servicio.create({
      nombre: 'Manicura',
      duracionMin: 30,
      bufferPostMin: 0,
      precio: 500000,
      mostrarPrecio: true,
      horarios: null,
      orden: 0,
      activo: true,
    });
    // Servicio con buffer mucho más largo: define el margen global, aunque no
    // sea el que se está consultando.
    await Servicio.create({
      nombre: 'Depilación láser',
      duracionMin: 60,
      bufferPostMin: 120,
      precio: 900000,
      mostrarPrecio: true,
      horarios: null,
      orden: 1,
      activo: true,
    });

    const profesional = await seedCentroYProfesional([servicioPedido._id.toString()]);

    // "Mañana" en vez de "hoy": la ventana no puede depender de a qué hora del
    // día real corre el test (con antelacionMinimaHoras: 0, "hoy 09:00" se
    // recorta contra el reloj real si el test corre pasado el mediodía).
    const diaObjetivo = DateTime.now().setZone(ZONE).startOf('day').plus({ days: 1 });
    const desde = diaObjetivo.set({ hour: 9 }).toJSDate();
    const hasta = diaObjetivo.set({ hour: 20 }).toJSDate();

    // Turno "de otro servicio" (dur 60 + buffer 120 = 180min): arranca a las
    // 07:00, dos horas antes de la ventana pedida (09:00). Sin el margen de
    // 180min (sólo con el margen de 30min del servicio pedido) este turno NO
    // se traería de la DB.
    await crearTurnoDePrueba({
      profesionalId: profesional._id,
      inicio: diaObjetivo.set({ hour: 7, minute: 0 }).toJSDate(),
      duracionMin: 60,
      bufferPostMin: 120,
    });

    const { slots } = await consultarDisponibilidad({
      servicioId: servicioPedido._id.toString(),
      profesionalId: profesional._id.toString(),
      desde,
      hasta,
    });

    const horas = slots.map((s) => DateTime.fromISO(s.inicio, { zone: ZONE }).toFormat('HH:mm'));

    // finBloqueo del turno = 07:00 + 180min = 10:00: bloquea 09:00 y 09:30.
    expect(horas).not.toContain('09:00');
    expect(horas).not.toContain('09:30');
    expect(horas).toContain('10:00');
  });

  it('ventana pedida fuera de política (desdeEfectivo >= hastaEfectivo) ⇒ slots vacío, sin error', async () => {
    const servicio = await Servicio.create({
      nombre: 'Manicura',
      duracionMin: 30,
      bufferPostMin: 0,
      precio: 500000,
      mostrarPrecio: true,
      horarios: null,
      orden: 0,
      activo: true,
    });
    const profesional = await seedCentroYProfesional([servicio._id.toString()]);

    const ahora = new Date();
    const desde = new Date(ahora.getTime() - 10 * 24 * 3600_000);
    const hasta = new Date(ahora.getTime() - 9 * 24 * 3600_000);

    const { slots } = await consultarDisponibilidad({
      servicioId: servicio._id.toString(),
      profesionalId: profesional._id.toString(),
      desde,
      hasta,
    });

    expect(slots).toEqual([]);
  });

  it('catálogo inválido (profesional no presta el servicio) ⇒ ApiError 400', async () => {
    const servicioPedido = await Servicio.create({
      nombre: 'Manicura',
      duracionMin: 30,
      bufferPostMin: 0,
      precio: 500000,
      mostrarPrecio: true,
      horarios: null,
      orden: 0,
      activo: true,
    });
    const otroServicio = await Servicio.create({
      nombre: 'Pedicura',
      duracionMin: 30,
      bufferPostMin: 0,
      precio: 500000,
      mostrarPrecio: true,
      horarios: null,
      orden: 1,
      activo: true,
    });
    // La profesional sólo presta `otroServicio`, no `servicioPedido`.
    const profesional = await seedCentroYProfesional([otroServicio._id.toString()]);

    await expect(
      consultarDisponibilidad({
        servicioId: servicioPedido._id.toString(),
        profesionalId: profesional._id.toString(),
      })
    ).rejects.toMatchObject({ status: 400, codigo: 'SERVICIO_NO_PRESTADO' } satisfies Partial<ApiError>);
  });
});
