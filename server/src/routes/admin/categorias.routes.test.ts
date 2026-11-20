import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Express } from 'express';
import request from 'supertest';
import { Types } from 'mongoose';
import { createApp } from '../../app';
import { Categoria, Servicio, Usuario } from '../../models';
import { hashPassword } from '../../services/password';
import { conectarDbTest, desconectarDbTest, limpiarDbTest } from '../../test/dbTestSetup';
import { conCsrf } from '../../test/httpTestHelpers';

// CRUD de categorías de servicio — modelo-datos-turnos.md §15.7.1.

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

async function crearUsuario(overrides: { email: string; rol: 'admin' | 'profesional' }) {
  const passwordHash = await hashPassword(PASSWORD);
  return Usuario.create({
    nombre: overrides.email,
    email: overrides.email,
    passwordHash,
    rol: overrides.rol,
    atiende: overrides.rol === 'profesional',
    servicios: [],
    horarios: [],
    activo: true,
  });
}

async function loguearAdmin() {
  await crearUsuario({ email: 'admin@test.com', rol: 'admin' });
  const agente = conCsrf(request.agent(app));
  const res = await agente.post('/api/auth/login').send({ email: 'admin@test.com', password: PASSWORD });
  expect(res.status).toBe(200);
  return agente;
}

function crearServicio(nombre: string, categoriaId: Types.ObjectId | null, activo = true, orden = 0) {
  return Servicio.create({
    nombre,
    duracionMin: 30,
    bufferPostMin: 0,
    precio: 100000,
    mostrarPrecio: true,
    horarios: null,
    orden,
    activo,
    categoriaId,
  });
}

describe('índice de categorias.nombre', () => {
  it('existe unique CON collation es/strength 2', async () => {
    const indices = await Categoria.collection.indexes();
    const nombre = indices.find((i) => i.key.nombre === 1);
    expect(nombre?.unique).toBe(true);
    expect(nombre?.collation).toMatchObject({ locale: 'es', strength: 2 });
  });
});

describe('POST /api/admin/categorias', () => {
  it('crear ⇒ 201 CategoriaPanel con serviciosActivos 0', async () => {
    const agente = await loguearAdmin();
    const res = await agente.post('/api/admin/categorias').send({ nombre: '  Uñas  ', orden: 0 });

    expect(res.status).toBe(201);
    expect(Object.keys(res.body).sort()).toEqual(
      ['actualizadoEn', 'creadoEn', 'id', 'nombre', 'orden', 'serviciosActivos'].sort()
    );
    expect(res.body).toMatchObject({ nombre: 'Uñas', orden: 0, serviciosActivos: 0 });
  });

  it('nombre duplicado con otra capitalización ⇒ 409 NOMBRE_DUPLICADO (no el E11000 crudo)', async () => {
    const agente = await loguearAdmin();
    await agente.post('/api/admin/categorias').send({ nombre: 'Uñas', orden: 0 }).expect(201);

    const res = await agente.post('/api/admin/categorias').send({ nombre: 'UÑAS', orden: 1 });
    expect(res.status).toBe(409);
    expect(res.body.codigo).toBe('NOMBRE_DUPLICADO');
    expect(JSON.stringify(res.body)).not.toContain('E11000');
  });

  it('nombre de 1 caracter o sin orden ⇒ 400', async () => {
    const agente = await loguearAdmin();
    expect((await agente.post('/api/admin/categorias').send({ nombre: 'U', orden: 0 })).status).toBe(400);
    expect((await agente.post('/api/admin/categorias').send({ nombre: 'Uñas' })).status).toBe(400);
  });
});

describe('PATCH /api/admin/categorias/:id', () => {
  it('edita nombre y orden', async () => {
    const agente = await loguearAdmin();
    const creada = await agente.post('/api/admin/categorias').send({ nombre: 'Uñas', orden: 0 });

    const res = await agente.patch(`/api/admin/categorias/${creada.body.id}`).send({ nombre: 'Manos y pies', orden: 3 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: creada.body.id, nombre: 'Manos y pies', orden: 3 });

    const soloOrden = await agente.patch(`/api/admin/categorias/${creada.body.id}`).send({ orden: 7 });
    expect(soloOrden.body).toMatchObject({ nombre: 'Manos y pies', orden: 7 });
  });

  it('campo no declarado ⇒ 400 BODY_INVALIDO (.strict)', async () => {
    const agente = await loguearAdmin();
    const creada = await agente.post('/api/admin/categorias').send({ nombre: 'Uñas', orden: 0 });

    const res = await agente.patch(`/api/admin/categorias/${creada.body.id}`).send({ activo: false });
    expect(res.status).toBe(400);
    expect(res.body.codigo).toBe('BODY_INVALIDO');
  });

  it('renombrar a un nombre existente ⇒ 409 NOMBRE_DUPLICADO', async () => {
    const agente = await loguearAdmin();
    await agente.post('/api/admin/categorias').send({ nombre: 'Uñas', orden: 0 });
    const cejas = await agente.post('/api/admin/categorias').send({ nombre: 'Cejas', orden: 1 });

    const res = await agente.patch(`/api/admin/categorias/${cejas.body.id}`).send({ nombre: 'uñas' });
    expect(res.status).toBe(409);
    expect(res.body.codigo).toBe('NOMBRE_DUPLICADO');
  });

  it(':id malformado ⇒ 400; inexistente ⇒ 404', async () => {
    const agente = await loguearAdmin();
    expect((await agente.patch('/api/admin/categorias/no-es-un-id').send({ orden: 1 })).status).toBe(400);
    const res = await agente.patch(`/api/admin/categorias/${new Types.ObjectId()}`).send({ orden: 1 });
    expect(res.status).toBe(404);
    expect(res.body.codigo).toBe('CATEGORIA_NO_ENCONTRADA');
  });
});

