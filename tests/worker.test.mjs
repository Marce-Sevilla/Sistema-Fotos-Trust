import assert from 'node:assert/strict';
import { route, buildNote, photoFileName } from '../worker/api.js';
import { normalizePhone, splitName } from '../worker/ghl.js';
import { encodeMeta } from '../src/api/meta.js';
import { createMockGhl } from '../dev/mock-ghl.js';

let total = 0;
const test = async (name, fn) => {
  await fn();
  total += 1;
  console.log('ok  -', name);
};

const SITE = 'https://fotos.example.com';
const ENV = { GHL_TOKEN: 'dev-token', GHL_LOCATION_ID: 'dev-location', GHL_PHOTOS_FIELD_ID: 'FIELD123' };
const STEPS = ['frente', 'lateral-derecho', 'trasera', 'lateral-izquierdo', 'vin', 'odometro'];
const PROFILE = { fullName: 'Juan Pérez', email: 'juan@example.com', phone: '3055550123', vehicle: 'suv' };

const post = (path, body, headers = {}) => new Request(SITE + path, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
const jpeg = (size = 20_000) => {
  const bytes = new Uint8Array(size);
  bytes.set([0xff, 0xd8, 0xff]);
  return new File([bytes], 'foto.jpg', { type: 'image/jpeg' });
};
const META = { ...PROFILE, vinLocation: 'door', statuses: { vin: 'unverified' }, readings: { vin: { value: '1M8GDM9AXKP042788', checksumOk: true }, odometer: { value: '087654' } } };
// Petición de /api/finish como la arma el navegador: el contacto y los datos de apoyo van en la dirección, y el
// cuerpo lleva SOLO las fotos, nombradas "idDelCampo_uuid".
const finishReq = async ({ contactId = 'abc12345', meta = META, steps = STEPS, size = 20_000, headers = {}, rawBody } = {}) => {
  const form = new FormData();
  for (const step of steps) form.append(`FIELD123_${crypto.randomUUID()}`, jpeg(size), `${step}.jpg`);
  const params = new URLSearchParams();
  if (contactId !== null) params.set('contactId', contactId);
  if (meta !== null) params.set('meta', typeof meta === 'string' ? meta : encodeMeta(meta));
  const url = `${SITE}/api/finish?${params}`;
  // Un navegador real envía Content-Length con el cuerpo ya serializado: aquí se calcula igual.
  const probe = new Request(url, { method: 'POST', body: form });
  const contentType = rawBody ? 'application/json' : probe.headers.get('content-type');
  const bytes = rawBody ? new TextEncoder().encode(rawBody) : new Uint8Array(await probe.arrayBuffer());
  return new Request(url, { method: 'POST', headers: { 'content-type': contentType, 'content-length': String(bytes.length), ...headers }, body: bytes });
};const call = async (request, env = ENV, mock = createMockGhl()) => {
  const response = await route(request, env, mock.fetch);
  return { status: response.status, body: await response.json(), mock };
};
const uploads = (mock) => mock.calls.filter((c) => c.path === '/forms/upload-custom-files');

// ---- Utilidades ----
await test('teléfono de 10 dígitos recibe +1', () => assert.equal(normalizePhone('(305) 555-0123'), '+13055550123'));
await test('teléfono con 1 inicial', () => assert.equal(normalizePhone('1 305 555 0123'), '+13055550123'));
await test('teléfono internacional se respeta', () => assert.equal(normalizePhone('+57 300 123 4567'), '+573001234567'));
await test('teléfono vacío', () => assert.equal(normalizePhone(''), ''));
await test('nombre y apellido', () => assert.deepEqual(splitName('Juan Pérez'), { firstName: 'Juan', lastName: 'Pérez' }));
await test('nombre con varios apellidos', () => assert.deepEqual(splitName('Juan Carlos Pérez Gómez'), { firstName: 'Juan', lastName: 'Carlos Pérez Gómez' }));
await test('cada foto se guarda con el nombre de su paso', () => assert.equal(photoFileName('lateral-izquierdo'), 'lateral-izquierdo.jpg'));

// ---- /api/start ----
await test('start crea el contacto y no envía etiquetas (reemplazarían las existentes)', async () => {
  const { status, body, mock } = await call(post('/api/start', PROFILE));
  assert.equal(status, 200);
  assert.match(body.contactId, /^mock/);
  const upsert = mock.calls.find((c) => c.path === '/contacts/upsert');
  assert.equal(upsert.json.locationId, 'dev-location');
  assert.equal(upsert.json.phone, '+13055550123');
  assert.equal(upsert.json.firstName, 'Juan');
  assert.equal(upsert.json.tags, undefined);
  assert.equal(upsert.headers.authorization, 'Bearer dev-token');
});
await test('start primero busca si ya existe y solo entonces crea', async () => {
  const { mock } = await call(post('/api/start', PROFILE));
  const order = mock.calls.map((c) => `${c.method} ${c.path}`);
  assert.ok(order.indexOf('GET /contacts/search/duplicate') < order.indexOf('POST /contacts/upsert'));
  const search = mock.calls.find((c) => c.path === '/contacts/search/duplicate');
  assert.deepEqual(search.query, { locationId: 'dev-location', email: 'juan@example.com', number: '+13055550123' });
});
await test('start con un contacto que ya existe (por correo) lo usa SIN modificarlo', async () => {
  const { status, body, mock } = await call(post('/api/start', { ...PROFILE, email: 'existente@example.com', fullName: 'Otro Nombre' }));
  assert.equal(status, 200);
  assert.deepEqual(body, { contactId: 'exist12345', isNew: false, photosFieldId: 'FIELD123' });
  assert.ok(!mock.calls.some((c) => c.path === '/contacts/upsert'), 'no se actualiza el contacto existente');
});
await test('start con un contacto que ya existe (por teléfono) lo usa SIN modificarlo', async () => {
  const { body, mock } = await call(post('/api/start', { ...PROFILE, phone: '(305) 555-9999' }));
  assert.equal(body.contactId, 'exist12345');
  assert.ok(!mock.calls.some((c) => c.path === '/contacts/upsert'));
});
await test('start rechaza datos inválidos', async () => assert.equal((await call(post('/api/start', { ...PROFILE, email: 'x' }))).status, 400));
await test('start rechaza el campo trampa de bots', async () => assert.equal((await call(post('/api/start', { ...PROFILE, hp: 'spam' }))).status, 400));
await test('start con contactId verifica que exista y lo devuelve', async () => {
  const { status, body, mock } = await call(post('/api/start', { ...PROFILE, contactId: 'abc12345' }));
  assert.equal(status, 200);
  assert.equal(body.contactId, 'abc12345');
  assert.ok(mock.calls.some((c) => c.method === 'GET' && c.path === '/contacts/abc12345'));
  assert.ok(!mock.calls.some((c) => c.path === '/contacts/upsert'));
});
await test('start rechaza un contactId inexistente', async () => assert.equal((await call(post('/api/start', { ...PROFILE, contactId: 'missing123' }))).status, 400));
await test('start rechaza un contacto de otra ubicación', async () => assert.equal((await call(post('/api/start', { ...PROFILE, contactId: 'other12345' }))).status, 400));
await test('start rechaza un contactId con formato raro', async () => assert.equal((await call(post('/api/start', { ...PROFILE, contactId: '../../x' }))).status, 400));
await test('start reintenta sin teléfono si el CRM lo rechaza', async () => {
  const mock = createMockGhl({ failures: { '/contacts/upsert': { status: 422, times: 1 } } });
  const { status, mock: used } = await call(post('/api/start', PROFILE), ENV, mock);
  assert.equal(status, 200);
  const upserts = used.calls.filter((c) => c.path === '/contacts/upsert');
  assert.equal(upserts.length, 2);
  assert.equal(upserts[1].json.phone, undefined);
});

// ---- /api/finish ----
await test('start devuelve el ID del campo «Fotos» para que el navegador nombre los archivos', async () => {
  const { body } = await call(post('/api/start', PROFILE));
  assert.equal(body.photosFieldId, 'FIELD123');
});
await test('sin GHL_PHOTOS_FIELD_ID se usa el campo «Fotos» de Trust por defecto', async () => {
  const { GHL_PHOTOS_FIELD_ID, ...withoutField } = ENV;
  const { body } = await call(post('/api/start', PROFILE), withoutField);
  assert.equal(body.photosFieldId, 'btVvykNbwpKlMzvMK7MA');
});
await test('finish sube las 6 fotos JUNTAS en una sola llamada al campo «Fotos»', async () => {
  const { status, body, mock } = await call(await finishReq());
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.deepEqual(body.warnings, []);
  assert.equal(uploads(mock).length, 1, 'una sola subida: el CRM reemplaza los archivos del campo en cada subida');
  const [upload] = uploads(mock);
  assert.deepEqual(upload.query, { contactId: 'abc12345', locationId: 'dev-location' });
  assert.equal(upload.form.length, 6);
  for (const entry of upload.form) assert.match(entry.key, /^FIELD123_[0-9a-f-]{36}$/);
  assert.deepEqual(upload.form.map((entry) => entry.filename), STEPS.map(photoFileName));
  assert.equal(Object.keys(mock.fieldValues['abc12345:FIELD123']).length, 6);
});
await test('finish REENVÍA el cuerpo sin abrirlo (flujo con su longitud), para gastar poca CPU', async () => {
  const { mock } = await call(await finishReq());
  const [upload] = uploads(mock);
  assert.equal(upload.streamed, true, 'el cuerpo se pasa como flujo, no se vuelve a armar');
  assert.ok(Number(upload.contentLength) > 100_000, 'se conserva la longitud original');
  assert.match(upload.headers['content-type'], /^multipart\/form-data; boundary=/);
});
await test('finish no usa la biblioteca de medios', async () => {
  const { mock } = await call(await finishReq());
  assert.ok(!mock.calls.some((c) => c.path.startsWith('/medias')));
});
await test('por defecto finish solo sube las fotos: sin nota ni etiquetas', async () => {
  const { mock, status } = await call(await finishReq());
  assert.equal(status, 200);
  assert.ok(!mock.calls.some((c) => c.path.endsWith('/notes')));
  assert.ok(!mock.calls.some((c) => c.path.endsWith('/tags')));
});
await test('con GHL_ADD_NOTE y GHL_TAGS escribe la nota con los datos, enlaces y lecturas, y pone la etiqueta', async () => {
  const { mock } = await call(await finishReq(), { ...ENV, GHL_ADD_NOTE: 'true', GHL_TAGS: 'fotos-vehiculo' });
  const note = mock.calls.find((c) => c.path === '/contacts/abc12345/notes').json.body;
  assert.match(note, /campo «Fotos»/);
  assert.match(note, /Cliente: Juan Pérez/);
  assert.match(note, /Vehículo: SUV/);
  assert.match(note, /VIN \(en puerta\): https:\/\/services\.leadconnectorhq\.com\/contacts\/file\/download/);
  assert.match(note, /Frente: https:\/\//);
  assert.match(note, /Sin verificar automáticamente.*VIN/);
  assert.match(note, /Kilometraje: 087654/);
  assert.deepEqual(mock.calls.find((c) => c.path === '/contacts/abc12345/tags').json.tags, ['fotos-vehiculo']);
});
await test('los acentos de los datos de apoyo viajan bien en la dirección', async () => {
  const { mock } = await call(await finishReq({ meta: { ...META, fullName: 'José Ángel Muñoz' } }), { ...ENV, GHL_ADD_NOTE: 'true' });
  assert.match(mock.calls.find((c) => c.path.endsWith('/notes')).json.body, /José Ángel Muñoz/);
});
await test('con la nota activada y datos de apoyo inválidos se omite la nota pero las fotos suben', async () => {
  for (const meta of [{ ...META, vehicle: 'tanque' }, { ...META, vinLocation: 'techo' }, 'no-es-base64-ni-json!!']) {
    const { status, body, mock } = await call(await finishReq({ meta }), { ...ENV, GHL_ADD_NOTE: 'true' });
    assert.equal(status, 200);
    assert.deepEqual(body.warnings, ['note_skipped']);
    assert.equal(uploads(mock).length, 1);
    assert.ok(!mock.calls.some((c) => c.path.endsWith('/notes')));
  }
});
await test('sin la nota, los datos de apoyo no hacen falta ni se validan', async () => assert.equal((await call(await finishReq({ meta: null }))).status, 200));
await test('finish usa las etiquetas configuradas', async () => {
  const { mock } = await call(await finishReq(), { ...ENV, GHL_TAGS: 'fotos-ok, fase-1' });
  assert.deepEqual(mock.calls.find((c) => c.path.endsWith('/tags')).json.tags, ['fotos-ok', 'fase-1']);
});
await test('finish rechaza una petición sin fotos (demasiado pequeña) y no sube nada', async () => {
  const { status, mock } = await call(await finishReq({ steps: [] }));
  assert.ok(status === 400 || status === 411, `estado ${status}`);
  assert.equal(uploads(mock).length, 0);
});
await test('finish rechaza una petición que no es multipart', async () => {
  const { status, mock } = await call(await finishReq({ rawBody: JSON.stringify({ x: 'y'.repeat(100_000) }) }));
  assert.equal(status, 400);
  assert.equal(uploads(mock).length, 0);
});
await test('finish rechaza fotos demasiado pesadas (más de 42 MB en total)', async () => {
  const { status, mock } = await call(await finishReq({ size: 8 * 1024 * 1024 }));
  assert.equal(status, 413);
  assert.equal(uploads(mock).length, 0);
});
await test('finish rechaza un contactId inválido', async () => assert.equal((await call(await finishReq({ contactId: 'a b' }))).status, 400));
await test('finish rechaza si falta el contactId', async () => assert.equal((await call(await finishReq({ contactId: null }))).status, 400));
await test('finish rechaza un contacto inexistente (sin subir nada)', async () => {
  const { status, mock } = await call(await finishReq({ contactId: 'missing123' }));
  assert.equal(status, 400);
  assert.equal(uploads(mock).length, 0);
});
await test('finish rechaza un contacto de otra ubicación (sin subir nada)', async () => {
  const { status, mock } = await call(await finishReq({ contactId: 'other12345' }));
  assert.equal(status, 400);
  assert.equal(uploads(mock).length, 0);
});
await test('finish tolera que falle la etiqueta (las fotos ya quedaron)', async () => {
  const mock = createMockGhl({ failures: { '/contacts/abc12345/tags': { status: 400, times: 5 } } });
  const { status, body } = await call(await finishReq(), { ...ENV, GHL_TAGS: 'fotos-vehiculo' }, mock);
  assert.equal(status, 200);
  assert.deepEqual(body.warnings, ['tag_failed']);
});
await test('si el CRM falla al subir, finish responde 502 con un solo intento (el flujo no se puede repetir)', async () => {
  const mock = createMockGhl({ failures: { '/forms/upload-custom-files': { status: 503, times: 1 } } });
  const { status, body, mock: used } = await call(await finishReq(), ENV, mock);
  assert.equal(status, 502);
  assert.equal(body.step, 'uploadFiles');
  assert.equal(uploads(used).length, 1, 'el reintento lo hace el navegador, enviando todo de nuevo');
});
await test('finish avisa si el CRM no confirma las 6 fotos en su respuesta', async () => {
  const mock = createMockGhl();
  const lenient = async (input, init) => {
    const response = await mock.fetch(input, init);
    if (!String(input).includes('upload-custom-files')) return response;
    const data = await response.json();
    const [firstKey] = Object.keys(data.contact.customFields[0].value);
    data.contact.customFields[0].value = { [firstKey]: data.contact.customFields[0].value[firstKey] };
    return new Response(JSON.stringify(data), { status: 201 });
  };
  const response = await route(await finishReq(), ENV, lenient);
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).warnings, ['photo_count_mismatch']);
});
// ---- Nota ----
await test('la nota avisa si el dígito verificador del VIN no cuadra', () => {
  const note = buildNote({ profile: PROFILE, vehicle: 'sedan', vinLocation: 'windshield', links: {}, statuses: {}, readings: { vin: { value: '1M8GDM9AXKP042789', checksumOk: false } } }, new Date('2026-10-26T15:04:00Z'));
  assert.match(note, /no cuadra/);
  assert.match(note, /Fecha: 2026-10-26 15:04 UTC/);
  assert.match(note, /Las 6 fotos pasaron/);
  assert.match(note, /VIN \(en parabrisas\)/);
});

