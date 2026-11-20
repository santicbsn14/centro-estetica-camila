import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Types } from 'mongoose';
import { Categoria, Servicio } from '../models';
import { conectarDbTest, desconectarDbTest, limpiarDbTest } from '../test/dbTestSetup';
import { backfillCategorias, CATEGORIAS_INICIALES } from './backfillCategorias';

// Backfill de categorías (modelo-datos-turnos.md §15.7.1).

beforeAll(async () => {
  await conectarDbTest();
}, 300_000);

afterEach(async () => {
  await limpiarDbTest();
  vi.restoreAllMocks();
});

afterAll(async () => {
  await desconectarDbTest();
});

const base = { duracionMin: 30, bufferPostMin: 0, precio: 100000, mostrarPrecio: true, horarios: null };

async function sembrarServicios() {
  await Servicio.create([
    { ...base, nombre: 'Kapping gel', orden: 0, activo: true },
    { ...base, nombre: '  Laminado de CEJAS ', orden: 1, activo: true }, // trim + lowercase
    { ...base, nombre: 'Peinados', orden: 2, activo: false }, // inactivo: también se asigna
    { ...base, nombre: 'Servicio nuevo raro', orden: 3, activo: true }, // sin match
  ]);
  // Documento previo al campo, sin categoriaId en Mongo.
  await Servicio.collection.insertOne({
    ...base,
    nombre: 'Dermaplaning',
    orden: 4,
    activo: true,
    creadoEn: new Date(),
    actualizadoEn: new Date(),
  });
}

async function snapshot() {
  const categorias = await Categoria.find({}).sort({ orden: 1 }).lean();
  const servicios = await Servicio.find({}).sort({ orden: 1 }).lean();
  return {
    categorias: categorias.map((c) => ({ id: c._id.toString(), nombre: c.nombre, orden: c.orden })),
    servicios: servicios.map((s) => ({ nombre: s.nombre, categoriaId: s.categoriaId ? s.categoriaId.toString() : null })),
  };
}

describe('backfillCategorias', () => {
  it('dry-run no escribe nada, pero reporta lo que haría', async () => {
    await sembrarServicios();
    const antes = await snapshot();

    const r = await backfillCategorias({ apply: false });

    expect(await snapshot()).toEqual(antes);
    expect(await Categoria.countDocuments()).toBe(0);
    expect(r.aplicado).toBe(false);
    expect(r.categoriasCreadas).toEqual([...CATEGORIAS_INICIALES]);
    expect(r.asignados.map((a) => a.servicio).sort()).toEqual(
      ['Kapping gel', 'Laminado de CEJAS', 'Peinados', 'Dermaplaning'].sort()
    );
    expect(r.sinMatch).toEqual(['Servicio nuevo raro']);
  });

  it('--apply crea las 6 en sentence case con orden 0-5 y asigna según el mapeo (incl. inactivos)', async () => {
    await sembrarServicios();
    const r = await backfillCategorias({ apply: true });

    const { categorias, servicios } = await snapshot();
    expect(categorias.map((c) => [c.nombre, c.orden])).toEqual(CATEGORIAS_INICIALES.map((n, i) => [n, i]));
    const idDe = Object.fromEntries(categorias.map((c) => [c.nombre, c.id]));
    const catDe = Object.fromEntries(servicios.map((s) => [s.nombre, s.categoriaId]));

    expect(catDe['Kapping gel']).toBe(idDe['Uñas']);
    expect(catDe['Laminado de CEJAS']).toBe(idDe['Cejas']); // el modelo trimea al guardar
    expect(catDe['Peinados']).toBe(idDe['Maquillaje y peinado']);
    expect(catDe['Dermaplaning']).toBe(idDe['Tratamientos faciales']);
    expect(catDe['Servicio nuevo raro']).toBeNull();
    expect(r.sinMatch).toEqual(['Servicio nuevo raro']);
  });

  it('segunda corrida no cambia nada; no pisa categorías ya asignadas ni categorías editadas', async () => {
    await sembrarServicios();
    await backfillCategorias({ apply: true });

    // Camila edita desde el panel: reordena una categoría y mueve un servicio.
    const otra = await Categoria.create({ nombre: 'Promos', orden: 9 });
    await Categoria.updateOne({ nombre: 'Uñas' }, { $set: { orden: 42 } });
    await Servicio.updateOne({ nombre: 'Kapping gel' }, { $set: { categoriaId: otra._id } });
    const antes = await snapshot();

    const r = await backfillCategorias({ apply: true });

    expect(await snapshot()).toEqual(antes);
    expect(r.categoriasCreadas).toEqual([]);
    expect(r.asignados).toEqual([]);
    expect(r.sinMatch).toEqual(['Servicio nuevo raro']);
  });

  it('no duplica una categoría que ya existe con otra capitalización', async () => {
    await Categoria.create({ nombre: 'UÑAS', orden: 0 });
    await Servicio.create({ ...base, nombre: 'Kapping gel', orden: 0, activo: true });

    await backfillCategorias({ apply: true });

    expect(await Categoria.countDocuments()).toBe(6);
    const unas = await Categoria.findOne({ nombre: 'UÑAS' }).lean();
    const kapping = await Servicio.findOne({ nombre: 'Kapping gel' }).lean();
    expect(kapping!.categoriaId!.toString()).toBe((unas!._id as Types.ObjectId).toString());
  });
});
