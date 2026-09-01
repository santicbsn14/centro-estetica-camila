import 'dotenv/config';
import '../models';
import { connectDB, disconnectDB } from '../config/db';
import { Usuario, Configuracion } from '../models';
import { hashPassword } from '../services/password';

// Idempotente: crea el admin si no existe; si ya existe, sólo asegura
// rol/atiende/activo (no pisa una contraseña ya cambiada desde el panel).
// No hay ruta pública de registro — este script es la única puerta de entrada.
async function seedAdmin(): Promise<void> {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error('Faltan las variables de entorno SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD');
  }

  const emailNormalizado = email.toLowerCase();
  const existente = await Usuario.findOne({ email: emailNormalizado });

  if (existente) {
    existente.rol = 'admin';
    existente.atiende = true;
    existente.activo = true;
    await existente.save();
    console.log(`Admin ${emailNormalizado} ya existía — rol/atiende/activo asegurados.`);
  } else {
    const passwordHash = await hashPassword(password);
    await Usuario.create({
      nombre: 'Admin',
      email: emailNormalizado,
      passwordHash,
      rol: 'admin',
      atiende: true,
      servicios: [],
      horarios: [],
      activo: true,
    });
    console.log(`Admin ${emailNormalizado} creado.`);
  }
}

// Idempotente, junto al seed del admin (§16). El GET /api/admin/configuracion
// asume que el singleton existe y NO lo auto-crea — si falta, es señal de que
// este seed no corrió. $setOnInsert-equivalente vía find-then-create (mismo
// patrón que seedAdmin, no atómico pero alcanza para un script manual/deploy):
// si ya existe, no se pisa nada, ni siquiera para "arreglar" un valor.
async function seedConfiguracion(): Promise<void> {
  const existente = await Configuracion.findById('centro');
  if (existente) {
    console.log('Configuración ("centro") ya existía — no se modificó.');
    return;
  }

  await Configuracion.create({
    _id: 'centro',
    // Placeholders: Camila los completa por PATCH desde el panel. El nombre
    // real del negocio no hace falta adivinarlo dos veces (ya está en
    // CLAUDE.md); contacto y horarios sí son datos que no tenemos.
    nombre: 'Camila González Belleza',
    timezone: 'America/Argentina/Buenos_Aires',
    horarios: [
      { dia: 1, bloques: [{ desde: '09:00', hasta: '18:00' }] },
      { dia: 2, bloques: [{ desde: '09:00', hasta: '18:00' }] },
      { dia: 3, bloques: [{ desde: '09:00', hasta: '18:00' }] },
      { dia: 4, bloques: [{ desde: '09:00', hasta: '18:00' }] },
      { dia: 5, bloques: [{ desde: '09:00', hasta: '18:00' }] },
    ],
    pasoGrillaMin: 30,
    antelacionMinimaHoras: 3,
    ventanaMaximaDias: 60,
    cancelacionMinimaHoras: 24,
    vencimientoPendienteHoras: 12,
    contacto: {
      telefonoE164: '+5493364000000',
      email: 'contacto@completar.com',
      direccion: 'Completar dirección',
    },
  });
  console.log('Configuración ("centro") creada con defaults — completar nombre/contacto/horarios desde el panel.');
}

async function main(): Promise<void> {
  await connectDB();
  await seedAdmin();
  await seedConfiguracion();
  await disconnectDB();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
