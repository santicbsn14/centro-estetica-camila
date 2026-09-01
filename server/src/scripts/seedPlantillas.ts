import 'dotenv/config';
import '../models';
import { connectDB, disconnectDB } from '../config/db';
import { Plantilla } from '../models';

// Las cinco plantillas de WhatsApp aprobadas por Meta (21/08/2026, ver
// modelo-datos-turnos.md §8). El orden de `variables` ES el contrato
// posicional — no reordenar sin cambiar el mapeo en whatsapp.ts.
const PLANTILLAS_WHATSAPP = [
  {
    tipo: 'solicitud',
    metaNombre: 'turno_solicitud',
    contentSid: 'HX49779c4e2e9c6edb7e1debc2ce8c89f8',
    variables: ['nombre', 'servicio', 'fecha', 'hora'],
  },
  {
    tipo: 'confirmacion',
    metaNombre: 'turno_confirmado',
    contentSid: 'HX741ec2158022acd9d3c4872a3b6448c7',
    variables: ['nombre', 'servicio', 'fecha', 'hora', 'profesional'],
  },
  {
    tipo: 'recordatorio_24h',
    metaNombre: 'turno_recordatorio',
    contentSid: 'HXe134407ff84adbbb9e5c1b085e50c9dc',
    variables: ['nombre', 'fecha', 'hora', 'servicio'],
  },
  {
    tipo: 'cancelacion',
    metaNombre: 'turno_cancelado',
    contentSid: 'HXc2265e76efdbca76145ffc2fa901b468',
    variables: ['nombre', 'fecha', 'hora', 'servicio'],
  },
  {
    tipo: 'rechazo',
    metaNombre: 'turno_rechazado',
    contentSid: 'HX78e2d34ed5c02f5c21a1a340829b7534',
    variables: ['nombre', 'fecha', 'hora'],
  },
] as const;

// Idempotente: upsert por tipo+canal (mismo par que el índice único de
// plantilla.model.ts), $setOnInsert puro — si ya existe, no se pisa nada
// (mismo criterio que seedConfiguracion() en seedAdmin.ts: un admin puede
// haber editado la plantilla desde el panel, este script no debe volver
// atrás ese cambio en cada deploy).
export async function seedPlantillas(): Promise<void> {
  for (const plantilla of PLANTILLAS_WHATSAPP) {
    const resultado = await Plantilla.updateOne(
      { tipo: plantilla.tipo, canal: 'whatsapp' },
      {
        $setOnInsert: {
          tipo: plantilla.tipo,
          canal: 'whatsapp',
          metaNombre: plantilla.metaNombre,
          metaIdioma: 'es_AR',
          metaEstado: 'aprobada',
          contentSid: plantilla.contentSid,
          variables: [...plantilla.variables],
          activa: true,
        },
      },
      { upsert: true }
    );

    if (resultado.upsertedCount > 0) {
      console.log(`Plantilla '${plantilla.tipo}' (whatsapp) creada — contentSid ${plantilla.contentSid}.`);
    } else {
      console.log(`Plantilla '${plantilla.tipo}' (whatsapp) ya existía — no se modificó.`);
    }
  }
}

async function main(): Promise<void> {
  await connectDB();
  await seedPlantillas();
  await disconnectDB();
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
