import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import mkcert from 'vite-plugin-mkcert';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// https sólo se activa con `npm run dev:https` (`vite --mode https`);
// `npm run dev` normal sigue en http plano. Nota: Vite 5 no tiene un flag
// `--https` en su CLI (existía en Vite 2, lo sacaron) — pasarlo revienta con
// `CACError: Unknown option` antes de llegar a este archivo. `--mode` sí es
// una opción real del CLI, así que se usa esa como interruptor. mkcert() no
// hace nada si el modo no es 'https' — genera y confía un cert local la
// primera vez que sí corre en https (guión de prueba en frontend.md §5).
export default defineConfig(({ command, mode }) => {
  const httpsFlag = mode === 'https';
  return {
    plugins: [react(), ...(httpsFlag ? [mkcert()] : [])],
    resolve: {
      alias: {
        '@shared': path.resolve(__dirname, '../shared/src'),
      },
    },
    server: {
      port: 5173,
    },
  };
});
