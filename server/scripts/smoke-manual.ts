/**
 * Smoke test manual — NO es parte de la suite (no lo corre vitest, no está
 * en src/, no lo toca ningún build: server/tsconfig.json sólo incluye
 * "src"). Un solo uso, descartable, para ver el flujo completo andar una
 * vez con logs legibles: creación pública de turno → aprobar → un ciclo del
 * worker → cancelar → otro ciclo del worker. Cada pieza ya tiene su test
 * automatizado en aislado (§14); esto verifica que ENCAJEN juntas.
 *
 * Referencias: modelo-datos-turnos.md §15.1 (creación), §15.4/§15.5
 * (transiciones), §7 (worker), §4 (código de turno), §17 últimas 4 entradas
 * (worker real, fix de orden de cancelación, código de turno, rate limit).
 *
 * Corrida (desde server/, mismo patrón que "seed:admin" en package.json):
 *   npx tsx scripts/smoke-manual.ts
 *
 * Contra una MongoMemoryReplSet real (mismo patrón que dbTestSetup.ts —
 * las transiciones usan session.withTransaction, requiere replica set). No
 * limpia al final más que apagar el mongod descartable: no hay nada
 * productivo que proteger acá.
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { DateTime } from 'luxon';
import request from 'supertest';

import { conectarDbTest, desconectarDbTest } from '../src/test/dbTestSetup';
import { createApp } from '../src/app';
import { Usuario, Servicio, Turno, Notificacion, Configuracion } from '../src/models';
import { hashPassword } from '../src/services/password';
import { cicloWorker } from '../src/worker';

const ZONE = 'America/Argentina/Buenos_Aires';
const ADMIN_EMAIL = 'admin.smoke@test.com';
const ADMIN_PASSWORD = 'AdminSmoke123!';

function seccion(titulo: string): void {
  console.log(`\n${'='.repeat(70)}\n${titulo}\n${'='.repeat(70)}`);
}

// Horarios "reales" del centro: Lun-Vie 09:00-18:00 — mismo dato que usa
// scripts/seedAdmin.ts para el placeholder de configuración (no un horario
// inventado aparte).
function horarioLunAVier(desde = '09:00', hasta = '18:00') {
  return [1, 2, 3, 4, 5].map((dia) => ({ dia, bloques: [{ desde, hasta }] }));
}

// Próximo día hábil (Lun-Vie) a una hora fija, al menos `minDias` desde hoy —
// así el turno queda siempre > antelacionMinimaHoras (3h, seedAdmin.ts) y,
// eligiendo minDias=2, también > 24h (para que encolarConfirmacion cree el
// recordatorio_24h, §7 — queremos demostrar ese caso, no el borde).
function proximoDiaHabilA(hora: number, minDias: number): DateTime {
  let dt = DateTime.now().setZone(ZONE).plus({ days: minDias }).set({ hour: hora, minute: 0, second: 0, millisecond: 0 });
  while (dt.weekday > 5) dt = dt.plus({ days: 1 }); // 6=sábado, 7=domingo (Luxon)
  return dt;
}

async function imprimirNotificaciones(titulo: string, turnoId: unknown): Promise<void> {
  const notifs = await Notificacion.find({ turnoId }).sort({ creadaEn: 1 }).lean();
  console.log(`\n-- Notificaciones (${titulo}) --`);
  console.table(
    notifs.map((n) => ({
      tipo: n.tipo,
      canal: n.canal,
      estado: n.estado,
      programadaPara: n.programadaPara.toISOString(),
      enviadaEn: n.enviadaEn ? n.enviadaEn.toISOString() : '',
    }))
  );
}

async function main(): Promise<void> {
  seccion('0. Levantando MongoMemoryReplSet (mismo patrón que dbTestSetup.ts)');
  const mongoUrl = await conectarDbTest();
  console.log('Réplica en memoria arriba:', mongoUrl);

  seccion('1a. Sembrando admin + configuración (reusando scripts/seedAdmin.ts como subproceso)');
  // Subproceso, no import directo: seedAdmin.ts corre su propio connectDB()/
  // disconnectDB() a nivel de módulo (ver main() al final del archivo) — si
  // se importara acá, el disconnect() de ESE script cortaría la conexión
  // mongoose que este script necesita para el resto del flujo. Como
  // subproceso, abre y cierra SU PROPIA conexión al mismo mongoUrl sin
  // interferir con la nuestra.
  const seedAdminPath = path.resolve(__dirname, '..', 'src', 'scripts', 'seedAdmin.ts');
  const resultadoSeed = spawnSync('npx', ['tsx', seedAdminPath], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, MONGODB_URI: mongoUrl, SEED_ADMIN_EMAIL: ADMIN_EMAIL, SEED_ADMIN_PASSWORD: ADMIN_PASSWORD },
    stdio: 'inherit',
    shell: true,
  });
  if (resultadoSeed.status !== 0) {
    throw new Error('seedAdmin.ts (subproceso) terminó con error — ver output arriba');
  }

  const admin = await Usuario.findOne({ email: ADMIN_EMAIL }).lean();
  const config = await Configuracion.findById('centro').lean();
  if (!admin || !config) {
    throw new Error('seedAdmin.ts corrió pero no dejó admin/configuración — revisar el subproceso');
  }
  console.log(`Admin OK: ${admin.email} (rol=${admin.rol}). Configuración OK: horarios con ${config.horarios?.length ?? 0} día(s).`);

  seccion('1b. Sembrando servicio + profesional (directo con los modelos — esto no es "el flujo real", es catálogo)');
  const servicio = await Servicio.create({
    nombre: 'Corte y Peinado (smoke)',
    descripcion: 'Servicio de prueba para el smoke test manual',
    duracionMin: 60,
    bufferPostMin: 15,
    precio: 1_500_000, // centavos (§3) — $15.000
    mostrarPrecio: true,
    horarios: null, // hereda horario del centro/profesional
    orden: 0,
    activo: true,
  });

  const profesionalPasswordHash = await hashPassword('ProfesionalSmoke123!');
  const profesional = await Usuario.create({
    nombre: 'Profesional Smoke',
    email: 'profesional.smoke@test.com',
    passwordHash: profesionalPasswordHash,
    rol: 'profesional',
    atiende: true,
    servicios: [servicio._id],
    horarios: horarioLunAVier(),
    activo: true,
  });
  console.log(`Servicio: ${servicio.nombre} (${servicio._id}). Profesional: ${profesional.nombre} (${profesional._id}).`);

  const app = createApp({ mongoUrl, sessionSecret: 'smoke-test-secret', panelOrigin: 'http://localhost:5173' });

  // ------------------------------------------------------------------
  seccion('2. POST /api/turnos — flujo público real (§15.1)');
  const inicioLocal = proximoDiaHabilA(10, 2); // 10:00, al menos 2 días hábiles adelante
  const inicioISO = inicioLocal.toUTC().toISO()!;
  console.log(`Reservando ${inicioLocal.toFormat('cccc dd/LL/yyyy HH:mm')} (${ZONE}) → ${inicioISO} UTC`);

  const resCreacion = await request(app)
    .post('/api/turnos')
    .send({
      servicioId: servicio._id.toString(),
      profesionalId: profesional._id.toString(),
      inicio: inicioISO,
      nombre: 'Clienta Smoke',
      telefono: '+54 9 336 4123456',
      email: 'clienta.smoke@test.com',
    });

  console.log('Status:', resCreacion.status);
  console.log('Body:', resCreacion.body);

  if (resCreacion.status !== 201) {
    throw new Error(`Esperaba 201 creando el turno, llegó ${resCreacion.status} — ver body arriba`);
  }

  const anioActual = DateTime.now().setZone(ZONE).year;
  const formatoOk = new RegExp(`^TRN-${anioActual}-\\d{4}$`).test(resCreacion.body.codigo);
  console.log(
    formatoOk
      ? `✔ Código con formato esperado TRN-${anioActual}-#### (§4): ${resCreacion.body.codigo}`
      : `✘ Código NO tiene el formato esperado TRN-${anioActual}-####: ${resCreacion.body.codigo}`
  );
  console.log(resCreacion.body.estado === 'pendiente' ? "✔ Estado 'pendiente' como se espera" : `✘ Estado inesperado: ${resCreacion.body.estado}`);

  const turnoCreado = await Turno.findOne({ codigo: resCreacion.body.codigo });
  if (!turnoCreado) throw new Error('El turno no aparece en la base tras el 201 — inconsistencia grave');
  const turnoId = turnoCreado._id;

  await imprimirNotificaciones('tras crear', turnoId);
  const notifSolicitud = await Notificacion.findOne({ turnoId, tipo: 'solicitud' }).lean();
  console.log(
    notifSolicitud?.estado === 'pendiente'
      ? "✔ Notificación 'solicitud' encolada en 'pendiente'"
      : `✘ 'solicitud' no está 'pendiente': ${notifSolicitud?.estado ?? '(no existe)'}`
  );

  // ------------------------------------------------------------------
  seccion('3. Aprobar el turno — transición real vía panel (§15.4), login de admin incluido (§16)');
  const agente = request.agent(app);
  const resLogin = await agente.post('/api/auth/login').send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  if (resLogin.status !== 200) throw new Error(`Login de admin falló: ${resLogin.status} ${JSON.stringify(resLogin.body)}`);
  console.log('Admin logueado OK.');

  const resAprobar = await agente.post(`/api/turnos/${turnoId}/aprobar`);
  console.log('Status:', resAprobar.status);
  console.log('Estado del turno tras aprobar:', resAprobar.body.estado);
  console.log(resAprobar.body.estado === 'confirmado' ? "✔ Estado 'confirmado' como se espera" : `✘ Estado inesperado: ${resAprobar.body.estado}`);

  await imprimirNotificaciones('tras aprobar', turnoId);
  const antelacionHoras = (inicioLocal.toMillis() - Date.now()) / 3600_000;
  console.log(`(Antelación del turno al momento de aprobar: ~${antelacionHoras.toFixed(1)}h — se eligió >24h a propósito)`);
  // canal:'whatsapp' explícito: 'confirmacion' tiene dos documentos (whatsapp
  // + email, la clienta dejó email) y un findOne sin filtrar por canal es no
  // determinístico sobre cuál de los dos trae — el whatsapp es el que el
  // worker efectivamente procesa (el canal email queda fuera, TODO conocido
  // en §13/§17), así que es el que importa para estas verificaciones.
  const notifConfirmacion = await Notificacion.findOne({ turnoId, tipo: 'confirmacion', canal: 'whatsapp' }).lean();
  const notifRecordatorio = await Notificacion.findOne({ turnoId, tipo: 'recordatorio_24h' }).lean();
  console.log(
    notifConfirmacion?.estado === 'pendiente'
      ? "✔ Notificación 'confirmacion' (whatsapp) encolada en 'pendiente'"
      : `✘ 'confirmacion' (whatsapp) no está 'pendiente': ${notifConfirmacion?.estado ?? '(no existe)'}`
  );
  console.log(
    notifRecordatorio?.estado === 'pendiente'
      ? "✔ Notificación 'recordatorio_24h' encolada en 'pendiente' (turno con >24h de anticipación, §7)"
      : `✘ 'recordatorio_24h' no está 'pendiente': ${notifRecordatorio?.estado ?? '(no existe — inesperado con >24h de antelación)'}`
  );

  // ------------------------------------------------------------------
  seccion('4. Primer ciclo del worker — cicloWorker() manual, sin setInterval (§7)');
  await cicloWorker();
  await imprimirNotificaciones('tras 1er ciclo del worker', turnoId);
  const confirmacionTrasCiclo1 = await Notificacion.findOne({ turnoId, tipo: 'confirmacion', canal: 'whatsapp' }).lean();
  console.log(
    confirmacionTrasCiclo1?.estado === 'enviada'
      ? "✔ 'confirmacion' (whatsapp) pasó a 'enviada' (mock de Twilio con éxito por default, whatsapp.ts)"
      : `✘ 'confirmacion' (whatsapp) no quedó 'enviada': ${confirmacionTrasCiclo1?.estado}`
  );
  const confirmacionEmailTrasCiclo1 = await Notificacion.findOne({ turnoId, tipo: 'confirmacion', canal: 'email' }).lean();
  console.log(
    `(De paso, 'confirmacion' canal EMAIL quedó '${confirmacionEmailTrasCiclo1?.estado}' — esperado que siga 'pendiente': el worker sólo reclama canal:'whatsapp', TODO conocido en §13/§17, no un bug de este smoke test.)`
  );
  const solicitudTrasCiclo1 = await Notificacion.findOne({ turnoId, tipo: 'solicitud' }).lean();
  console.log(
    `(De paso, 'solicitud' —pendiente desde el paso 2, mismo lote— quedó: ${solicitudTrasCiclo1?.estado}. Es esperable que también se haya enviado: el worker no distingue "vieja" de "nueva", sólo pendiente-y-vencida.)`
  );

  // ------------------------------------------------------------------
  seccion('5. Cancelar el turno — transición real (§15.5) — el punto más importante a mirar');
  const resCancelar = await agente.post(`/api/turnos/${turnoId}/cancelar`).send({ motivo: 'Smoke test manual' });
  console.log('Status:', resCancelar.status);
  console.log('Estado del turno tras cancelar:', resCancelar.body.estado);
  console.log(resCancelar.body.estado === 'cancelado' ? "✔ Estado 'cancelado' como se espera" : `✘ Estado inesperado: ${resCancelar.body.estado}`);

  await imprimirNotificaciones('tras cancelar', turnoId);
  // canal:'whatsapp' explícito — mismo motivo que en 'confirmacion' más arriba.
  const notifCancelacion = await Notificacion.findOne({ turnoId, tipo: 'cancelacion', canal: 'whatsapp' }).lean();
  const notifRecordatorioTrasCancelar = await Notificacion.findOne({ turnoId, tipo: 'recordatorio_24h' }).lean();
  console.log(
    '>>> PUNTO CRÍTICO (fix de orden §17, "Fix: orden de cancelarNotificacionesPendientes"):'
  );
  console.log(
    notifCancelacion?.estado === 'pendiente'
      ? "✔ 'cancelacion' (whatsapp) quedó 'pendiente' (el fix de orden está funcionando — antes del fix nacía 'cancelada' por error)"
      : `✘✘✘ REGRESIÓN: 'cancelacion' (whatsapp) quedó '${notifCancelacion?.estado}', se esperaba 'pendiente'. Esto es exactamente el bug que describe §17 ("Fix: orden de cancelarNotificacionesPendientes") — revisar encolarCancelacion en turnos.service.ts, el orden puede haberse roto de nuevo.`
  );
  console.log(
    notifRecordatorioTrasCancelar?.estado === 'cancelada'
      ? "✔ 'recordatorio_24h' (que estaba pendiente de antes) pasó a 'cancelada'"
      : `✘ 'recordatorio_24h' no quedó 'cancelada': ${notifRecordatorioTrasCancelar?.estado}`
  );

  // ------------------------------------------------------------------
  seccion('6. Segundo ciclo del worker — debe enviar la cancelación, no tocar el recordatorio ya cancelado');
  await cicloWorker();
  await imprimirNotificaciones('tras 2do ciclo del worker', turnoId);
  const cancelacionTrasCiclo2 = await Notificacion.findOne({ turnoId, tipo: 'cancelacion', canal: 'whatsapp' }).lean();
  const recordatorioTrasCiclo2 = await Notificacion.findOne({ turnoId, tipo: 'recordatorio_24h' }).lean();
  console.log(
    cancelacionTrasCiclo2?.estado === 'enviada'
      ? "✔ 'cancelacion' (whatsapp) pasó a 'enviada'"
      : `✘ 'cancelacion' (whatsapp) no quedó 'enviada': ${cancelacionTrasCiclo2?.estado}`
  );
  console.log(
    recordatorioTrasCiclo2?.estado === 'cancelada'
      ? "✔ 'recordatorio_24h' se mantuvo 'cancelada' (el worker no la tocó ni intentó enviarla)"
      : `✘ 'recordatorio_24h' cambió de estado inesperadamente: ${recordatorioTrasCiclo2?.estado}`
  );

  // ------------------------------------------------------------------
  seccion('7. Resumen final — todas las notificaciones del turno');
  const turnoFinal = await Turno.findById(turnoId).lean();
  console.log(`Turno ${turnoFinal!.codigo} — estado final: ${turnoFinal!.estado}`);
  const notifsFinales = await Notificacion.find({ turnoId }).sort({ creadaEn: 1 }).lean();
  console.table(
    notifsFinales.map((n) => ({
      tipo: n.tipo,
      canal: n.canal,
      estadoFinal: n.estado,
      intentos: n.intentos,
      programadaPara: n.programadaPara.toISOString(),
      enviadaEn: n.enviadaEn ? n.enviadaEn.toISOString() : '',
    }))
  );

  seccion('Smoke test terminado — revisar los ✔/✘ arriba');
}

main()
  .catch((err) => {
    console.error('\n✘✘✘ SMOKE TEST FALLÓ ✘✘✘');
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    // Apaga el mongod descartable para que el proceso termine solo — no es
    // "limpieza de datos" (no hace falta, es de un solo uso), es simplemente
    // no dejar un mongod huérfano corriendo en la máquina.
    await desconectarDbTest();
  });
