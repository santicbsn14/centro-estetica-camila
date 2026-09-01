// Cliente de envío de WhatsApp — interfaz separada del ciclo del worker
// (modelo-datos-turnos.md §7, §8). `crearClienteWhatsAppMock` sigue
// existiendo para tests del worker que no necesitan pegarle a Twilio.
// `crearClienteWhatsAppTwilio` es el cliente real (§8: credenciales +
// plantillas aprobadas ya están, ver §17) — arma el `contentVariables`
// posicional a partir del turno y la plantilla, y llama a la API de Twilio.
// El worker no distingue: recibe un `ClienteWhatsApp` inyectado desde
// index.ts y sólo conoce `enviar()`.

import twilio from 'twilio';
import { DateTime } from 'luxon';
import { Plantilla, Turno } from '../models';
import { TipoNotificacion } from '../models/notificacion.model';

const TIMEZONE = 'America/Argentina/Buenos_Aires';

export interface EnvioWhatsAppParams {
  turnoId: string;
  tipo: TipoNotificacion;
  destino: string; // E.164, snapshot de la notificación
}

export interface EnvioWhatsAppExito {
  exito: true;
  proveedorSid: string;
}

export interface EnvioWhatsAppFallo {
  exito: false;
  error: { codigo: string; mensaje: string };
}

export type ResultadoEnvioWhatsApp = EnvioWhatsAppExito | EnvioWhatsAppFallo;

export interface ClienteWhatsApp {
  enviar(params: EnvioWhatsAppParams): Promise<ResultadoEnvioWhatsApp>;
}

/**
 * Mock — por defecto simula éxito siempre. `simular` es el punto de control
 * desde tests (ej. un `vi.fn()` con `mockResolvedValueOnce` encadenados) para
 * forzar fallos puntuales sin tocar el ciclo del worker.
 */
export function crearClienteWhatsAppMock(
  simular: (
    params: EnvioWhatsAppParams
  ) => ResultadoEnvioWhatsApp | Promise<ResultadoEnvioWhatsApp> = () => ({
    exito: true,
    proveedorSid: `mock-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  })
): ClienteWhatsApp {
  return {
    async enviar(params) {
      return simular(params);
    },
  };
}

// Instancia por defecto que usa el worker cuando no se le inyecta otra.
// Bootstrap real (Twilio vs. mock) decidido en index.ts según env vars.
export const clienteWhatsAppMock: ClienteWhatsApp = crearClienteWhatsAppMock();

// --- Cliente real (Twilio) ---------------------------------------------

// Datos del turno que puede necesitar cualquiera de las 5 plantillas. Cuál
// de estos campos entra al mensaje, y en qué orden, lo decide
// `plantilla.variables` (§4) — no esta lista.
interface DatosTurnoParaPlantilla {
  nombre: string;
  servicio: string;
  fecha: string;
  hora: string;
  profesional: string;
}

async function datosTurnoParaPlantilla(turnoId: string): Promise<DatosTurnoParaPlantilla | null> {
  const turno = await Turno.findById(turnoId).lean();
  if (!turno) return null;

  const inicioLocal = DateTime.fromJSDate(turno.inicio, { zone: TIMEZONE });
  return {
    nombre: turno.clienteSnapshot.nombre,
    servicio: turno.servicio.nombre,
    fecha: inicioLocal.toFormat('dd/MM/yyyy'),
    hora: inicioLocal.toFormat('HH:mm'),
    profesional: turno.profesionalNombre,
  };
}

// Las variables de Meta son posicionales (§4, §8): {"1":.., "2":..}. El
// orden de `variables` de la plantilla ES el contrato — no se reordena acá,
// se respeta el array tal cual viene de la colección `plantillas`.
export function armarContentVariables(variables: string[], datos: DatosTurnoParaPlantilla): Record<string, string> {
  const contentVariables: Record<string, string> = {};
  variables.forEach((nombreVariable, index) => {
    contentVariables[String(index + 1)] = datos[nombreVariable as keyof DatosTurnoParaPlantilla] ?? '';
  });
  return contentVariables;
}

// Subconjunto mínimo del cliente de Twilio que este módulo necesita — lo que
// permite inyectar un stub en tests sin pegarle a la API real (`cliente` en
// las opciones de abajo), en vez de mockear el módulo 'twilio' entero.
export interface ClienteTwilioMensajes {
  messages: {
    create(params: {
      from: string;
      to: string;
      contentSid: string;
      contentVariables?: string;
    }): Promise<{ sid: string }>;
  };
}

export interface OpcionesClienteWhatsAppTwilio {
  accountSid: string;
  authToken: string;
  from: string; // TWILIO_WHATSAPP_FROM, ya con el prefijo 'whatsapp:+...'
  cliente?: ClienteTwilioMensajes; // inyección para tests
}

export function crearClienteWhatsAppTwilio(opciones: OpcionesClienteWhatsAppTwilio): ClienteWhatsApp {
  const cliente: ClienteTwilioMensajes = opciones.cliente ?? twilio(opciones.accountSid, opciones.authToken);

  return {
    async enviar(params) {
      // Resuelve la plantilla por tipo+canal (§4: metaNombre/contentSid son
      // dato de configuración, no hardcode) — si Meta rechaza y hay que
      // recrear una, esto cambia editando el documento, no este archivo.
      const plantilla = await Plantilla.findOne({ tipo: params.tipo, canal: 'whatsapp', activa: true }).lean();
      if (!plantilla || !plantilla.contentSid) {
        return {
          exito: false,
          error: {
            codigo: 'PLANTILLA_NO_CONFIGURADA',
            mensaje: `No hay plantilla de whatsapp activa con contentSid para el tipo '${params.tipo}'`,
          },
        };
      }

      const datos = await datosTurnoParaPlantilla(params.turnoId);
      if (!datos) {
        return {
          exito: false,
          error: { codigo: 'TURNO_NO_ENCONTRADO', mensaje: `No se encontró el turno ${params.turnoId} para armar el mensaje` },
        };
      }

      const contentVariables = armarContentVariables(plantilla.variables, datos);

      try {
        const mensaje = await cliente.messages.create({
          from: opciones.from,
          to: `whatsapp:${params.destino}`,
          contentSid: plantilla.contentSid,
          contentVariables: JSON.stringify(contentVariables),
        });
        return { exito: true, proveedorSid: mensaje.sid };
      } catch (err) {
        const error = err as { code?: string | number; message?: string };
        return {
          exito: false,
          error: {
            codigo: error.code !== undefined ? String(error.code) : 'TWILIO_ERROR',
            mensaje: error.message ?? 'Error desconocido enviando WhatsApp',
          },
        };
      }
    },
  };
}
