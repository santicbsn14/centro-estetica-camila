import 'dotenv/config';
import '../models';
import { Types } from 'mongoose';
import { connectDB, disconnectDB } from '../config/db';
import { Cliente, Configuracion, Servicio, Turno, Usuario } from '../models';
import { hashPassword } from '../services/password';
import { PorTipoHistorial, EstadoTurno, IHistorialEntry } from '../models/turno.model';

// Datos de prueba para la pantalla de turnos del panel (frontend.md §4.4,
// tarea 3) — NO pasa por crearTurno()/ejecutarTransicion() a propósito: esas
// funciones exigen slot realmente disponible según disponibilidad.ts, y acá
// queremos control total sobre estado/fecha/expiraEn para cubrir los 6
// estados + los casos de urgencia (hot/no-hot) sin pelear contra la grilla.
// Es un insert directo al modelo, mismo criterio que seedConfiguracion() en
// seedAdmin.ts. No encola notificaciones (no hay worker corriendo en dev).
//
// Idempotente por prefijo de código: si ya hay un turno 'TRN-SEED-*', no
// vuelve a insertar (evita duplicar en cada `npm run seed:turnos`). Los
// usuarios/servicios/clientas de apoyo si son find-or-create genuino, por si
// se corrió seedAdmin.ts pero no este script todavía.

const PREFIJO_CODIGO = 'TRN-SEED-';

async function obtenerOCrearProfesional(): Promise<{ id: Types.ObjectId; nombre: string }> {
  const email = 'rocio.seed@camigonzalez.local';
  let usuario = await Usuario.findOne({ email });
  if (!usuario) {
    const passwordHash = await hashPassword(process.env.SEED_PROF_PASSWORD ?? 'Cambiar123!');
    usuario = await Usuario.create({
      nombre: 'Rocío Benítez',
      email,
      passwordHash,
      rol: 'profesional',
      atiende: true,
      servicios: [],
      horarios: [
        { dia: 1, bloques: [{ desde: '09:00', hasta: '18:00' }] },
        { dia: 2, bloques: [{ desde: '09:00', hasta: '18:00' }] },
        { dia: 3, bloques: [{ desde: '09:00', hasta: '18:00' }] },
        { dia: 4, bloques: [{ desde: '09:00', hasta: '18:00' }] },
        { dia: 5, bloques: [{ desde: '09:00', hasta: '18:00' }] },
      ],
      activo: true,
    });
    console.log(`Profesional de prueba creada: ${email} / contraseña ${process.env.SEED_PROF_PASSWORD ?? 'Cambiar123!'}`);
  }
  return { id: usuario._id as Types.ObjectId, nombre: usuario.nombre };
}

interface ServicioSeed {
  nombre: string;
  duracionMin: number;
  bufferPostMin: number;
  precio: number; // centavos
}

const SERVICIOS_SEED: ServicioSeed[] = [
  { nombre: 'Perfilado de cejas', duracionMin: 30, bufferPostMin: 5, precio: 800000 },
  { nombre: 'Manicura semipermanente', duracionMin: 60, bufferPostMin: 10, precio: 1500000 },
  { nombre: 'Limpieza facial profunda', duracionMin: 60, bufferPostMin: 15, precio: 2200000 },
  { nombre: 'Lifting de pestañas', duracionMin: 75, bufferPostMin: 10, precio: 1800000 },
];

async function obtenerOCrearServicios(): Promise<Map<string, ServicioSeed & { id: Types.ObjectId }>> {
  const mapa = new Map<string, ServicioSeed & { id: Types.ObjectId }>();
  for (const s of SERVICIOS_SEED) {
    let servicio = await Servicio.findOne({ nombre: s.nombre });
    if (!servicio) {
      servicio = await Servicio.create({
        nombre: s.nombre,
        duracionMin: s.duracionMin,
        bufferPostMin: s.bufferPostMin,
        precio: s.precio,
        mostrarPrecio: true,
        horarios: null,
        orden: SERVICIOS_SEED.indexOf(s),
        activo: true,
      });
    }
    mapa.set(s.nombre, { ...s, id: servicio._id as Types.ObjectId });
  }
  return mapa;
}