describe('GET /api/admin/categorias', () => {
  it('orden asc, desempate por nombre, con serviciosActivos correcto (no cuenta inactivos)', async () => {
    const agente = await loguearAdmin();
    const [b, a] = await Categoria.create([
      { nombre: 'Beta', orden: 1 },
      { nombre: 'alfa', orden: 1 },
      { nombre: 'Cero', orden: 0 },
    ]);
    await crearServicio('S1', b._id as Types.ObjectId);
    await crearServicio('S2', b._id as Types.ObjectId);
    await crearServicio('S3 inactivo', b._id as Types.ObjectId, false);
    await crearServicio('S4', a._id as Types.ObjectId);
    await crearServicio('S5 sin categoría', null);

    const res = await agente.get('/api/admin/categorias');
    expect(res.status).toBe(200);
    expect(res.body.map((x: { nombre: string }) => x.nombre)).toEqual(['Cero', 'alfa', 'Beta']);
    const porNombre = Object.fromEntries(
      res.body.map((x: { nombre: string; serviciosActivos: number }) => [x.nombre, x.serviciosActivos])
    );
    expect(porNombre).toEqual({ Cero: 0, alfa: 1, Beta: 2 });
  });
});

describe('DELETE /api/admin/categorias/:id', () => {
  it('sin servicios ⇒ 204 y desaparece físicamente', async () => {
    const agente = await loguearAdmin();
    const cat = await Categoria.create({ nombre: 'Uñas', orden: 0 });

    const res = await agente.delete(`/api/admin/categorias/${cat._id}`);
    expect(res.status).toBe(204);
    expect(await Categoria.findById(cat._id)).toBeNull();
  });

  it('con 1 servicio activo ⇒ 409 CATEGORIA_CON_SERVICIOS + detalle.servicios; no borra nada', async () => {
    const agente = await loguearAdmin();
    const cat = await Categoria.create({ nombre: 'Uñas', orden: 0 });
    const activo = await crearServicio('Kapping gel', cat._id as Types.ObjectId);
    const inactivo = await crearServicio('Viejo', cat._id as Types.ObjectId, false);

    const res = await agente.delete(`/api/admin/categorias/${cat._id}`);
    expect(res.status).toBe(409);
    expect(res.body.codigo).toBe('CATEGORIA_CON_SERVICIOS');
    expect(res.body.detalle.servicios).toEqual([{ id: activo._id.toString(), nombre: 'Kapping gel' }]);

    expect(await Categoria.findById(cat._id)).not.toBeNull();
    // Ni siquiera el inactivo se desasignó.
    expect((await Servicio.findById(inactivo._id).lean())!.categoriaId?.toString()).toBe(cat._id.toString());
  });

  it('con sólo inactivos ⇒ 204 y esos quedan con categoriaId null', async () => {
    const agente = await loguearAdmin();
    const cat = await Categoria.create({ nombre: 'Uñas', orden: 0 });
    const otra = await Categoria.create({ nombre: 'Cejas', orden: 1 });
    const i1 = await crearServicio('Viejo 1', cat._id as Types.ObjectId, false);
    const i2 = await crearServicio('Viejo 2', cat._id as Types.ObjectId, false);
    const ajeno = await crearServicio('Laminado', otra._id as Types.ObjectId);

    const res = await agente.delete(`/api/admin/categorias/${cat._id}`);
    expect(res.status).toBe(204);
    expect(await Categoria.findById(cat._id)).toBeNull();
    expect((await Servicio.findById(i1._id).lean())!.categoriaId).toBeNull();
    expect((await Servicio.findById(i2._id).lean())!.categoriaId).toBeNull();
    // No toca servicios de otras categorías.
    expect((await Servicio.findById(ajeno._id).lean())!.categoriaId?.toString()).toBe(otra._id.toString());
  });

  it(':id malformado ⇒ 400 (no 500 por CastError); inexistente ⇒ 404', async () => {
    const agente = await loguearAdmin();
    const malformado = await agente.delete('/api/admin/categorias/xyz');
    expect(malformado.status).toBe(400);
    expect(malformado.body.codigo).toBe('ID_INVALIDO');
    expect((await agente.delete(`/api/admin/categorias/${new Types.ObjectId()}`)).status).toBe(404);
  });
});

describe('gate de rol', () => {
  it('profesional sobre /api/admin/categorias ⇒ 403 en todas las rutas', async () => {
    await crearUsuario({ email: 'prof@test.com', rol: 'profesional' });
    const agente = conCsrf(request.agent(app));
    await agente.post('/api/auth/login').send({ email: 'prof@test.com', password: PASSWORD }).expect(200);
    const id = new Types.ObjectId().toString();

    expect((await agente.get('/api/admin/categorias')).status).toBe(403);
    expect((await agente.post('/api/admin/categorias').send({ nombre: 'Uñas', orden: 0 })).status).toBe(403);
    expect((await agente.patch(`/api/admin/categorias/${id}`).send({ orden: 1 })).status).toBe(403);
    expect((await agente.delete(`/api/admin/categorias/${id}`)).status).toBe(403);
  });
});
