import 'dotenv/config';
import './models';
import { createApp } from './app';
import { connectDB } from './config/db';

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;

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
  }
}

main();
