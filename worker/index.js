// Punto de entrada del Worker: atiende /api/* y deja que Cloudflare sirva el sitio estático (dist) para el resto.
import { route } from './api.js';

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith('/api/')) return route(request, env);
    return env.ASSETS.fetch(request);
  },
};
