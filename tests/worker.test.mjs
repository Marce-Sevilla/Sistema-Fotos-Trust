import assert from 'node:assert/strict';
import { route, buildNote, photoFileName } from '../worker/api.js';
import { normalizePhone, splitName } from '../worker/ghl.js';
import { createMockGhl } from '../dev/mock-ghl.js';

let total = 0;
const test = async (name, fn) => {
  await fn();
  total += 1;
  console.log('ok  -', name);
};

const SITE = 'https://fotos.example.com';
const ENV = { GHL_TOKEN: 'dev-token', GHL_LOCATION_ID: 'dev-location', GHL_PHOTOS_FIELD_ID: 'FIELD123' };
const STEPS = ['frente', 'trasera', 'lateral-izquierdo', 'lateral-derecho', 'vin', 'odometro'];
const PROFILE = { fullName: 'Juan Pérez', email: 'juan@example.com', phone: '3055550123', vehicle: 'suv' };

const post = (path, body, headers = {}) => new Request(SITE + path, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
const jpeg = (size = 20_000) => {
  const bytes = new Uint8Array(size);
  bytes.set([0xff, 0xd8, 0xff]);
  return new File([bytes], 'foto.jpg', { type: 'image/jpeg' });
};
const META = { ...PROFILE, vinLocation: 'door', statuses: { vin: 'unverified' }, readings: { vin: { value: '1M8GDM9AXKP042788', checksumOk: true }, odometer: { value: '087654' } } };
// Petición de /api/finish: `photos` permite cambiar o quitar fotos concretas; `meta` los datos.
const finishReq = ({ contactId = 'abc12345', meta = META, photos = {}, headers = {} } = {}) => {
  const form = new FormData();
  if (contactId !== null) form.append('contactId', contactId);
  if (meta !== null) form.append('meta', typeof meta === 'string' ? meta : JSON.stringify(meta));
  for (const step of STEPS) {
    const photo = step in photos ? photos[step] : jpeg();
    if (photo !== null) form.append(`photo_${step}`, photo);
  }
  return new Request(SITE + '/api/finish', { method: 'POST', body: form, headers });
};
const call = async (request, env = ENV, mock = createMockGhl()) => {
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
await test('finish sube las 6 fotos JUNTAS en una sola llamada al campo «Fotos»', async () => {
  const { status, body, mock } = await call(finishReq());
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
await test('finish no usa la biblioteca de medios', async () => {
  const { mock } = await call(finishReq());
  assert.ok(!mock.calls.some((c) => c.path.startsWith('/medias')));
});
await test('por defecto finish solo sube las fotos: sin nota ni etiquetas', async () => {
  const { mock, status } = await call(finishReq());
  assert.equal(status, 200);
  assert.ok(!mock.calls.some((c) => c.path.endsWith('/notes')));
  assert.ok(!mock.calls.some((c) => c.path.endsWith('/tags')));
});
await test('con GHL_ADD_NOTE y GHL_TAGS escribe la nota con los datos, enlaces y lecturas, y pone la etiqueta', async () => {
  const { mock } = await call(finishReq(), { ...ENV, GHL_ADD_NOTE: 'true', GHL_TAGS: 'fotos-vehiculo' });
  const note = mock.calls.find((c) => c.path === '/contacts/abc12345/notes').json.body;
  assert.match(note, /campo «Fotos»/);
  assert.match(note, /Vehículo: SUV/);
  assert.match(note, /VIN \(en puerta\): https:\/\/services\.leadconnectorhq\.com\/contacts\/file\/download/);
  assert.match(note, /Frente: https:\/\//);
  assert.match(note, /Sin verificar automáticamente.*VIN/);
  assert.match(note, /Kilometraje: 087654/);
  assert.deepEqual(mock.calls.find((c) => c.path === '/contacts/abc12345/tags').json.tags, ['fotos-vehiculo']);
});
await test('finish usa las etiquetas configuradas', async () => {
  const { mock } = await call(finishReq(), { ...ENV, GHL_TAGS: 'fotos-ok, fase-1' });
  assert.deepEqual(mock.calls.find((c) => c.path.endsWith('/tags')).json.tags, ['fotos-ok', 'fase-1']);
});
await test('finish rechaza si falta una foto (y no sube nada)', async () => {
  const { status, mock } = await call(finishReq({ photos: { vin: null } }));
  assert.equal(status, 400);
  assert.equal(uploads(mock).length, 0);
});
await test('finish rechaza un archivo que no es JPEG', async () => assert.equal((await call(finishReq({ photos: { frente: new File([new Uint8Array(20_000)], 'x.jpg') } }))).status, 415));
await test('finish rechaza una foto demasiado pequeña', async () => assert.equal((await call(finishReq({ photos: { odometro: jpeg(100) } }))).status, 413));
await test('finish rechaza una foto demasiado grande', async () => assert.equal((await call(finishReq({ photos: { trasera: jpeg(11 * 1024 * 1024) } }))).status, 413));
await test('finish rechaza un contactId inválido', async () => assert.equal((await call(finishReq({ contactId: 'a b' }))).status, 400));
await test('finish rechaza un contacto inexistente', async () => assert.equal((await call(finishReq({ contactId: 'missing123' }))).status, 400));
await test('finish rechaza un contacto de otra ubicación', async () => assert.equal((await call(finishReq({ contactId: 'other12345' }))).status, 400));
await test('finish rechaza un tipo de vehículo desconocido', async () => assert.equal((await call(finishReq({ meta: { ...META, vehicle: 'tanque' } }))).status, 400));
await test('finish rechaza una ubicación de VIN desconocida', async () => assert.equal((await call(finishReq({ meta: { ...META, vinLocation: 'techo' } }))).status, 400));
await test('finish rechaza datos meta que no son JSON', async () => assert.equal((await call(finishReq({ meta: 'no es json' }))).status, 400));
await test('finish avisa si falta configurar el campo «Fotos»', async () => {
  const { GHL_PHOTOS_FIELD_ID, ...withoutField } = ENV;
  assert.equal((await call(finishReq(), withoutField)).body.error, 'not_configured');
});
await test('finish tolera que falle la etiqueta (fotos y nota ya quedaron)', async () => {
  const mock = createMockGhl({ failures: { '/contacts/abc12345/tags': { status: 400, times: 5 } } });
  const { status, body } = await call(finishReq(), { ...ENV, GHL_TAGS: 'fotos-vehiculo' }, mock);
  assert.equal(status, 200);
  assert.deepEqual(body.warnings, ['tag_failed']);
});
await test('finish reintenta la subida ante un error temporal del CRM', async () => {
  const mock = createMockGhl({ failures: { '/forms/upload-custom-files': { status: 503, times: 1 } } });
  const { status, mock: used } = await call(finishReq(), ENV, mock);
  assert.equal(status, 200);
  assert.equal(uploads(used).length, 2);
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
  const response = await route(finishReq(), ENV, lenient);
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
  assert.equal(body.step, 'upsertContact');
  assert.ok(!JSON.stringify(body).includes('token-equivocado'));
});
await test('sin token configurado responde 500 not_configured', async () => assert.equal((await call(post('/api/start', PROFILE), { GHL_LOCATION_ID: 'x' })).body.error, 'not_configured'));
await test('solo acepta POST', async () => assert.equal((await call(new Request(SITE + '/api/start'))).status, 405));
await test('la ruta antigua /api/photo ya no existe', async () => assert.equal((await call(post('/api/photo', {}))).status, 404));
await test('rechaza peticiones desde otro origen', async () => assert.equal((await call(post('/api/start', PROFILE, { origin: 'https://otro-sitio.com' }))).status, 403));
await test('acepta peticiones del propio sitio', async () => assert.equal((await call(post('/api/start', PROFILE, { origin: SITE }))).status, 200));
await test('rechaza JSON demasiado grande', async () => assert.equal((await call(post('/api/start', { ...PROFILE, extra: 'x'.repeat(10_000) }))).status, 400));
await test('finish rechaza peticiones desde otro origen', async () => assert.equal((await call(finishReq({ headers: { origin: 'https://otro-sitio.com' } }))).status, 403));

console.log(`\n${total} pruebas del servidor`);
