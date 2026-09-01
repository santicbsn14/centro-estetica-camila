import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Servicio, Usuario } from '../models';
import { createApp } from '../app';
import { conectarDbTest, desconectarDbTest, limpiarDbTest } from '../test/dbTestSetup';

const app = createApp();

beforeAll(async () => {
  await conectarDbTest();
}, 550_000); // primera corrida descarga el binario de mongod (~600mb); se cachea después

afterEach(async () => {
  await limpiarDbTest();
});

afterAll(async () => {
  await desconectarDbTest();
});

describe('GET /api/servicios', () => {
  it('devuelve sólo campos públicos, respeta mostrarPrecio y excluye inactivos', async () => {
    await Servicio.create([
      {
        nombre: 'Manicura',
        descripcion: 'Manicura semipermanente',
        duracionMin: 45,
        bufferPostMin: 15,
        precio: 800000,
        mostrarPrecio: true,
        horarios: null,
        orden: 0,
        activo: true,
      },
      {
        nombre: 'Tratamiento facial',
        duracionMin: 60,
        bufferPostMin: 10,
        precio: 1500000,
        mostrarPrecio: false,
        horarios: null,
        orden: 1,
        activo: true,
      },
      {
        nombre: 'Servicio dado de baja',
        duracionMin: 30,
        bufferPostMin: 0,
        precio: 100000,
        mostrarPrecio: true,
        horarios: null,
        orden: 2,
        activo: false,
      },
    ]);

    const res = await request(app).get('/api/servicios');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);

    const nombres = res.body.map((s: { nombre: string }) => s.nombre);
    expect(nombres).toEqual(['Manicura', 'Tratamiento facial']); // orden asc, sin el inactivo

    const manicura = res.body.find((s: { nombre: string }) => s.nombre === 'Manicura');
    expect(manicura.precio).toBe(800000);
    expect(manicura).not.toHaveProperty('bufferPostMin');
    expect(manicura).not.toHaveProperty('horarios');
    expect(manicura).not.toHaveProperty('mostrarPrecio');
    expect(manicura).not.toHaveProperty('activo');

    const facial = res.body.find((s: { nombre: string }) => s.nombre === 'Tratamiento facial');
    expect(facial).not.toHaveProperty('precio'); // mostrarPrecio: false
  });
});

describe('GET /api/servicios/:id/profesionales', () => {
  it('devuelve sólo _id + nombre, nunca email ni telefonoE164, y filtra por activo/atiende/servicios', async () => {
    const servicio = await Servicio.create({
      nombre: 'Manicura',
      duracionMin: 45,
      bufferPostMin: 15,
      precio: 800000,
      mostrarPrecio: true,
      horarios: null,
      orden: 0,
      activo: true,
    });
    const otroServicio = await Servicio.create({
      nombre: 'Pedicura',
      duracionMin: 30,
      bufferPostMin: 10,
      precio: 600000,
      mostrarPrecio: true,
      horarios: null,
      orden: 1,
      activo: true,
    });

    await Usuario.create([
      {
        nombre: 'Presta y atiende',
        email: 'ok@test.com',
        passwordHash: 'x',
        rol: 'profesional',
        atiende: true,
        servicios: [servicio._id],
        horarios: [],
        telefonoE164: '+5493364111111',
        activo: true,
      },
      {
        nombre: 'No atiende',
        email: 'noatiende@test.com',
        passwordHash: 'x',
        rol: 'profesional',
        atiende: false,
        servicios: [servicio._id],
        horarios: [],
        activo: true,
      },
      {
        nombre: 'Inactiva',
        email: 'inactiva@test.com',
        passwordHash: 'x',
        rol: 'profesional',
        atiende: true,
        servicios: [servicio._id],
        horarios: [],
        activo: false,
      },
      {
        nombre: 'No presta este servicio',
        email: 'otro@test.com',
        passwordHash: 'x',
        rol: 'profesional',
        atiende: true,
        servicios: [otroServicio._id],
        horarios: [],
        activo: true,
      },
    ]);

    const res = await request(app).get(`/api/servicios/${servicio._id}/profesionales`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].nombre).toBe('Presta y atiende');
    expect(Object.keys(res.body[0]).sort()).toEqual(['_id', 'nombre']);
    expect(res.body[0]).not.toHaveProperty('email');
    expect(res.body[0]).not.toHaveProperty('telefonoE164');
  });

  it('servicioId inválido ⇒ 400', async () => {
    const res = await request(app).get('/api/servicios/no-es-un-id/profesionales');
    expect(res.status).toBe(400);
    expect(res.body.codigo).toBe('ID_INVALIDO');
  });
});

describe('GET /api/servicios — rate limit por IP (§13)', () => {
  it('por debajo del límite funciona normal; al superarlo corta con 429', async () => {
    // App aislada: cada createApp() arma su propio rate limiter en memoria,
    // así no hereda las requests de los tests anteriores en este archivo.
    const appAislada = createApp();

    const primera = await request(appAislada).get('/api/servicios');
    expect(primera.status).toBe(200); // debajo del límite (60/min) ⇒ funciona normal

    let ultimaRespuesta;
    for (let i = 0; i < 60; i++) {
      ultimaRespuesta = await request(appAislada).get('/api/servicios');
    }

    expect(ultimaRespuesta!.status).toBe(429);
    expect(ultimaRespuesta!.body.codigo).toBe('DEMASIADAS_SOLICITUDES');
  });
});

describe('GET /api/servicios/:id/profesionales — rate limit por IP (§13, comparte cupo con GET /api/servicios)', () => {
  it('por debajo del límite funciona normal; al superarlo corta con 429', async () => {
    const appAislada = createApp();
    const idValido = '507f1f77bcf86cd799439011';

    const primera = await request(appAislada).get(`/api/servicios/${idValido}/profesionales`);
    expect(primera.status).toBe(200); // debajo del límite ⇒ funciona normal (id válido, sin match ⇒ [])

    let ultimaRespuesta;
    for (let i = 0; i < 60; i++) {
      ultimaRespuesta = await request(appAislada).get(`/api/servicios/${idValido}/profesionales`);
    }

    expect(ultimaRespuesta!.status).toBe(429);
    expect(ultimaRespuesta!.body.codigo).toBe('DEMASIADAS_SOLICITUDES');
  });
});
