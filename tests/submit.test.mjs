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

const ENV = { GHL_TOKEN: 'dev-token', GHL_LOCATION_ID: 'dev-location' };
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
function setup({ mock = createMockGhl(), intercept } = {}) {
  const sent = [];
  const fetchImpl = async (path, init) => {
    const request = new Request(`https://fotos.example.com${path}`, init);
    const step = init.body instanceof FormData ? init.body.get('step') : undefined;
    sent.push({ path, step });
    const hijack = intercept?.({ path, step, count: sent.filter((s) => s.path === path && s.step === step).length });
    if (hijack) return hijack;
    return route(request, ENV, mock.fetch);
  };
  return { sent, mock, submission: createSubmission(payload(), { fetchImpl, sleep: async () => {} }) };
}
const count = (list, path) => list.filter((entry) => entry.path === path).length;

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

await test('envío completo: contacto, 6 fotos, nota y etiqueta', async () => {
  const { submission, mock, sent } = setup();
  const progress = [];
  const state = await submission.run((p) => progress.push(p.phase));
  assert.equal(state.finished, true);
  assert.equal(Object.keys(state.urls).length, 6);
  assert.equal(count(mock.calls.map((c) => ({ path: c.path })), '/medias/upload-file'), 6);
  assert.equal(count(sent, '/api/start'), 1);
  assert.equal(count(sent, '/api/finish'), 1);
  assert.ok(mock.calls.some((c) => c.path.endsWith('/notes')));
  assert.ok(mock.calls.some((c) => c.path.endsWith('/tags')));
  assert.deepEqual([...new Set(progress)], ['contact', 'photo', 'finish', 'done']);
});

await test('con el contacto del enlace se verifica y no se crea otro', async () => {
  const mock = createMockGhl();
  const sent = [];
  const submission = createSubmission(payload({ contactId: 'link12345678' }), {
    fetchImpl: (path, init) => (sent.push(path), route(new Request(`https://fotos.example.com${path}`, init), ENV, mock.fetch)),
    sleep: async () => {},
  });
  await submission.run();
  assert.ok(!mock.calls.some((c) => c.path === '/contacts/upsert'));
  assert.ok(mock.calls.some((c) => c.path === '/contacts/link12345678/notes'));
});

await test('si falla una foto, el reintento retoma sin repetir contacto ni fotos ya subidas', async () => {
  // La foto del VIN falla en los 3 intentos del primer envío y funciona después.
  const { submission, mock, sent } = setup({ intercept: ({ path, step, count: n }) => (path === '/api/photo' && step === 'vin' && n <= 3 ? new Response('{"error":"crm_error"}', { status: 502 }) : null) });
  await assert.rejects(() => submission.run(), (error) => error instanceof SubmitError && error.stage === 'photo');
  assert.equal(Object.keys(submission.state.urls).length, 4); // frente, trasera y los dos laterales
  assert.equal(submission.state.finished, false);

  await submission.run(); // segundo intento
  assert.equal(submission.state.finished, true);
  assert.equal(count(sent, '/api/start'), 1, 'el contacto no se vuelve a crear');
  assert.equal(count(mock.calls.map((c) => ({ path: c.path })), '/medias/upload-file'), 6, 'cada foto se sube una sola vez');
  assert.equal(count(sent, '/api/finish'), 1);
});

await test('un error de red se reintenta y luego se informa como "network"', async () => {
  const { submission, sent } = setup({ intercept: ({ path }) => { if (path === '/api/start') throw new TypeError('Failed to fetch'); } });
  await assert.rejects(() => submission.run(), (error) => error.stage === 'contact' && error.code === 'network');
  assert.equal(count(sent, '/api/start'), 3); // intento inicial + 2 reintentos
});

await test('un error temporal se supera con el reintento automático', async () => {
  const { submission, sent } = setup({ intercept: ({ path, step, count: n }) => (path === '/api/photo' && step === 'trasera' && n === 1 ? new Response('{}', { status: 503 }) : null) });
  await submission.run();
  assert.equal(submission.state.finished, true);
  assert.equal(sent.filter((s) => s.step === 'trasera').length, 2);
});

await test('un error 4xx no se reintenta y trae el código del servidor', async () => {
  const { submission, sent } = setup({ mock: createMockGhl() });
  const bad = createSubmission(payload({ contactId: 'missing12345' }), {
    fetchImpl: (path, init) => (sent.push({ path }), route(new Request(`https://fotos.example.com${path}`, init), ENV, createMockGhl().fetch)),
    sleep: async () => {},
  });
  await assert.rejects(() => bad.run(), (error) => error.stage === 'contact' && error.code === 'invalid_contact' && error.status === 400);
  assert.equal(count(sent, '/api/start'), 1);
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
