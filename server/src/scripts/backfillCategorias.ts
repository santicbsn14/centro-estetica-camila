import 'dotenv/config';
import dns from 'node:dns/promises';
import '../models';
import { connectDB, disconnectDB } from '../config/db';
import { Categoria, Servicio } from '../models';

// Backfill de categorías de servicio (modelo-datos-turnos.md §15.7.1,
// DECISIÓN 2026-11-16). Uso:
//   npm run backfill:categorias --workspace=server            # dry-run (no escribe)
//   npm run backfill:categorias --workspace=server -- --apply # escribe
//
// ORDEN DE DEPLOY OBLIGATORIO: server → backfill dry-run → backfill --apply →
// panel + client-publico. Si client-publico sale antes, todo el catálogo cae
// en "Otros".
//
// Idempotente:
// - Las 6 categorías se crean con upsert por nombre + $setOnInsert: si ya
//   existen (o Camila las renombró/reordenó... ver nota abajo), no se pisan.
// - Sólo se asigna categoriaId a servicios SIN categoriaId (null o ausente).
//   Un servicio que Camila ya categorizó desde el panel no se toca.
// Incluye inactivos (si se reactivan, ya vuelven con su categoría).
//
// Nota: el upsert es por nombre exacto con la collation del índice (es,
// strength 2). Si Camila renombra "Uñas" antes de correr esto, la segunda
// corrida crearía una "Uñas" nueva — por eso se corre una vez, en el deploy.

// Sentence case, orden 0-5 en el orden que tenía el catálogo hasta hoy.
export const CATEGORIAS_INICIALES = [
  'Uñas',
  'Cejas',
  'Pestañas',
  'Tratamientos faciales',
  'Masajes',
  'Maquillaje y peinado',
] as const;

type CategoriaInicial = (typeof CATEGORIAS_INICIALES)[number];

// COPIA del mapeo NOMBRE_A_CATEGORIA de
// client-publico/src/routes/reserva/constants.ts (borrado de ahí en esta
// misma tarea). Claves en minúscula, match trim + lowercase. Incluye la clave
// muerta 'limpieza profunda + espátula ultrasónica' (frontend.md 2026-11-05):
// inofensiva, se copió tal cual.
const NOMBRE_A_CATEGORIA: Record<string, CategoriaInicial> = {
  'esmaltado semipermanente': 'Uñas',
  'kapping gel': 'Uñas',
  'extensión soft gel': 'Uñas',
  'semis en manos y pies': 'Uñas',
  'soft gel en manos y semis en pies': 'Uñas',
  retirados: 'Uñas',

  'diseño y perfilado de cejas': 'Cejas',
  'laminado de cejas': 'Cejas',

  'lifting tradicional': 'Pestañas',
  'lifting técnica coreana': 'Pestañas',

  'limpieza profunda + espátula ultrasónica': 'Tratamientos faciales',
  'limpieza profunda + peeling químico + masaje anti age': 'Tratamientos faciales',
  'limpieza profunda + electroporador + espátula ultrasónica': 'Tratamientos faciales',
  'limpieza profunda + máscara led y máscara gold': 'Tratamientos faciales',
  'limpieza facial profunda': 'Tratamientos faciales',
  'limpieza + dermapen': 'Tratamientos faciales',
  dermaplaning: 'Tratamientos faciales',
  hydralips: 'Tratamientos faciales',

  'reflexología podal': 'Masajes',
  'reflexología podal opción 2': 'Masajes',

  'maquillaje social': 'Maquillaje y peinado',
  peinados: 'Maquillaje y peinado',
};

const COLLATION_NOMBRE = { locale: 'es', strength: 2 } as const;

export interface ResultadoBackfill {
  aplicado: boolean;
  categoriasCreadas: string[];
  categoriasExistentes: string[];
  asignados: { servicio: string; categoria: CategoriaInicial }[];
  sinMatch: string[];
  yaCategorizados: number;
}

