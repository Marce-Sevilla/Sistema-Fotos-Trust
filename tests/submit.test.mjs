// Prueba el envío completo: cliente del navegador (src/api/submit.js) -> Worker (worker/api.js) -> CRM simulado.
import assert from 'node:assert/strict';
import { createSubmission, contactIdFromUrl, SubmitError } from '../src/api/submit.js';
import { route } from '../worker/api.js';
import { createMockGhl } from '../dev/mock-ghl.js';

let total = 0;
const test = async (name, fn) => {
  await fn();
  total += 1;
  console.log('ok  -', name);
};

const ENV = { GHL_TOKEN: 'dev-token', GHL_LOCATION_ID: 'dev-location', GHL_PHOTOS_FIELD_ID: 'FIELD123' };
const STEPS = ['frente', 'trasera', 'lateral-izquierdo', 'lateral-derecho', 'vin', 'odometro'];
const jpeg = () => {
  const bytes = new Uint8Array(30_000);
  bytes.set([0xff, 0xd8, 0xff]);
  return new Blob([bytes], { type: 'image/jpeg' });
};
const payload = (over = {}) => ({
  profile: { fullName: 'Juan Pérez', email: 'juan@example.com', phone: '3055550123', vehicle: 'sedan' },
  contactId: null,
  vinLocation: 'windshield',
  lang: 'es',
  photos: STEPS.map((step) => ({ step, blob: jpeg(), status: 'ok', value: step === 'vin' ? '1M8GDM9AXKP042788' : step === 'odometro' ? '087654' : undefined, checksumOk: step === 'vin' ? true : undefined })),
  ...over,
});

// Un "navegador" que habla con el Worker en memoria. `intercept` puede simular fallos de red o del servidor.
function setup({ mock = createMockGhl(), intercept, ...over } = {}) {
  const sent = [];
  const post = async (path, body, onProgress) => {
    sent.push(path);
    const hijack = intercept?.({ path, count: sent.filter((p) => p === path).length });
    if (hijack) return hijack;
    onProgress?.({ loaded: 50, total: 100 });
    const init = { method: 'POST', body, ...(typeof body === 'string' ? { headers: { 'content-type': 'application/json' } } : {}) };
    const response = await route(new Request(`https://fotos.example.com${path}`, init), ENV, mock.fetch);
    return { status: response.status, data: await response.json() };
  };
  return { sent, mock, submission: createSubmission(payload(over), { post, sleep: async () => {} }) };
}
const uploads = (mock) => mock.calls.filter((c) => c.path === '/forms/upload-custom-files');
const reply = (status, data = {}) => ({ status, data });

await test('contactIdFromUrl lee ?contact=', () => assert.equal(contactIdFromUrl('?contact=abc12345XYZ'), 'abc12345XYZ'));
await test('contactIdFromUrl acepta contactId y cid', () => {
  assert.equal(contactIdFromUrl('?contactId=zzzz99998888'), 'zzzz99998888');
  assert.equal(contactIdFromUrl('?cid=qwer12345678'), 'qwer12345678');
});
await test('contactIdFromUrl ignora valores inválidos', () => {
  assert.equal(contactIdFromUrl('?contact=../../etc'), null);
  assert.equal(contactIdFromUrl('?contact=ab'), null);
  assert.equal(contactIdFromUrl(''), null);
});

await test('envío completo: contacto y 6 fotos en una sola subida (sin nota ni etiquetas)', async () => {
  const { submission, mock, sent } = setup();
  const phases = [];
  const state = await submission.run((p) => phases.push(p.phase));
  assert.equal(state.finished, true);
  assert.deepEqual(sent, ['/api/start', '/api/finish']);
  assert.equal(uploads(mock).length, 1);
  assert.equal(uploads(mock)[0].form.length, 6);
  assert.equal(Object.keys(mock.fieldValues[`${state.contactId}:FIELD123`]).length, 6);
  assert.ok(!mock.calls.some((c) => c.path.endsWith('/notes') || c.path.endsWith('/tags')), 'solo se suben las fotos');
  assert.ok(!mock.calls.some((c) => c.path.startsWith('/medias')), 'no se usa la biblioteca de medios');
  assert.deepEqual([...new Set(phases)], ['contact', 'upload', 'done']);
});

