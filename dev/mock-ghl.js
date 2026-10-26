// CRM simulado con la forma de la API de GoHighLevel, para probar el servidor sin red ni token.
// Se usa en las pruebas automáticas y en `npm run dev` (ver vite.config.js).
//
//   const mock = createMockGhl();
//   route(request, env, mock.fetch);   // mock.calls guarda todo lo recibido
//   createMockGhl({ failures: { '/medias/upload-file': { status: 500, times: 1 } } })
export function createMockGhl({ token = 'dev-token', locationId = 'dev-location', failures = {} } = {}) {
  const calls = [];
  const remaining = Object.fromEntries(Object.entries(failures).map(([path, f]) => [path, { ...f }]));
  let mediaCount = 0;

  const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

  async function mockFetch(input, init = {}) {
    const url = new URL(input instanceof URL ? input.href : typeof input === 'string' ? input : input.url);
    const method = init.method ?? 'GET';
    const headers = new Headers(init.headers);
    const record = { method, path: url.pathname, query: Object.fromEntries(url.searchParams), headers: Object.fromEntries(headers) };
    if (init.body instanceof FormData) {
      record.form = [];
      for (const [key, value] of init.body.entries()) record.form.push({ key, ...(typeof value === 'string' ? { value } : { filename: value.name, size: value.size, type: value.type }) });
    } else if (typeof init.body === 'string' && init.body) {
      record.json = JSON.parse(init.body);
    }
    calls.push(record);

    if (headers.get('authorization') !== `Bearer ${token}`) return reply({ message: 'Unauthorized' }, 401);
    if (!headers.get('version')) return reply({ message: 'Version header missing' }, 400);

    const injected = remaining[url.pathname];
    if (injected && injected.times > 0) {
      injected.times -= 1;
      return reply({ message: 'injected failure' }, injected.status);
    }

    if (method === 'POST' && url.pathname === '/contacts/upsert') {
      const { email } = record.json;
      return reply({ new: true, contact: { id: `mock${[...email].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)}`, locationId, email } });
    }
    const contact = url.pathname.match(/^\/contacts\/([^/]+)(\/notes|\/tags)?$/);
    if (contact) {
      const [, id, sub] = contact;
      if (method === 'GET' && !sub) return id.startsWith('missing') ? reply({ message: 'Not found' }, 404) : reply({ contact: { id, locationId: id.startsWith('other') ? 'another-location' : locationId } });
      if (method === 'POST' && sub === '/notes') return reply({ note: { id: `note${calls.length}`, body: record.json.body } }, 201);
      if (method === 'POST' && sub === '/tags') return reply({ tags: record.json.tags });
      if (method === 'DELETE' && !sub) return reply({ succeded: true });
    }
    if (method === 'POST' && url.pathname === '/medias/upload-file') {
      const file = record.form.find((entry) => entry.key === 'file');
      mediaCount += 1;
      return reply({ fileId: `file${mediaCount}`, url: `https://storage.googleapis.com/mock-bucket/${file?.filename ?? `file${mediaCount}.jpg`}` });
    }
    if (method === 'POST' && url.pathname === '/forms/upload-custom-files') return reply({ contact: { id: record.query.contactId } });
    return reply({ message: `No mock for ${method} ${url.pathname}` }, 404);
  }

  return { fetch: mockFetch, calls };
}
