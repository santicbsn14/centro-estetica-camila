import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// A diferencia de client/ (panel), esta app NO necesita mkcert/https en dev:
// no hay cookie de sesión que dependa de Secure/SameSite=None (frontend.md
// §4.10 — cliente HTTP público sin credentials:'include'). http plano alcanza
// para ejercitar todo lo que esta app hace en local.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, '../shared/src'),
    },
  },
  server: {
    port: 5174,
  },
});
