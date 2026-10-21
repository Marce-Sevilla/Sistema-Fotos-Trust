import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';

// Versión publicada (hash corto del commit), visible en el modo de diagnóstico para confirmar el despliegue.
function commitHash() {
  const fromCi = process.env.WORKERS_CI_COMMIT_SHA || process.env.CF_PAGES_COMMIT_SHA;
  if (fromCi) return fromCi.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'dev';
  }
}

export default defineConfig({
  define: {
    __COMMIT__: JSON.stringify(commitHash()),
  },
  server: {
    watch: {
      // Los logos originales (pesados) no se importan; en Windows pueden quedar bloqueados
      // (EBUSY) por sincronización y tumbar el servidor de desarrollo.
      ignored: ['**/src/assets/logo.png', '**/src/assets/TRUST_LOGO_4_3.png'],
    },
  },
});