// ---- Errores y seguridad ----
await test('un fallo del CRM llega como 502 sin filtrar el token ni el detalle', async () => {
  const { status, body } = await call(post('/api/start', PROFILE), { ...ENV, GHL_TOKEN: 'token-equivocado' });
  assert.equal(status, 502);
  assert.equal(body.error, 'crm_error');
  assert.equal(body.step, 'findContact'); // la búsqueda del contacto es la primera llamada al CRM
  assert.ok(!JSON.stringify(body).includes('token-equivocado'));
});
await test('sin token configurado responde 500 not_configured y dice qué variable falta', async () => {
  const { status, body } = await call(post('/api/start', PROFILE), { GHL_LOCATION_ID: 'x' });
  assert.equal(status, 500);
  assert.equal(body.error, 'not_configured');
  assert.deepEqual(body.missing, ['GHL_TOKEN']);
});
await test('sin ninguna variable del CRM lista las dos que faltan (solo nombres, nunca valores)', async () => {
  const { body } = await call(post('/api/start', PROFILE), {});
  assert.deepEqual(body.missing, ['GHL_TOKEN', 'GHL_LOCATION_ID']);
});
await test('solo acepta POST', async () => assert.equal((await call(new Request(SITE + '/api/start'))).status, 405));
await test('la ruta antigua /api/photo ya no existe', async () => assert.equal((await call(post('/api/photo', {}))).status, 404));
await test('rechaza peticiones desde otro origen', async () => assert.equal((await call(post('/api/start', PROFILE, { origin: 'https://otro-sitio.com' }))).status, 403));
await test('acepta peticiones del propio sitio', async () => assert.equal((await call(post('/api/start', PROFILE, { origin: SITE }))).status, 200));
await test('rechaza JSON demasiado grande', async () => assert.equal((await call(post('/api/start', { ...PROFILE, extra: 'x'.repeat(10_000) }))).status, 400));
await test('finish rechaza peticiones desde otro origen', async () => assert.equal((await call(await finishReq({ headers: { origin: 'https://otro-sitio.com' } }))).status, 403));

console.log(`\n${total} pruebas del servidor`);
