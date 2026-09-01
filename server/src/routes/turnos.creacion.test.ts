import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Express } from 'express';
import request from 'supertest';
import { DateTime } from 'luxon';
import { Types } from 'mongoose';
import { createApp } from '../app';
import { Configuracion, Usuario, Servicio, Turno, Cliente, Notificacion } from '../models';
import { crearTurno } from '../services/turnos.service';
import { ApiError } from '../utils/apiError';
import { conectarDbTest, desconectarDbTest, limpiarDbTest } from '../test/dbTestSetup';

const ZONE = 'America/Argentina/Buenos_Aires';

let mongoUrl: string;
let app: Express;

beforeAll(async () => {
  mongoUrl = await conectarDbTest();
  app = createApp({ mongoUrl, sessionSecret: 'test-secret', panelOrigin: 'http://localhost:5173' });
}, 300_000);

afterEach(async () => {
  await limpiarDbTest();
});

afterAll(async () => {
  await desconectarDbTest();
});

function horario(desde = '09:00', hasta = '20:00') {
  return Array.from({ length: 7 }, (_, dia) => ({ dia, bloques: [{ desde, hasta }] }));
}

async function crearConfig() {
  await Configuracion.create({
    _id: 'centro',
    nombre: 'Centro',
    timezone: ZONE,
    horarios: horario(),
    pasoGrillaMin: 30,
    antelacionMinimaHoras: 0,
    ventanaMaximaDias: 30,
    cancelacionMinimaHoras: 24,
    vencimientoPendienteHoras: 12,
    contacto: { telefonoE164: '+5493364000000', email: 'centro@test.com', direccion: 'Calle 1' },
  });
}

async function crearServicio(overrides: Partial<{ activo: boolean; duracionMin: number; bufferPostMin: number; precio: number }> = {}) {
  return Servicio.create({
    nombre: 'Manicura',
    duracionMin: overrides.duracionMin ?? 30,
    bufferPostMin: overrides.bufferPostMin ?? 0,
    precio: overrides.precio ?? 500000,
    mostrarPrecio: true,
    horarios: null,
    orden: 0,
    activo: overrides.activo ?? true,
  });
}

async function crearProfesional(overrides: {
  servicios: Types.ObjectId[];
  atiende?: boolean;
  activo?: boolean;
}) {
  return Usuario.create({
    nombre: 'Profesional Test',
    email: `prof-${new Types.ObjectId().toString()}@test.com`,
    passwordHash: 'x',
    rol: 'profesional',
    atiende: overrides.atiende ?? true,
    servicios: overrides.servicios,
    horarios: horario(),
    activo: overrides.activo ?? true,
  });
}

function mananaA(hora: number, minuto = 0): Date {
  return DateTime.now().setZone(ZONE).startOf('day').plus({ days: 1 }).set({ hour: hora, minute: minuto }).toJSDate();
}

const BODY_BASE = {
  nombre: 'Clienta Test',
  telefono: '+54 9 336 4123456',
  email: 'clienta@test.com',
};

describe('POST /api/turnos — happy path', () => {
  it('body válido ⇒ 201, pendiente, snapshots congelados desde la base (no del body)', async () => {
    await crearConfig();
    const servicio = await crearServicio({ duracionMin: 45, precio: 750000 });
    const profesional = await crearProfesional({ servicios: [servicio._id] });

    const res = await request(app)
      .post('/api/turnos')
      .send({
        ...BODY_BASE,
        servicioId: servicio._id.toString(),
        profesionalId: profesional._id.toString(),
        inicio: mananaA(10).toISOString(),
        // Campos que NO existen en crearTurnoSchema: deben ser ignorados por
        // el schema (strip), nunca terminar en el turno.
        precio: 1,
        duracionMin: 5,
      });

    expect(res.status).toBe(201);
    expect(res.body.estado).toBe('pendiente');

    const turno = await Turno.findOne({ codigo: res.body.codigo }).lean();
    expect(turno).not.toBeNull();
    expect(turno!.servicio.duracionMin).toBe(45); // de la base, no el 5 del body
    expect(turno!.servicio.precio).toBe(750000); // de la base, no el 1 del body
    expect(turno!.clienteSnapshot.nombre).toBe('Clienta Test');
    expect(turno!.origen).toBe('web');

    const notifs = await Notificacion.find({ turnoId: turno!._id, tipo: 'solicitud' }).lean();
    expect(notifs).toHaveLength(1);
  });
});

