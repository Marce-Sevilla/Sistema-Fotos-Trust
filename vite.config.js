import { execSync } from 'node:child_process';
import { Readable } from 'node:stream';
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

// En desarrollo (`npm run dev`) no hay Worker de Cloudflare, así que /api/* se atiende aquí con el MISMO
// código del Worker (worker/api.js) pero contra un CRM simulado (dev/mock-ghl.js): se puede probar todo el
// envío sin token. GET /api/__mock muestra lo que "recibió" el CRM simulado.
// Para probar contra el CRM real: crea `.dev.vars` con GHL_TOKEN y GHL_LOCATION_ID y usa `npm run cf:dev`.
function devApi() {
  return {
    name: 'dev-api',
    apply: 'serve',
    configureServer(server) {
      let mock;
      server.middlewares.use('/api', async (req, res) => {
        const { route } = await server.ssrLoadModule('/worker/api.js');
        const { createMockGhl } = await server.ssrLoadModule('/dev/mock-ghl.js');
        mock ??= createMockGhl();

        const url = `http://${req.headers.host}${req.originalUrl}`;
        if (url.endsWith('/api/__mock')) {
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify(mock.calls, null, 2));
          return;
        }

        const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
        const request = new Request(url, { method: req.method, headers: req.headers, ...(hasBody ? { body: Readable.toWeb(req), duplex: 'half' } : {}) });
        const response = await route(request, { GHL_TOKEN: 'dev-token', GHL_LOCATION_ID: 'dev-location', GHL_PHOTOS_FIELD_ID: 'devfield1' }, mock.fetch);
        res.statusCode = response.status;
        response.headers.forEach((value, key) => res.setHeader(key, value));
        res.end(Buffer.from(await response.arrayBuffer()));
      });
    },
  };
}

export default defineConfig({
  plugins: [devApi()],
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