await test('informa el progreso de la subida', async () => {
  const { submission } = setup();
  const seen = [];
  await submission.run((p) => p.phase === 'upload' && seen.push(p));
  assert.ok(seen.some((p) => p.loaded === 50 && p.total === 100));
});

await test('con el contacto del enlace se verifica y no se crea otro', async () => {
  const { submission, mock } = setup({ contactId: 'link12345678' });
  await submission.run();
  assert.ok(!mock.calls.some((c) => c.path === '/contacts/upsert'));
  assert.equal(uploads(mock)[0].query.contactId, 'link12345678');
});

await test('si la subida falla, el reintento no vuelve a crear el contacto', async () => {
  // /api/finish falla en los 3 intentos del primer envío y funciona después.
  const { submission, mock, sent } = setup({ intercept: ({ path, count }) => (path === '/api/finish' && count <= 3 ? reply(502, { error: 'crm_error' }) : null) });
  await assert.rejects(() => submission.run(), (error) => error instanceof SubmitError && error.stage === 'upload' && error.code === 'crm_error');
  assert.equal(submission.state.finished, false);
  const contactId = submission.state.contactId;
  assert.ok(contactId);

  await submission.run(); // segundo intento
  assert.equal(submission.state.finished, true);
  assert.equal(submission.state.contactId, contactId);
  assert.equal(sent.filter((p) => p === '/api/start').length, 1, 'el contacto no se vuelve a crear');
  assert.equal(uploads(mock).length, 1, 'solo la subida que funcionó llegó al CRM');
});

await test('repetir la subida no duplica fotos: el campo queda con exactamente 6', async () => {
  const mock = createMockGhl();
  const { submission } = setup({ mock });
  await submission.run();
  const contactId = submission.state.contactId;
  // Un segundo envío completo (por ejemplo, la persona lo repite) reemplaza las fotos, no las suma.
  const again = setup({ mock, contactId });
  await again.submission.run();
  assert.equal(Object.keys(mock.fieldValues[`${contactId}:FIELD123`]).length, 6);
});

await test('un error de red se reintenta y luego se informa como "network"', async () => {
  const { submission, sent } = setup({ intercept: ({ path }) => { if (path === '/api/start') throw new TypeError('Failed to fetch'); } });
  await assert.rejects(() => submission.run(), (error) => error.stage === 'contact' && error.code === 'network');
  assert.equal(sent.filter((p) => p === '/api/start').length, 3); // intento inicial + 2 reintentos
});

await test('un error temporal se supera con el reintento automático', async () => {
  const { submission, sent } = setup({ intercept: ({ path, count }) => (path === '/api/finish' && count === 1 ? reply(503) : null) });
  await submission.run();
  assert.equal(submission.state.finished, true);
  assert.equal(sent.filter((p) => p === '/api/finish').length, 2);
});

await test('un error 4xx no se reintenta y trae el código del servidor', async () => {
  const { submission, sent } = setup({ contactId: 'missing12345' });
  await assert.rejects(() => submission.run(), (error) => error.stage === 'contact' && error.code === 'invalid_contact' && error.status === 400);
  assert.equal(sent.filter((p) => p === '/api/start').length, 1);
  assert.equal(submission.state.finished, false);
});

await test('una vez terminado, run() no vuelve a enviar nada', async () => {
  const { submission, sent } = setup();
  await submission.run();
  const before = sent.length;
  await submission.run();
  assert.equal(sent.length, before);
});

console.log(`\n${total} pruebas del envío`);