describe('POST /api/turnos — carrera de solape', () => {
  it('un turno activo que solapa ⇒ la segunda reserva da 409 SLOT_OCUPADO con slots, y no crea nada', async () => {
    await crearConfig();
    const servicio = await crearServicio();
    const profesional = await crearProfesional({ servicios: [servicio._id] });
    const inicio = mananaA(10);

    const primera = await request(app)
      .post('/api/turnos')
      .send({
        ...BODY_BASE,
        servicioId: servicio._id.toString(),
        profesionalId: profesional._id.toString(),
        inicio: inicio.toISOString(),
      });
    expect(primera.status).toBe(201);

    const segunda = await request(app)
      .post('/api/turnos')
      .send({
        ...BODY_BASE,
        telefono: '3364123456', // otra clienta, mismo horario
        servicioId: servicio._id.toString(),
        profesionalId: profesional._id.toString(),
        inicio: inicio.toISOString(),
      });

    expect(segunda.status).toBe(409);
    expect(segunda.body.codigo).toBe('SLOT_OCUPADO');
    expect(Array.isArray(segunda.body.detalle.slots)).toBe(true);

    const turnos = await Turno.find({ profesionalId: profesional._id }).lean();
    expect(turnos).toHaveLength(1); // sólo la primera reserva

    const notifs = await Notificacion.find({ tipo: 'solicitud' }).lean();
    expect(notifs).toHaveLength(1); // no se encoló nada para la rechazada
  });
});

describe('POST /api/turnos — grilla según origen', () => {
  it("origen 'web' con inicio fuera de grilla ⇒ 400", async () => {
    await crearConfig();
    const servicio = await crearServicio();
    const profesional = await crearProfesional({ servicios: [servicio._id] });

    const res = await request(app)
      .post('/api/turnos')
      .send({
        ...BODY_BASE,
        servicioId: servicio._id.toString(),
        profesionalId: profesional._id.toString(),
        inicio: mananaA(9, 7).toISOString(), // 09:07 — no es múltiplo de 30
      });

    expect(res.status).toBe(400);
    expect(res.body.codigo).toBe('GRILLA_INVALIDA');
  });

  it("origen 'admin' fuera de grilla que no solapa ⇒ 201 con fueraDeHorario:true", async () => {
    await crearConfig();
    const servicio = await crearServicio();
    const profesional = await crearProfesional({ servicios: [servicio._id] });

    // No hay ruta admin todavía (auth pendiente en otro paso): se llama al
    // service directo, tal como se hizo con verificarOwnershipTurno antes de
    // que existiera la ruta de panel.
    const resultado = await crearTurno({
      servicioId: servicio._id.toString(),
      profesionalId: profesional._id.toString(),
      inicio: mananaA(9, 7).toISOString(),
      nombre: BODY_BASE.nombre,
      telefono: BODY_BASE.telefono,
      email: BODY_BASE.email,
      origen: 'admin',
    });

    expect(resultado.estado).toBe('pendiente');
    expect(resultado.fueraDeHorario).toBe(true);
  });
});

describe('POST /api/turnos — el solape no lo pisa ni el admin', () => {
  it("origen 'admin' que solapa otro turno ⇒ 409 SLOT_OCUPADO igual", async () => {
    await crearConfig();
    const servicio = await crearServicio();
    const profesional = await crearProfesional({ servicios: [servicio._id] });
    const inicio = mananaA(10);

    const primera = await request(app)
      .post('/api/turnos')
      .send({
        ...BODY_BASE,
        servicioId: servicio._id.toString(),
        profesionalId: profesional._id.toString(),
        inicio: inicio.toISOString(),
      });
    expect(primera.status).toBe(201);

    await expect(
      crearTurno({
        servicioId: servicio._id.toString(),
        profesionalId: profesional._id.toString(),
        inicio: inicio.toISOString(),
        nombre: 'Otra clienta',
        telefono: '3364123456',
        origen: 'admin',
      })
    ).rejects.toMatchObject({ status: 409, codigo: 'SLOT_OCUPADO' } satisfies Partial<ApiError>);
  });
});

