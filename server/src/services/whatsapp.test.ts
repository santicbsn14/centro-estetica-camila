import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Types } from 'mongoose';
import { Plantilla, Turno } from '../models';
import { armarContentVariables, crearClienteWhatsAppTwilio, ClienteTwilioMensajes } from './whatsapp';
import { conectarDbTest, desconectarDbTest, limpiarDbTest } from '../test/dbTestSetup';
import { seedPlantillas } from '../scripts/seedPlantillas';

// Cliente real de WhatsApp (Twilio) — modelo-datos-turnos.md §8. El mapeo
// tipo→contentSid→orden de variables es el contrato posicional (§4): un
// reordenamiento manda el servicio donde va la hora. `armarContentVariables`
// se testea aparte (pura) y también integrado contra la colección real.

beforeAll(async () => {
  await conectarDbTest();
}, 300_000);

afterEach(async () => {
  await limpiarDbTest();
});

afterAll(async () => {
  await desconectarDbTest();
});

const DATOS = {
  nombre: 'Clienta Test',
  servicio: 'Manicura',
  fecha: '25/08/2026',
  hora: '15:30',
  profesional: 'Rocío',
};

describe('armarContentVariables — orden posicional (§4, §8)', () => {
  it('solicitud: 1=nombre, 2=servicio, 3=fecha, 4=hora', () => {
    expect(armarContentVariables(['nombre', 'servicio', 'fecha', 'hora'], DATOS)).toEqual({
      '1': 'Clienta Test',
      '2': 'Manicura',
      '3': '25/08/2026',
      '4': '15:30',
    });
  });

  it('confirmacion: 1=nombre, 2=servicio, 3=fecha, 4=hora, 5=profesional', () => {
    expect(armarContentVariables(['nombre', 'servicio', 'fecha', 'hora', 'profesional'], DATOS)).toEqual({
      '1': 'Clienta Test',
      '2': 'Manicura',
      '3': '25/08/2026',
      '4': '15:30',
      '5': 'Rocío',
    });
  });

  it('recordatorio_24h y cancelacion: 1=nombre, 2=fecha, 3=hora, 4=servicio', () => {
    const esperado = { '1': 'Clienta Test', '2': '25/08/2026', '3': '15:30', '4': 'Manicura' };
    expect(armarContentVariables(['nombre', 'fecha', 'hora', 'servicio'], DATOS)).toEqual(esperado);
  });

  it('rechazo: 1=nombre, 2=fecha, 3=hora', () => {
    expect(armarContentVariables(['nombre', 'fecha', 'hora'], DATOS)).toEqual({
      '1': 'Clienta Test',
      '2': '25/08/2026',
      '3': '15:30',
    });
  });
});

async function crearTurnoDeTest() {
  const sufijo = new Types.ObjectId().toString();
  return Turno.create({
    codigo: `TRN-${sufijo.slice(-6)}`,
    clienteId: new Types.ObjectId(),
    clienteSnapshot: { nombre: 'Clienta Test', telefonoE164: '+5493364123456' },
    profesionalId: new Types.ObjectId(),
    profesionalNombre: 'Rocío',
    servicio: {
      servicioId: new Types.ObjectId(),
      nombre: 'Manicura',
      duracionMin: 30,
      bufferPostMin: 0,
      precio: 500000,
    },
    // 2026-08-25 18:30 UTC = 15:30 en America/Argentina/Buenos_Aires (UTC-3)
    inicio: new Date('2026-08-25T18:30:00.000Z'),
    fin: new Date('2026-08-25T19:00:00.000Z'),
    finBloqueo: new Date('2026-08-25T19:00:00.000Z'),
    estado: 'confirmado',
    historial: [],
    origen: 'web',
    fueraDeHorario: false,
  });
}

