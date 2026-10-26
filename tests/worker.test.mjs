import assert from 'node:assert/strict';
import { route, buildNote, isAllowedPhotoUrl } from '../worker/api.js';
import { normalizePhone, splitName } from '../worker/ghl.js';
import { createMockGhl } from '../dev/mock-ghl.js';

let total = 0;
const test = async (name, fn) => {
  await fn();
  total += 1;
  console.log('ok  -', name);
};

const SITE = 'https://fotos.example.com';
const ENV = { GHL_TOKEN: 'dev-token', GHL_LOCATION_ID: 'dev-location' };
const STEPS = ['frente', 'trasera', 'lateral-izquierdo', 'lateral-derecho', 'vin', 'odometro'];
const PROFILE = { fullName: 'Juan Pérez', email: 'juan@example.com', phone: '3055550123', vehicle: 'suv' };
const URLS = Object.fromEntries(STEPS.map((step) => [step, `https://storage.googleapis.com/bucket/${step}.jpg`]));

const post = (path, body, headers = {}) => new Request(SITE + path, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
const jpeg = (size = 20_000) => {
  const bytes = new Uint8Array(size);
  bytes.set([0xff, 0xd8, 0xff]);
  return new File([bytes], 'foto.jpg', { type: 'image/jpeg' });
};
const photoReq = ({ contactId = 'abc12345', step = 'frente', photo = jpeg() } = {}) => {
  const form = new FormData();
  if (contactId !== null) form.append('contactId', contactId);
  if (step !== null) form.append('step', step);
  if (photo !== null) form.append('photo', photo);
  return new Request(SITE + '/api/photo', { method: 'POST', body: form });
};
const call = async (request, env = ENV, mock = createMockGhl()) => {
  const response = await route(request, env, mock.fetch);
  return { status: response.status, body: await response.json(), mock };
};

// ---- Utilidades ----
await test('teléfono de 10 dígitos recibe +1', () => assert.equal(normalizePhone('(305) 555-0123'), '+13055550123'));
await test('teléfono con 1 inicial', () => assert.equal(normalizePhone('1 305 555 0123'), '+13055550123'));
await test('teléfono internacional se respeta', () => assert.equal(normalizePhone('+57 300 123 4567'), '+573001234567'));
await test('teléfono vacío', () => assert.equal(normalizePhone(''), ''));
await test('nombre y apellido', () => assert.deepEqual(splitName('Juan Pérez'), { firstName: 'Juan', lastName: 'Pérez' }));
await test('nombre con varios apellidos', () => assert.deepEqual(splitName('Juan Carlos Pérez Gómez'), { firstName: 'Juan', lastName: 'Carlos Pérez Gómez' }));
await test('URL permitida: almacenamiento del CRM', () => assert.equal(isAllowedPhotoUrl('https://storage.googleapis.com/a/b.jpg'), true));
await test('URL no permitida: otro sitio', () => assert.equal(isAllowedPhotoUrl('https://evil.example.com/a.jpg'), false));
await test('URL no permitida: http', () => assert.equal(isAllowedPhotoUrl('http://storage.googleapis.com/a.jpg'), false));
await test('URL no permitida: dominio parecido', () => assert.equal(isAllowedPhotoUrl('https://googleapis.com.evil.com/a.jpg'), false));

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

// ---- /api/photo ----
await test('photo sube a la biblioteca de medios y devuelve la URL', async () => {
  const { status, body, mock } = await call(photoReq());
  assert.equal(status, 200);
  assert.equal(body.step, 'frente');
  assert.match(body.url, /^https:\/\/storage\.googleapis\.com\//);
  const upload = mock.calls.find((c) => c.path === '/medias/upload-file');
  const file = upload.form.find((f) => f.key === 'file');
  assert.equal(file.size, 20_000);
  assert.match(file.filename, /^abc12345-frente-\d+\.jpg$/);
});
await test('photo rechaza un archivo que no es JPEG', async () => assert.equal((await call(photoReq({ photo: new File([new Uint8Array(20_000)], 'x.jpg') }))).status, 415));
await test('photo rechaza un archivo demasiado pequeño', async () => assert.equal((await call(photoReq({ photo: jpeg(100) }))).status, 413));
await test('photo rechaza un archivo demasiado grande', async () => assert.equal((await call(photoReq({ photo: jpeg(11 * 1024 * 1024) }))).status, 413));
await test('photo rechaza un paso desconocido', async () => assert.equal((await call(photoReq({ step: 'techo' }))).status, 400));
await test('photo rechaza si falta la foto', async () => assert.equal((await call(photoReq({ photo: null }))).status, 400));
await test('photo rechaza un contactId inválido', async () => assert.equal((await call(photoReq({ contactId: 'a b' }))).status, 400));
await test('photo también adjunta al campo de archivo del contacto si está configurado', async () => {
  const env = { ...ENV, GHL_PHOTO_FIELD_IDS: JSON.stringify({ frente: 'FIELD123' }) };
  const { status, mock } = await call(photoReq(), env);
  assert.equal(status, 200);
  const custom = mock.calls.find((c) => c.path === '/forms/upload-custom-files');
  assert.deepEqual(custom.query, { contactId: 'abc12345', locationId: 'dev-location' });
  assert.match(custom.form[0].key, /^FIELD123_[0-9a-f-]{36}$/);
});
await test('photo sigue funcionando si falla el campo de archivo (solo avisa)', async () => {
  const env = { ...ENV, GHL_PHOTO_FIELD_IDS: JSON.stringify({ frente: 'FIELD123' }) };
  const mock = createMockGhl({ failures: { '/forms/upload-custom-files': { status: 400, times: 5 } } });
  const { status, body } = await call(photoReq(), env, mock);
  assert.equal(status, 200);
  assert.deepEqual(body.warnings, ['custom_field_upload_failed']);
});
await test('photo reintenta ante un error temporal del CRM', async () => {
  const mock = createMockGhl({ failures: { '/medias/upload-file': { status: 503, times: 1 } } });
  const { status, mock: used } = await call(photoReq(), ENV, mock);
  assert.equal(status, 200);
  assert.equal(used.calls.filter((c) => c.path === '/medias/upload-file').length, 2);
});

// ---- /api/finish ----
const finishBody = (over = {}) => ({ contactId: 'abc12345', ...PROFILE, vinLocation: 'door', photos: URLS, statuses: { vin: 'unverified' }, readings: { vin: { value: '1M8GDM9AXKP042788', checksumOk: true }, odometer: { value: '087654' } }, ...over });
await test('finish crea la nota con las 6 fotos y pone la etiqueta', async () => {
  const { status, body, mock } = await call(post('/api/finish', finishBody()));
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  const note = mock.calls.find((c) => c.path === '/contacts/abc12345/notes').json.body;
  for (const step of STEPS) assert.ok(note.includes(URLS[step]), `nota incluye ${step}`);
  assert.match(note, /Vehículo: SUV/);
  assert.match(note, /VIN \(en puerta\)/);
  assert.match(note, /Sin verificar automáticamente.*VIN/);
  assert.match(note, /Kilometraje: 087654/);
  assert.deepEqual(mock.calls.find((c) => c.path === '/contacts/abc12345/tags').json.tags, ['fotos-vehiculo']);
});
await test('finish usa las etiquetas configuradas', async () => {
  const { mock } = await call(post('/api/finish', finishBody()), { ...ENV, GHL_TAGS: 'fotos-ok, fase-1' });
  assert.deepEqual(mock.calls.find((c) => c.path.endsWith('/tags')).json.tags, ['fotos-ok', 'fase-1']);
});
await test('finish rechaza enlaces de fotos de otro sitio', async () => assert.equal((await call(post('/api/finish', finishBody({ photos: { ...URLS, vin: 'https://evil.example.com/x.jpg' } })))).status, 400));
await test('finish rechaza si falta una foto', async () => {
  const { vin, ...incomplete } = URLS;
  assert.equal((await call(post('/api/finish', finishBody({ photos: incomplete })))).status, 400);
});
await test('finish rechaza un contacto inexistente', async () => assert.equal((await call(post('/api/finish', finishBody({ contactId: 'missing123' })))).status, 400));
await test('finish rechaza un tipo de vehículo desconocido', async () => assert.equal((await call(post('/api/finish', finishBody({ vehicle: 'tanque' })))).status, 400));
await test('finish tolera que falle la etiqueta (la nota ya quedó)', async () => {
  const mock = createMockGhl({ failures: { '/contacts/abc12345/tags': { status: 400, times: 5 } } });
  const { status, body } = await call(post('/api/finish', finishBody()), ENV, mock);
  assert.equal(status, 200);
  assert.deepEqual(body.warnings, ['tag_failed']);
});

// ---- Nota ----
await test('la nota avisa si el dígito verificador del VIN no cuadra', () => {
  const note = buildNote({ profile: PROFILE, vehicle: 'sedan', vinLocation: 'windshield', photos: URLS, statuses: {}, readings: { vin: { value: '1M8GDM9AXKP042789', checksumOk: false } } }, new Date('2026-10-26T15:04:00Z'));
  assert.match(note, /no cuadra/);
  assert.match(note, /Fecha: 2026-10-26 15:04 UTC/);
  assert.match(note, /Las 6 fotos pasaron/);
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
await test('ruta desconocida da 404', async () => assert.equal((await call(post('/api/otra', {}))).status, 404));
await test('rechaza peticiones desde otro origen', async () => assert.equal((await call(post('/api/start', PROFILE, { origin: 'https://otro-sitio.com' }))).status, 403));
await test('acepta peticiones del propio sitio', async () => assert.equal((await call(post('/api/start', PROFILE, { origin: SITE }))).status, 200));
await test('rechaza JSON demasiado grande', async () => assert.equal((await call(post('/api/start', { ...PROFILE, extra: 'x'.repeat(10_000) }))).status, 400));

console.log(`\n${total} pruebas del servidor`);
