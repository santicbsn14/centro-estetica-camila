import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Express } from 'express';
import request from 'supertest';
import { Types } from 'mongoose';
import { createApp } from '../../app';
import { Experiencia, Usuario } from '../../models';
import { hashPassword } from '../../services/password';
import { conectarDbTest, desconectarDbTest, limpiarDbTest } from '../../test/dbTestSetup';
import { conCsrf } from '../../test/httpTestHelpers';

// CRUD admin de combos y experiencias — modelo-datos-turnos.md §15.7.2.

const PASSWORD = 'Password123!';

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

async function crearUsuario(email: string, rol: 'admin' | 'profesional') {
  return Usuario.create({
    nombre: email,
    email,
    passwordHash: await hashPassword(PASSWORD),
    rol,
    atiende: rol === 'profesional',
    servicios: [],
    horarios: [],
    activo: true,
  });
}

async function loguear(email: string, rol: 'admin' | 'profesional' = 'admin') {
  await crearUsuario(email, rol);
  const agente = conCsrf(request.agent(app));
  await agente.post('/api/auth/login').send({ email, password: PASSWORD }).expect(200);
  return agente;
}

function bodyValido(overrides: Record<string, unknown> = {}) {
  return {
    nombre: 'Día de spa',
    descripcion: 'Para desconectar',
    incluye: ['Limpieza facial profunda', 'Reflexología podal'],
    precio: 4500000,
    mostrarPrecio: true,
    imagenUrl: 'https://cdn.example.com/spa.png',
    orden: 0,
    ...overrides,
  };
}

describe('índice de experiencias.nombre', () => {
  it('existe unique CON collation es/strength 2, y { activo, orden }', async () => {
    const indices = await Experiencia.collection.indexes();
    const nombre = indices.find((i) => i.key.nombre === 1);
    expect(nombre?.unique).toBe(true);
    expect(nombre?.collation).toMatchObject({ locale: 'es', strength: 2 });
    expect(indices.some((i) => i.key.activo === 1 && i.key.orden === 1)).toBe(true);
  });
});

describe('POST /api/admin/experiencias', () => {
  it('crear válido ⇒ 201 ExperienciaPanel completo, activo:true', async () => {
    const agente = await loguear('admin@test.com');
    const res = await agente.post('/api/admin/experiencias').send(bodyValido());

    expect(res.status).toBe(201);
    expect(Object.keys(res.body).sort()).toEqual(
      [
        'activo', 'actualizadoEn', 'creadoEn', 'descripcion', 'id', 'imagenUrl',
        'incluye', 'mostrarPrecio', 'nombre', 'orden', 'precio',
      ].sort()
    );
    expect(res.body).toMatchObject({ nombre: 'Día de spa', activo: true, precio: 4500000 });
  });

  it('activo:false en el body de alta se ignora ⇒ nace true', async () => {
    const agente = await loguear('admin@test.com');
    // crear no es .strict() (igual que servicios): `activo` no está declarado,
    // Zod lo descarta y el modelo lo hace nacer true.
    const res = await agente.post('/api/admin/experiencias').send(bodyValido({ activo: false }));
    expect(res.status).toBe(201);
    expect(res.body.activo).toBe(true);
  });

  it('nombre duplicado con otra capitalización ⇒ 409 NOMBRE_DUPLICADO', async () => {
    const agente = await loguear('admin@test.com');
    await agente.post('/api/admin/experiencias').send(bodyValido()).expect(201);

    const res = await agente.post('/api/admin/experiencias').send(bodyValido({ nombre: 'DÍA DE SPA' }));
    expect(res.status).toBe(409);
    expect(res.body.codigo).toBe('NOMBRE_DUPLICADO');
    expect(JSON.stringify(res.body)).not.toContain('E11000');
  });

  it('incluye: 1 ítem ⇒ 400; ítem vacío ⇒ 400; ítem de 1 carácter ⇒ 400; 9 ítems ⇒ 400', async () => {
    const agente = await loguear('admin@test.com');
    const casos = [
      ['Solo uno'],
      ['Limpieza', ''],
      ['Limpieza', '   '],
      ['Limpieza', 'x'],
      Array.from({ length: 9 }, (_, i) => `Ítem ${i + 1}`),
    ];
    for (const incluye of casos) {
      const res = await agente.post('/api/admin/experiencias').send(bodyValido({ incluye }));
      expect(res.status, JSON.stringify(incluye)).toBe(400);
    }
    expect(await Experiencia.countDocuments()).toBe(0);
  });

  it('incluye se guarda trimeado; 8 ítems ⇒ ok', async () => {
    const agente = await loguear('admin@test.com');
    const res = await agente
      .post('/api/admin/experiencias')
      .send(bodyValido({ incluye: Array.from({ length: 8 }, (_, i) => `  Ítem ${i + 1}  `) }));
    expect(res.status).toBe(201);
    expect(res.body.incluye[0]).toBe('Ítem 1');
  });
});

