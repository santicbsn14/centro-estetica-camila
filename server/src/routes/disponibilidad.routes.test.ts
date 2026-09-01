import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
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

describe('GET /api/disponibilidad', () => {
  it('sin servicioId/profesionalId ⇒ 400 con la forma de error fija', async () => {
    const res = await request(app).get('/api/disponibilidad');

    expect(res.status).toBe(400);
    expect(res.body.codigo).toBe('QUERY_INVALIDA');
    expect(res.body).toHaveProperty('mensaje');
  });

  it('desde con formato no-ISO ⇒ 400', async () => {
    const res = await request(app).get('/api/disponibilidad').query({
      servicioId: '507f1f77bcf86cd799439011',
      profesionalId: '507f1f77bcf86cd799439012',
      desde: 'no-es-una-fecha',
    });

    expect(res.status).toBe(400);
    expect(res.body.codigo).toBe('QUERY_INVALIDA');
  });
});

describe('GET /api/disponibilidad — rate limit por IP (§13)', () => {
  it('por debajo del límite pasa por la validación normal; al superarlo corta con 429', async () => {
    // App aislada: cada createApp() arma su propio rate limiter en memoria,
    // así no hereda las requests de los tests anteriores en este archivo.
    const appAislada = createApp();

    const primera = await request(appAislada).get('/api/disponibilidad');
    expect(primera.status).toBe(400); // debajo del límite (60/min) ⇒ no lo corta el rate limit
    expect(primera.body.codigo).toBe('QUERY_INVALIDA');

    let ultimaRespuesta;
    for (let i = 0; i < 60; i++) {
      ultimaRespuesta = await request(appAislada).get('/api/disponibilidad');
    }

    expect(ultimaRespuesta!.status).toBe(429);
    expect(ultimaRespuesta!.body.codigo).toBe('DEMASIADAS_SOLICITUDES');
  });
});