interface ClienteSeed {
  nombre: string;
  telefonoE164: string;
  email?: string;
}

async function obtenerOCrearCliente(c: ClienteSeed): Promise<Types.ObjectId> {
  let cliente = await Cliente.findOne({ telefonoE164: c.telefonoE164 });
  if (!cliente) {
    cliente = await Cliente.create({
      telefonoE164: c.telefonoE164,
      telefonoCrudo: c.telefonoE164,
      nombre: c.nombre,
      email: c.email,
      optOut: false,
    });
  }
  return cliente._id as Types.ObjectId;
}

function hist(estado: EstadoTurno, fecha: Date, porTipo: PorTipoHistorial, porId?: Types.ObjectId, motivo?: string): IHistorialEntry {
  return { estado, fecha, porTipo, porId, motivo };
}

async function main(): Promise<void> {
  await connectDB();

  const config = await Configuracion.findById('centro').lean();
  if (!config) {
    throw new Error('Falta la configuración ("centro") — corré antes "npm run seed:admin --workspace=server".');
  }
  const admin = await Usuario.findOne({ rol: 'admin' }).lean();
  if (!admin) {
    throw new Error('Falta un usuario admin — corré antes "npm run seed:admin --workspace=server".');
  }

  const yaSembrado = await Turno.exists({ codigo: { $regex: `^${PREFIJO_CODIGO}` } });
  if (yaSembrado) {
    console.log('Ya hay turnos de prueba sembrados (código TRN-SEED-*) — no se vuelve a insertar. Nada que hacer.');
    await disconnectDB();
    return;
  }

  const rocio = await obtenerOCrearProfesional();
  const camila = { id: admin._id as Types.ObjectId, nombre: admin.nombre };
  const servicios = await obtenerOCrearServicios();

  const clientes = {
    sofia: await obtenerOCrearCliente({ nombre: 'Sofía Ramírez', telefonoE164: '+5493415552847', email: 'sofiar@gmail.com' }),
    malena: await obtenerOCrearCliente({ nombre: 'Malena Ortiz', telefonoE164: '+5493414418890' }),
    julieta: await obtenerOCrearCliente({ nombre: 'Julieta Sosa', telefonoE164: '+5493415560012', email: 'juli.sosa@gmail.com' }),
    abril: await obtenerOCrearCliente({ nombre: 'Abril Medina', telefonoE164: '+5493414402231' }),
    lucia: await obtenerOCrearCliente({ nombre: 'Lucía Fernández', telefonoE164: '+5493415509987' }),
    carla: await obtenerOCrearCliente({ nombre: 'Carla Giménez', telefonoE164: '+5493415521144' }),
    valentina: await obtenerOCrearCliente({ nombre: 'Valentina Ruiz', telefonoE164: '+5493414433092' }),
    florencia: await obtenerOCrearCliente({ nombre: 'Florencia Díaz', telefonoE164: '+5493415588470' }),
    brenda: await obtenerOCrearCliente({ nombre: 'Brenda Torres', telefonoE164: '+5493414455781' }),
  };

  const ahora = Date.now();
  const HORA = 3600_000;
  const MIN = 60_000;

  function turnoDesde(
    servicioKey: string,
    inicio: Date,
    extra: {
      codigo: string;
      clienteId: Types.ObjectId;
      clienteSnapshot: { nombre: string; telefonoE164: string; email?: string };
      profesional: { id: Types.ObjectId; nombre: string };
      estado: EstadoTurno;
      expiraEn?: Date;
      historial: IHistorialEntry[];
      origen: 'web' | 'admin';
      fueraDeHorario?: boolean;
    }
  ) {
    const s = servicios.get(servicioKey)!;
    const fin = new Date(inicio.getTime() + s.duracionMin * MIN);
    const finBloqueo = new Date(fin.getTime() + s.bufferPostMin * MIN);
    return {
      codigo: extra.codigo,
      clienteId: extra.clienteId,
      clienteSnapshot: extra.clienteSnapshot,
      profesionalId: extra.profesional.id,
      profesionalNombre: extra.profesional.nombre,
      servicio: {
        servicioId: s.id,
        nombre: s.nombre,
        duracionMin: s.duracionMin,
        bufferPostMin: s.bufferPostMin,
        precio: s.precio,
      },
      inicio,
      fin,
      finBloqueo,
      estado: extra.estado,
      expiraEn: extra.expiraEn,
      historial: extra.historial,
      origen: extra.origen,
      fueraDeHorario: extra.fueraDeHorario ?? false,
    };
  }

  const docs = [
    // Pendiente, hoy, HOT (<3h para vencer)
    turnoDesde('Perfilado de cejas', new Date(ahora + 2 * HORA), {
      codigo: `${PREFIJO_CODIGO}0001`,
      clienteId: clientes.sofia,
      clienteSnapshot: { nombre: 'Sofía Ramírez', telefonoE164: '+5493415552847', email: 'sofiar@gmail.com' },
      profesional: rocio,
      estado: 'pendiente',
      expiraEn: new Date(ahora + 2 * HORA),
      historial: [hist('pendiente', new Date(ahora - 30 * MIN), 'cliente')],
      origen: 'web',
    }),
    // Pendiente, hoy, NO hot
    turnoDesde('Manicura semipermanente', new Date(ahora + 5 * HORA), {
      codigo: `${PREFIJO_CODIGO}0002`,
      clienteId: clientes.malena,
      clienteSnapshot: { nombre: 'Malena Ortiz', telefonoE164: '+5493414418890' },
      profesional: camila,
      estado: 'pendiente',
      expiraEn: new Date(ahora + 8 * HORA),
      historial: [hist('pendiente', new Date(ahora - 90 * MIN), 'cliente')],
      origen: 'web',
    }),
    // Pendiente, mañana
    turnoDesde('Perfilado de cejas', new Date(ahora + 24 * HORA), {
      codigo: `${PREFIJO_CODIGO}0003`,
      clienteId: clientes.lucia,
      clienteSnapshot: { nombre: 'Lucía Fernández', telefonoE164: '+5493415509987' },
      profesional: rocio,
      estado: 'pendiente',
      expiraEn: new Date(ahora + 22 * HORA),
      historial: [hist('pendiente', new Date(ahora - 2 * HORA), 'cliente')],
      origen: 'web',
    }),
    // Confirmado, hoy, web
    turnoDesde('Limpieza facial profunda', new Date(ahora + 6 * HORA), {
      codigo: `${PREFIJO_CODIGO}0004`,
      clienteId: clientes.julieta,
      clienteSnapshot: { nombre: 'Julieta Sosa', telefonoE164: '+5493415560012', email: 'juli.sosa@gmail.com' },
      profesional: rocio,
      estado: 'confirmado',
      historial: [
        hist('pendiente', new Date(ahora - 20 * HORA), 'cliente'),
        hist('confirmado', new Date(ahora - 19 * HORA), 'usuario', rocio.id),
      ],
      origen: 'web',
    }),
    // Confirmado, hoy, cargado por el salón, fuera de horario
    turnoDesde('Lifting de pestañas', new Date(ahora + 7 * HORA), {
      codigo: `${PREFIJO_CODIGO}0005`,
      clienteId: clientes.abril,
      clienteSnapshot: { nombre: 'Abril Medina', telefonoE164: '+5493414402231' },
      profesional: camila,
      estado: 'confirmado',
      historial: [
        hist('pendiente', new Date(ahora - HORA), 'usuario', camila.id, 'Cargado por el salón (fuera de grilla)'),
        hist('confirmado', new Date(ahora - HORA), 'usuario', camila.id),
      ],
      origen: 'admin',
      fueraDeHorario: true,
    }),
    // Confirmado, mañana
    turnoDesde('Manicura semipermanente', new Date(ahora + 26 * HORA), {
      codigo: `${PREFIJO_CODIGO}0006`,
      clienteId: clientes.florencia,
      clienteSnapshot: { nombre: 'Florencia Díaz', telefonoE164: '+5493415588470' },
      profesional: camila,
      estado: 'confirmado',
      historial: [
        hist('pendiente', new Date(ahora - 3 * HORA), 'cliente'),
        hist('confirmado', new Date(ahora - 2 * HORA), 'usuario', camila.id),
      ],
      origen: 'web',
    }),
    // Rechazado (histórico)
    turnoDesde('Manicura semipermanente', new Date(ahora - 48 * HORA), {
      codigo: `${PREFIJO_CODIGO}0007`,
      clienteId: clientes.carla,
      clienteSnapshot: { nombre: 'Carla Giménez', telefonoE164: '+5493415521144' },
      profesional: camila,
      estado: 'rechazado',
      historial: [
        hist('pendiente', new Date(ahora - 60 * HORA), 'cliente'),
        hist('rechazado', new Date(ahora - 49 * HORA), 'sistema', undefined, 'No se pudo confirmar a tiempo (venció)'),
      ],
      origen: 'web',
    }),
    // Cancelado (histórico)
    turnoDesde('Perfilado de cejas', new Date(ahora - 30 * HORA), {
      codigo: `${PREFIJO_CODIGO}0008`,
      clienteId: clientes.valentina,
      clienteSnapshot: { nombre: 'Valentina Ruiz', telefonoE164: '+5493414433092' },
      profesional: rocio,
      estado: 'cancelado',
      historial: [
        hist('pendiente', new Date(ahora - 70 * HORA), 'cliente'),
        hist('confirmado', new Date(ahora - 69 * HORA), 'usuario', rocio.id),
        hist('cancelado', new Date(ahora - 32 * HORA), 'cliente', undefined, 'Se le complicó el horario'),
      ],
      origen: 'web',
    }),
    // Completado (histórico)
    turnoDesde('Limpieza facial profunda', new Date(ahora - 72 * HORA), {
      codigo: `${PREFIJO_CODIGO}0009`,
      clienteId: clientes.florencia,
      clienteSnapshot: { nombre: 'Florencia Díaz', telefonoE164: '+5493415588470' },
      profesional: camila,
      estado: 'completado',
      historial: [
        hist('pendiente', new Date(ahora - 96 * HORA), 'cliente'),
        hist('confirmado', new Date(ahora - 95 * HORA), 'usuario', camila.id),
        hist('completado', new Date(ahora - 71 * HORA), 'sistema'),
      ],
      origen: 'web',
    }),
    // Ausente (histórico)
    turnoDesde('Lifting de pestañas', new Date(ahora - 54 * HORA), {
      codigo: `${PREFIJO_CODIGO}0010`,
      clienteId: clientes.brenda,
      clienteSnapshot: { nombre: 'Brenda Torres', telefonoE164: '+5493414455781' },
      profesional: rocio,
      estado: 'ausente',
      historial: [
        hist('pendiente', new Date(ahora - 80 * HORA), 'cliente'),
        hist('confirmado', new Date(ahora - 79 * HORA), 'usuario', rocio.id),
        hist('ausente', new Date(ahora - 53 * HORA), 'usuario', rocio.id),
      ],
      origen: 'web',
    }),
  ];

  await Turno.insertMany(docs);
  console.log(`${docs.length} turnos de prueba insertados (prefijo ${PREFIJO_CODIGO}).`);
  console.log(`Profesionales para probar el guión: admin (${admin.email}) y ${rocio.nombre} (rocio.seed@camigonzalez.local).`);

  await disconnectDB();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
