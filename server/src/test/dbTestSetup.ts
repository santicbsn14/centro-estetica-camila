import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';

// Replica set de un solo nodo en memoria — no un standalone: aprobar/rechazar/
// ausente y la creación de turno usan session.withTransaction, que Mongo
// rechaza fuera de un replica set ("Transaction numbers are only allowed on a
// replica set member or mongos"). Import de '../models' en cada test file
// registra los modelos antes de usarlos.

let mongod: MongoMemoryReplSet | undefined;

/** Devuelve la URI en memoria — para inyectarla en createApp({ mongoUrl }) en
 * vez de mutar process.env.MONGODB_URI (que podría filtrarse entre archivos
 * de test que comparten worker). */
export async function conectarDbTest(): Promise<string> {
  mongod = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  const uri = mongod.getUri();
  await mongoose.connect(uri);

  // mongoose.connect() no espera a que los índices (autoIndex) terminen de
  // construirse — corren en background. Sin esto, un test que dependa de un
  // índice único (ej. la collation de servicios.nombre) puede correr contra
  // una colección que todavía no lo tiene: falso negativo, no un bug real.
  await Promise.all(Object.values(mongoose.connection.models).map((m) => m.init()));

  return uri;
}

export async function desconectarDbTest(): Promise<void> {
  await mongoose.disconnect();
  await mongod?.stop();
  mongod = undefined;
}

export async function limpiarDbTest(): Promise<void> {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
}
