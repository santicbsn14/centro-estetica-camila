import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Experiencia } from '../models';
import { createApp } from '../app';
import { conectarDbTest, desconectarDbTest, limpiarDbTest } from '../test/dbTestSetup';

// GET /api/experiencias público — modelo-datos-turnos.md §15.7.2.

const app = createApp();

beforeAll(async () => {
  await conectarDbTest();
}, 300_000);

afterEach(async () => {
  await limpiarDbTest();
});

afterAll(async () => {
  await desconectarDbTest();
});

const base = { incluye: ['Limpieza facial', 'Masaje'], precio: 3000000, mostrarPrecio: true };

describe('GET /api/experiencias', () => {
  it('sólo activas, por orden asc; sin precio si !mostrarPrecio; sin orden/activo/timestamps', async () => {
    await Experiencia.create([
      { ...base, nombre: 'Segunda', orden: 2, mostrarPrecio: false, activo: true },
      { ...base, nombre: 'Pausada', orden: 0, activo: false },
      {
        ...base,
        nombre: 'Primera',
        orden: 1,
        activo: true,
        descripcion: 'Para regalar',
        imagenUrl: 'https://cdn.example.com/a.png',
      },
    ]);

    const res = await request(app).get('/api/experiencias');
    expect(res.status).toBe(200);
    expect(res.body.map((e: { nombre: string }) => e.nombre)).toEqual(['Primera', 'Segunda']);

    const [primera, segunda] = res.body;
    // Allowlist exacta (no-fuga).
    expect(Object.keys(primera).sort()).toEqual(['_id', 'descripcion', 'imagenUrl', 'incluye', 'nombre', 'precio']);
    expect(primera.precio).toBe(3000000);
    expect(primera.incluye).toEqual(['Limpieza facial', 'Masaje']);

    expect(Object.keys(segunda).sort()).toEqual(['_id', 'incluye', 'nombre']);
    for (const e of res.body) {
      for (const campo of ['orden', 'activo', 'mostrarPrecio', 'creadoEn', 'actualizadoEn', '__v']) {
        expect(e).not.toHaveProperty(campo);
      }
    }
  });

  it('sin combos activos ⇒ 200 []', async () => {
    const res = await request(app).get('/api/experiencias');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe('GET /api/experiencias — rate limit por IP', () => {
  it('por debajo del límite funciona normal; al superarlo corta con 429 DEMASIADAS_SOLICITUDES', async () => {
    // App aislada: rate limiter propio, sin heredar requests de otros tests.
    const appAislada = createApp();

    const primera = await request(appAislada).get('/api/experiencias');
    expect(primera.status).toBe(200);

    let ultima;
    for (let i = 0; i < 60; i++) {
      ultima = await request(appAislada).get('/api/experiencias');
    }
    expect(ultima!.status).toBe(429);
    expect(ultima!.body.codigo).toBe('DEMASIADAS_SOLICITUDES');
  });
});