describe('POST /api/turnos — precondiciones de catálogo', () => {
  it('servicio inactivo ⇒ 404 SERVICIO_NO_DISPONIBLE', async () => {
    await crearConfig();
    const servicio = await crearServicio({ activo: false });
    const profesional = await crearProfesional({ servicios: [servicio._id] });

    const res = await request(app)
      .post('/api/turnos')
      .send({
        ...BODY_BASE,
        servicioId: servicio._id.toString(),
        profesionalId: profesional._id.toString(),
        inicio: mananaA(10).toISOString(),
      });

    expect(res.status).toBe(404);
    expect(res.body.codigo).toBe('SERVICIO_NO_DISPONIBLE');
  });

  it('profesional con atiende:false ⇒ 404 PROFESIONAL_NO_DISPONIBLE', async () => {
    await crearConfig();
    const servicio = await crearServicio();
    const profesional = await crearProfesional({ servicios: [servicio._id], atiende: false });

    const res = await request(app)
      .post('/api/turnos')
      .send({
        ...BODY_BASE,
        servicioId: servicio._id.toString(),
        profesionalId: profesional._id.toString(),
        inicio: mananaA(10).toISOString(),
      });

    expect(res.status).toBe(404);
    expect(res.body.codigo).toBe('PROFESIONAL_NO_DISPONIBLE');
  });

  it('servicioId que no está en profesional.servicios ⇒ 400 SERVICIO_NO_PRESTADO', async () => {
    await crearConfig();
    const servicio = await crearServicio();
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
    const profesional = await crearProfesional({ servicios: [otroServicio._id] });

    const res = await request(app)
      .post('/api/turnos')
      .send({
        ...BODY_BASE,
        servicioId: servicio._id.toString(),
        profesionalId: profesional._id.toString(),
        inicio: mananaA(10).toISOString(),
      });

    expect(res.status).toBe(400);
    expect(res.body.codigo).toBe('SERVICIO_NO_PRESTADO');
  });
});

describe('POST /api/turnos — normalización de teléfono', () => {
  it('formas equivalentes del §10 hacen upsert sobre UN solo cliente', async () => {
    await crearConfig();
    const servicio = await crearServicio();
    const profesional = await crearProfesional({ servicios: [servicio._id] });

    const primera = await request(app)
      .post('/api/turnos')
      .send({
        ...BODY_BASE,
        telefono: '3364123456',
        servicioId: servicio._id.toString(),
        profesionalId: profesional._id.toString(),
        inicio: mananaA(10).toISOString(),
      });
    expect(primera.status).toBe(201);

    const segunda = await request(app)
      .post('/api/turnos')
      .send({
        ...BODY_BASE,
        telefono: '+54 9 336 4123456',
        servicioId: servicio._id.toString(),
        profesionalId: profesional._id.toString(),
        inicio: mananaA(11).toISOString(), // otro horario, no solapa
      });
    expect(segunda.status).toBe(201);

    const clientes = await Cliente.find({ telefonoE164: '+5493364123456' }).lean();
    expect(clientes).toHaveLength(1);

    const turnos = await Turno.find({ profesionalId: profesional._id }).lean();
    expect(turnos).toHaveLength(2);
    expect(turnos[0].clienteId.toString()).toBe(turnos[1].clienteId.toString());
    expect(turnos[0].clienteId.toString()).toBe(clientes[0]._id.toString());
  });
});