describe('crearClienteWhatsAppTwilio — integración con plantillas + turno', () => {
  it('arma to/from/contentSid/contentVariables correctamente y devuelve el sid del proveedor', async () => {
    await seedPlantillas();
    const turno = await crearTurnoDeTest();

    let paramsRecibidos: unknown;
    const clienteStub: ClienteTwilioMensajes = {
      messages: {
        create: async (params) => {
          paramsRecibidos = params;
          return { sid: 'SMxxxxfake' };
        },
      },
    };

    const cliente = crearClienteWhatsAppTwilio({
      accountSid: 'ACfake',
      authToken: 'tokenfake',
      from: 'whatsapp:+5493364695239',
      cliente: clienteStub,
    });

    const resultado = await cliente.enviar({
      turnoId: turno._id.toString(),
      tipo: 'confirmacion',
      destino: '+5493364123456',
    });

    expect(resultado).toEqual({ exito: true, proveedorSid: 'SMxxxxfake' });
    expect(paramsRecibidos).toEqual({
      from: 'whatsapp:+5493364695239',
      to: 'whatsapp:+5493364123456',
      contentSid: 'HX741ec2158022acd9d3c4872a3b6448c7',
      contentVariables: JSON.stringify({
        '1': 'Clienta Test',
        '2': 'Manicura',
        '3': '25/08/2026',
        '4': '15:30',
        '5': 'Rocío',
      }),
    });
  });

  it('propaga el error de Twilio como fallo sin tirar la excepción', async () => {
    await seedPlantillas();
    const turno = await crearTurnoDeTest();

    const clienteStub: ClienteTwilioMensajes = {
      messages: {
        create: async () => {
          const err = new Error('The number is not a valid WhatsApp number') as Error & { code: number };
          err.code = 63016;
          throw err;
        },
      },
    };

    const cliente = crearClienteWhatsAppTwilio({
      accountSid: 'ACfake',
      authToken: 'tokenfake',
      from: 'whatsapp:+5493364695239',
      cliente: clienteStub,
    });

    const resultado = await cliente.enviar({
      turnoId: turno._id.toString(),
      tipo: 'confirmacion',
      destino: '+5493364123456',
    });

    expect(resultado).toEqual({
      exito: false,
      error: { codigo: '63016', mensaje: 'The number is not a valid WhatsApp number' },
    });
  });

  it('devuelve fallo PLANTILLA_NO_CONFIGURADA si no hay plantilla activa para el tipo', async () => {
    // Sin seedPlantillas(): la colección está vacía.
    const turno = await crearTurnoDeTest();
    const clienteStub: ClienteTwilioMensajes = {
      messages: { create: async () => ({ sid: 'no-deberia-llamarse' }) },
    };

    const cliente = crearClienteWhatsAppTwilio({
      accountSid: 'ACfake',
      authToken: 'tokenfake',
      from: 'whatsapp:+5493364695239',
      cliente: clienteStub,
    });

    const resultado = await cliente.enviar({
      turnoId: turno._id.toString(),
      tipo: 'confirmacion',
      destino: '+5493364123456',
    });

    expect(resultado).toEqual({
      exito: false,
      error: expect.objectContaining({ codigo: 'PLANTILLA_NO_CONFIGURADA' }),
    });
  });
});

describe('seedPlantillas — idempotencia', () => {
  it('crea las 5 plantillas de whatsapp con el mapeo esperado y no las pisa en una segunda corrida', async () => {
    await seedPlantillas();

    const plantillas = await Plantilla.find({ canal: 'whatsapp' }).sort({ tipo: 1 }).lean();
    expect(plantillas).toHaveLength(5);
    plantillas.forEach((p) => {
      expect(p.metaIdioma).toBe('es_AR');
      expect(p.metaEstado).toBe('aprobada');
      expect(p.activa).toBe(true);
      expect(p.contentSid).toMatch(/^HX[0-9a-f]{32}$/);
    });

    const porTipo = Object.fromEntries(plantillas.map((p) => [p.tipo, p]));
    expect(porTipo.solicitud.contentSid).toBe('HX49779c4e2e9c6edb7e1debc2ce8c89f8');
    expect(porTipo.solicitud.variables).toEqual(['nombre', 'servicio', 'fecha', 'hora']);
    expect(porTipo.confirmacion.contentSid).toBe('HX741ec2158022acd9d3c4872a3b6448c7');
    expect(porTipo.confirmacion.variables).toEqual(['nombre', 'servicio', 'fecha', 'hora', 'profesional']);
    expect(porTipo.recordatorio_24h.contentSid).toBe('HXe134407ff84adbbb9e5c1b085e50c9dc');
    expect(porTipo.recordatorio_24h.variables).toEqual(['nombre', 'fecha', 'hora', 'servicio']);
    expect(porTipo.cancelacion.contentSid).toBe('HXc2265e76efdbca76145ffc2fa901b468');
    expect(porTipo.cancelacion.variables).toEqual(['nombre', 'fecha', 'hora', 'servicio']);
    expect(porTipo.rechazo.contentSid).toBe('HX78e2d34ed5c02f5c21a1a340829b7534');
    expect(porTipo.rechazo.variables).toEqual(['nombre', 'fecha', 'hora']);

    // Edición manual (ej. desde el panel, o Meta rechazó y se recreó el HX)
    // no debe pisarse en una segunda corrida del seed.
    await Plantilla.updateOne({ tipo: 'solicitud', canal: 'whatsapp' }, { $set: { contentSid: 'HXeditadamano' } });
    await seedPlantillas();

    const total = await Plantilla.countDocuments({ canal: 'whatsapp' });
    expect(total).toBe(5);
    const solicitudEditada = await Plantilla.findOne({ tipo: 'solicitud', canal: 'whatsapp' }).lean();
    expect(solicitudEditada?.contentSid).toBe('HXeditadamano');
  });
});
