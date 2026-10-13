import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    watch: {
      // Los logos originales (pesados) no se importan; en Windows pueden quedar bloqueados
      // (EBUSY) por sincronización y tumbar el servidor de desarrollo.
      ignored: ['**/src/assets/logo.png', '**/src/assets/TRUST_LOGO_4_3.png'],
    },
  },
});