describe('PATCH /api/admin/experiencias/:id', () => {
  it('parcial: sólo precio cambia precio; incluye reemplaza el array entero', async () => {
    const agente = await loguear('admin@test.com');
    const creada = await agente.post('/api/admin/experiencias').send(bodyValido());

    const precio = await agente.patch(`/api/admin/experiencias/${creada.body.id}`).send({ precio: 100 });
    expect(precio.status).toBe(200);
    expect(precio.body).toMatchObject({ precio: 100, nombre: 'Día de spa', incluye: bodyValido().incluye });

    const incluye = await agente
      .patch(`/api/admin/experiencias/${creada.body.id}`)
      .send({ incluye: ['Masaje', 'Hydralips', 'Peinado'] });
    expect(incluye.body.incluye).toEqual(['Masaje', 'Hydralips', 'Peinado']);
  });

  it('campo no declarado ⇒ 400 BODY_INVALIDO (.strict)', async () => {
    const agente = await loguear('admin@test.com');
    const creada = await agente.post('/api/admin/experiencias').send(bodyValido());
    const res = await agente.patch(`/api/admin/experiencias/${creada.body.id}`).send({ servicioIds: [] });
    expect(res.status).toBe(400);
    expect(res.body.codigo).toBe('BODY_INVALIDO');
  });

  it('activo:false ⇒ borrado lógico (sigue en el listado admin, sale del público); activo:true reactiva', async () => {
    const agente = await loguear('admin@test.com');
    const creada = await agente.post('/api/admin/experiencias').send(bodyValido());

    const pausada = await agente.patch(`/api/admin/experiencias/${creada.body.id}`).send({ activo: false });
    expect(pausada.status).toBe(200);
    expect(pausada.body.activo).toBe(false);
    expect((await request(app).get('/api/experiencias')).body).toEqual([]);
    expect(await Experiencia.countDocuments()).toBe(1);

    const reactivada = await agente.patch(`/api/admin/experiencias/${creada.body.id}`).send({ activo: true });
    expect(reactivada.body.activo).toBe(true);
  });

  it('renombrar a uno existente ⇒ 409; :id malformado ⇒ 400; inexistente ⇒ 404', async () => {
    const agente = await loguear('admin@test.com');
    await agente.post('/api/admin/experiencias').send(bodyValido());
    const otra = await agente.post('/api/admin/experiencias').send(bodyValido({ nombre: 'Novias', orden: 1 }));

    const dup = await agente.patch(`/api/admin/experiencias/${otra.body.id}`).send({ nombre: 'día de SPA' });
    expect(dup.status).toBe(409);
    expect(dup.body.codigo).toBe('NOMBRE_DUPLICADO');

    expect((await agente.patch('/api/admin/experiencias/xyz').send({ orden: 1 })).status).toBe(400);
    expect((await agente.patch(`/api/admin/experiencias/${new Types.ObjectId()}`).send({ orden: 1 })).status).toBe(404);
  });
});

describe('GET /api/admin/experiencias', () => {
  it('lista todas, incl. inactivas, por orden asc', async () => {
    const agente = await loguear('admin@test.com');
    await agente.post('/api/admin/experiencias').send(bodyValido({ nombre: 'Combo B', orden: 2 })).expect(201);
    const a = await agente.post('/api/admin/experiencias').send(bodyValido({ nombre: 'Combo A', orden: 1 })).expect(201);
    await agente.patch(`/api/admin/experiencias/${a.body.id}`).send({ activo: false }).expect(200);

    const res = await agente.get('/api/admin/experiencias');
    expect(res.status).toBe(200);
    expect(res.body.map((e: { nombre: string }) => e.nombre)).toEqual(['Combo A', 'Combo B']);
    expect(res.body[0].activo).toBe(false);
  });

  it('GET :id ⇒ 200; inexistente ⇒ 404 EXPERIENCIA_NO_ENCONTRADA; malformado ⇒ 400 ID_INVALIDO', async () => {
    const agente = await loguear('admin@test.com');
    const creada = await agente.post('/api/admin/experiencias').send(bodyValido());

    expect((await agente.get(`/api/admin/experiencias/${creada.body.id}`)).body.nombre).toBe('Día de spa');
    const inexistente = await agente.get(`/api/admin/experiencias/${new Types.ObjectId()}`);
    expect(inexistente.status).toBe(404);
    expect(inexistente.body.codigo).toBe('EXPERIENCIA_NO_ENCONTRADA');
    const malformado = await agente.get('/api/admin/experiencias/no-es-id');
    expect(malformado.status).toBe(400);
    expect(malformado.body.codigo).toBe('ID_INVALIDO');
  });
});

describe('gate de rol', () => {
  it('profesional sobre /api/admin/experiencias ⇒ 403 en todas las rutas', async () => {
    const agente = await loguear('prof@test.com', 'profesional');
    const id = new Types.ObjectId().toString();

    expect((await agente.get('/api/admin/experiencias')).status).toBe(403);
    expect((await agente.get(`/api/admin/experiencias/${id}`)).status).toBe(403);
    expect((await agente.post('/api/admin/experiencias').send(bodyValido())).status).toBe(403);
    expect((await agente.patch(`/api/admin/experiencias/${id}`).send({ orden: 1 })).status).toBe(403);
  });
});
