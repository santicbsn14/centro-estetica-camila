import mongoose from 'mongoose';

// MongoDB Atlas, no Mongo en Render: las transacciones requieren replica set
// (modelo-datos-turnos.md §11).
export async function connectDB(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('Falta la variable de entorno MONGODB_URI');
  }
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri);
}

export async function disconnectDB(): Promise<void> {
  await mongoose.disconnect();
}
