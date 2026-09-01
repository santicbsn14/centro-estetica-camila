import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Vitest usa Vite para resolver módulos: el alias @shared/* de tsconfig.json
// (que tsc-alias reescribe en el build) no aplica acá, hay que declararlo
// también para los tests — mismo mapeo que client/vite.config.ts.
export default defineConfig({
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, '../shared/src'),
    },
  },
});
