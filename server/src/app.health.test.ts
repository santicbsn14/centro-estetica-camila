import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from './app';

// /healthz — modelo-datos-turnos.md §11 ("Infra del worker"). Público, sin
// DB: no necesita conectarDbTest/desconectarDbTest.

describe('GET /healthz', () => {
  it('responde 200 con status ok y timestamp', async () => {
    const app = createApp();

    const res = await request(app).get('/healthz');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(typeof res.body.timestamp).toBe('string');
    expect(new Date(res.body.timestamp).toString()).not.toBe('Invalid Date');
  });
});

// CORS multi-origen (cierra el ⚠ REVISAR EN WEB del scaffolding de
// client-publico, 2026-08-25). GET /api/health sí pasa por el middleware
// `cors` (a diferencia de /healthz, registrado antes a propósito) y no toca
// la DB, así que sirve para verificar la allowlist sin levantar Mongo.
describe('CORS — allowlist de orígenes', () => {
  it('sin CORS_ORIGINS/PANEL_ORIGIN ⇒ default de dev refleja localhost:5173 y :5174 (panel + pública)', async () => {
    const app = createApp();

    const resPanel = await request(app).get('/api/health').set('Origin', 'http://localhost:5173');
    const resPublica = await request(app).get('/api/health').set('Origin', 'http://localhost:5174');

    expect(resPanel.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(resPublica.headers['access-control-allow-origin']).toBe('http://localhost:5174');
    expect(resPanel.headers['access-control-allow-credentials']).toBe('true');
  });

  it('origen fuera de la allowlist ⇒ sin header Access-Control-Allow-Origin', async () => {
    const app = createApp();

    const res = await request(app).get('/api/health').set('Origin', 'http://evil.example.com');

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('panelOrigin (override de test) reemplaza el default de dev, no lo extiende', async () => {
    const app = createApp({ panelOrigin: 'http://localhost:9999' });

    const resOverride = await request(app).get('/api/health').set('Origin', 'http://localhost:9999');
    const resDefaultViejo = await request(app).get('/api/health').set('Origin', 'http://localhost:5173');

    expect(resOverride.headers['access-control-allow-origin']).toBe('http://localhost:9999');
    expect(resDefaultViejo.headers['access-control-allow-origin']).toBeUndefined();
  });
});
