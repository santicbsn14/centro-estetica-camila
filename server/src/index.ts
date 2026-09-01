import 'dotenv/config';
import './models';
import { createApp } from './app';
import { connectDB } from './config/db';
import { arrancarWorker } from './worker';
import { ClienteWhatsApp, crearClienteWhatsAppTwilio, clienteWhatsAppMock } from './services/whatsapp';

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;

// Real si hay credenciales de Twilio (§8); si no, el mock — no bloquea el
// arranque en dev/CI sin cuenta de Twilio, igual que MONGODB_URI abajo.
function resolverClienteWhatsApp(): ClienteWhatsApp {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM;
  if (!accountSid || !authToken || !from) {
    console.warn(
      'Faltan TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN/TWILIO_WHATSAPP_FROM — el worker usa el cliente mock de WhatsApp'
    );
    return clienteWhatsAppMock;
  }
  return crearClienteWhatsAppTwilio({ accountSid, authToken, from });
}

async function main(): Promise<void> {
  const app = createApp();

  app.listen(PORT, () => {
    console.log(`Server escuchando en http://localhost:${PORT}`);
  });

  if (!process.env.MONGODB_URI) {
    console.warn('MONGODB_URI no está definida — el server arranca sin conexión a la base');
    return;
  }

  try {
    await connectDB();
    console.log('Conectado a MongoDB Atlas');
  } catch (err) {
    console.error('No se pudo conectar a MongoDB Atlas:', err);
    return; // sin DB no arranca el worker (§11) — hoy es un stub, mañana sí la toca
  }

  // Embebido en el mismo proceso, mantenido despierto por el ping externo
  // contra /healthz (§11). Ciclo real: §7; cliente WhatsApp real vs. mock: §8.
  arrancarWorker({ clienteWhatsApp: resolverClienteWhatsApp() });
}

main();