export async function backfillCategorias({ apply }: { apply: boolean }): Promise<ResultadoBackfill> {
  const resultado: ResultadoBackfill = {
    aplicado: apply,
    categoriasCreadas: [],
    categoriasExistentes: [],
    asignados: [],
    sinMatch: [],
    yaCategorizados: 0,
  };

  // 1) Categorías. En dry-run sólo se consulta cuáles faltan.
  const idPorNombre = new Map<CategoriaInicial, string | null>();
  for (const [orden, nombre] of CATEGORIAS_INICIALES.entries()) {
    const existente = await Categoria.findOne({ nombre }).collation(COLLATION_NOMBRE).select('_id').lean();
    if (existente) {
      resultado.categoriasExistentes.push(nombre);
      idPorNombre.set(nombre, existente._id.toString());
      continue;
    }

    resultado.categoriasCreadas.push(nombre);
    if (!apply) {
      idPorNombre.set(nombre, null); // se crearía
      continue;
    }

    await Categoria.updateOne(
      { nombre },
      { $setOnInsert: { nombre, orden } },
      { upsert: true, collation: COLLATION_NOMBRE }
    );
    const creada = await Categoria.findOne({ nombre }).collation(COLLATION_NOMBRE).select('_id').lean();
    idPorNombre.set(nombre, creada!._id.toString());
  }

  // 2) Servicios sin categoría (null o campo ausente), activos e inactivos.
  const servicios = await Servicio.find({}).sort({ orden: 1 }).select('nombre categoriaId').lean();
  for (const servicio of servicios) {
    if (servicio.categoriaId) {
      resultado.yaCategorizados++;
      continue;
    }

    const categoria = NOMBRE_A_CATEGORIA[servicio.nombre.trim().toLowerCase()];
    if (!categoria) {
      resultado.sinMatch.push(servicio.nombre);
      continue;
    }

    resultado.asignados.push({ servicio: servicio.nombre, categoria });
    if (apply) {
      // Filtro con "sin categoría" también en el update: si entre el find y
      // acá alguien la asignó desde el panel, no se pisa.
      await Servicio.updateOne(
        { _id: servicio._id, $or: [{ categoriaId: null }, { categoriaId: { $exists: false } }] },
        { $set: { categoriaId: idPorNombre.get(categoria) } }
      );
    }
  }

  return resultado;
}

function imprimir(r: ResultadoBackfill): void {
  const modo = r.aplicado ? 'APLICADO' : 'DRY-RUN (no se escribió nada — usar --apply)';
  console.log(`\n=== backfill:categorias — ${modo} ===`);
  console.log(`Categorías ${r.aplicado ? 'creadas' : 'a crear'}: ${r.categoriasCreadas.join(', ') || '(ninguna)'}`);
  console.log(`Categorías ya existentes: ${r.categoriasExistentes.join(', ') || '(ninguna)'}`);
  console.log(`Servicios ya categorizados (no se tocan): ${r.yaCategorizados}`);
  console.log(`Servicios ${r.aplicado ? 'asignados' : 'a asignar'}: ${r.asignados.length}`);
  for (const a of r.asignados) console.log(`  - ${a.servicio} → ${a.categoria}`);
  if (r.sinMatch.length > 0) {
    console.log(`⚠ Sin match (quedan en null ⇒ "Otros"): ${r.sinMatch.length}`);
    for (const nombre of r.sinMatch) console.log(`  - ${nombre}`);
  } else {
    console.log('Sin match: 0');
  }
}

async function main(): Promise<void> {
  // Mismo workaround de DNS que seedAdmin/seedPlantillas para resolver el
  // SRV de Atlas desde la máquina local.
  dns.setServers(['1.1.1.1', '8.8.8.8']);
  const apply = process.argv.includes('--apply');
  await connectDB();
  try {
    imprimir(await backfillCategorias({ apply }));
  } finally {
    await disconnectDB();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