describe('POST /api/turnos — código de turno (§4/§13, DECISIÓN CERRADA)', () => {
  it('código con formato TRN-{año}-####', async () => {
    await crearConfig();
    const servicio = await crearServicio();
    const profesional = await crearProfesional({ servicios: [servicio._id] });

    const res = await request(app)
      .post('/api/turnos')
      .send({
        ...BODY_BASE,
        servicioId: servicio._id.toString(),
        profesionalId: profesional._id.toString(),
        inicio: mananaA(10).toISOString(),
      });

    expect(res.status).toBe(201);
    const anioActual = DateTime.now().setZone(ZONE).year;
    expect(res.body.codigo).toMatch(new RegExp(`^TRN-${anioActual}-\\d{4}$`));
  });

  it('dos turnos creados en secuencia tienen contadores consecutivos', async () => {
    await crearConfig();
    const servicio = await crearServicio();
    const profesional = await crearProfesional({ servicios: [servicio._id] });

    const primera = await request(app)
      .post('/api/turnos')
      .send({
        ...BODY_BASE,
        servicioId: servicio._id.toString(),
        profesionalId: profesional._id.toString(),
        inicio: mananaA(10).toISOString(),
      });
    expect(primera.status).toBe(201);

    const segunda = await request(app)
      .post('/api/turnos')
      .send({
        ...BODY_BASE,
        telefono: '3364123456', // otra clienta, otro horario — no solapa
        servicioId: servicio._id.toString(),
        profesionalId: profesional._id.toString(),
        inicio: mananaA(11).toISOString(),
      });
    expect(segunda.status).toBe(201);

    const anioActual = DateTime.now().setZone(ZONE).year;
    const ultimoPrimera = Number(primera.body.codigo.split('-')[2]);
    const ultimoSegunda = Number(segunda.body.codigo.split('-')[2]);

    expect(primera.body.codigo).toBe(`TRN-${anioActual}-${ultimoPrimera.toString().padStart(4, '0')}`);
    expect(ultimoSegunda).toBe(ultimoPrimera + 1);
  });

  it('contadorTurnosPorAnio de un año viejo ⇒ el próximo turno resetea a 0001 del año actual', async () => {
    await crearConfig();
    const servicio = await crearServicio();
    const profesional = await crearProfesional({ servicios: [servicio._id] });

    const anioActual = DateTime.now().setZone(ZONE).year;
    // Simula que el contador quedó de un año anterior con turnos ya
    // generados — no se necesita fakear el reloj: alcanza con forzar el
    // valor guardado, que es lo único que generarCodigoTurno() lee.
    await Configuracion.updateOne(
      { _id: 'centro' },
      { $set: { contadorTurnosPorAnio: { anio: anioActual - 1, ultimo: 42 } } }
    );

    const res = await request(app)
      .post('/api/turnos')
      .send({
        ...BODY_BASE,
        servicioId: servicio._id.toString(),
        profesionalId: profesional._id.toString(),
        inicio: mananaA(10).toISOString(),
      });

    expect(res.status).toBe(201);
    expect(res.body.codigo).toBe(`TRN-${anioActual}-0001`);

    const config = await Configuracion.findById('centro').lean();
    expect(config?.contadorTurnosPorAnio).toEqual({ anio: anioActual, ultimo: 1 });
  });
});

describe('POST /api/turnos — rate limit por IP (§13)', () => {
  it('bien formado por debajo del límite ⇒ funciona normal; al superarlo corta con 429', async () => {
    // App aislada: cada createApp() arma su propio rate limiter en memoria,
    // así no hereda las 14 creaciones de los describe anteriores en este archivo.
    const appAislada = createApp({ mongoUrl, sessionSecret: 'test-secret', panelOrigin: 'http://localhost:5173' });

    await crearConfig();
    const servicio = await crearServicio();
    const profesional = await crearProfesional({ servicios: [servicio._id] });

    const primera = await request(appAislada)
      .post('/api/turnos')
      .send({
        ...BODY_BASE,
        servicioId: servicio._id.toString(),
        profesionalId: profesional._id.toString(),
        inicio: mananaA(10).toISOString(),
      });
    expect(primera.status).toBe(201); // debajo del límite (20/10min) ⇒ funciona normal

    // Body vacío a propósito: el rate limit corre ANTES de la validación del
    // body (§13/§15.1), así que un 400 también consume cupo — no hace falta
    // un turno válido (ni evitar el solape con `primera`) en cada request
    // sólo para probar el corte.
    let ultimaRespuesta;
    for (let i = 0; i < 20; i++) {
      ultimaRespuesta = await request(appAislada).post('/api/turnos').send({});
    }

    expect(ultimaRespuesta!.status).toBe(429);
    expect(ultimaRespuesta!.body.codigo).toBe('DEMASIADAS_SOLICITUDES');
  });
});
