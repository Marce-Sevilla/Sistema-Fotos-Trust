// Envío al CRM a través del Worker (/api/*). El token del CRM nunca pasa por el navegador.
//
// El envío se hace en tres etapas, y si algo falla se puede volver a llamar a `run()`: retoma donde quedó
// (no repite el contacto ni las fotos que ya subieron).
//   1. /api/start   -> contacto (el del enlace, o uno nuevo por correo/teléfono)
//   2. /api/photo   -> cada foto, una por una
//   3. /api/finish  -> nota con las fotos y etiqueta en el contacto
import { STEPS } from '../wizard/steps.js';

export class SubmitError extends Error {
  // stage: 'contact' | 'photo' | 'finish'.  code: 'network' o el código que devuelve el servidor.
  constructor(stage, code, status = 0) {
    super(`Envío falló en ${stage}: ${code}`);
    this.stage = stage;
    this.code = code;
    this.status = status;
  }
}

const RETRY_DELAYS_MS = [1000, 3000];
const REQUEST_TIMEOUT_MS = 90_000;
const CONTACT_PARAMS = ['contact', 'contactId', 'cid'];

// ID del contacto del CRM que viene en el enlace (?contact=ID); null si no hay o no es válido.
export function contactIdFromUrl(search) {
  const params = new URLSearchParams(search);
  for (const name of CONTACT_PARAMS) {
    const value = params.get(name);
    if (value && /^[A-Za-z0-9]{8,40}$/.test(value)) return value;
  }
  return null;
}

export function createSubmission(payload, { fetchImpl = (...args) => fetch(...args), sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) } = {}) {
  const state = { contactId: null, urls: {}, finished: false };

  async function call(stage, path, body) {
    for (let attempt = 0; ; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      let response;
      try {
        response = await fetchImpl(path, { method: 'POST', body, signal: controller.signal, ...(typeof body === 'string' ? { headers: { 'content-type': 'application/json' } } : {}) });
      } catch {
        // Sin conexión o tiempo agotado: se reintenta.
        if (attempt >= RETRY_DELAYS_MS.length) throw new SubmitError(stage, 'network');
        await sleep(RETRY_DELAYS_MS[attempt]);
        continue;
      } finally {
        clearTimeout(timer);
      }
      if ((response.status === 429 || response.status >= 500) && attempt < RETRY_DELAYS_MS.length) {
        await sleep(RETRY_DELAYS_MS[attempt]);
        continue;
      }
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new SubmitError(stage, data.error ?? `http_${response.status}`, response.status);
      return data;
    }
  }

  async function run(onProgress = () => {}) {
    if (state.finished) return state;
    const total = STEPS.length;
    const uploaded = () => Object.keys(state.urls).length;
    const { profile, lang, vinLocation } = payload;

    if (!state.contactId) {
      onProgress({ phase: 'contact', done: uploaded(), total });
      const started = await call('contact', '/api/start', JSON.stringify({ ...profile, contactId: payload.contactId ?? undefined }));
      state.contactId = started.contactId;
    }

    for (const photo of payload.photos) {
      if (state.urls[photo.step]) continue; // ya subió en un intento anterior
      onProgress({ phase: 'photo', step: photo.step, done: uploaded(), total });
      const form = new FormData();
      form.append('contactId', state.contactId);
      form.append('step', photo.step);
      form.append('photo', photo.blob, `${photo.step}.jpg`);
      const result = await call('photo', '/api/photo', form);
      state.urls[photo.step] = result.url;
    }

    onProgress({ phase: 'finish', done: uploaded(), total });
    const byStep = Object.fromEntries(payload.photos.map((photo) => [photo.step, photo]));
    await call(
      'finish',
      '/api/finish',
      JSON.stringify({
        contactId: state.contactId,
        ...profile,
        vinLocation: vinLocation || undefined,
        lang,
        photos: state.urls,
        statuses: Object.fromEntries(payload.photos.map((photo) => [photo.step, photo.status])),
        readings: {
          vin: byStep.vin?.value ? { value: byStep.vin.value, checksumOk: byStep.vin.checksumOk } : undefined,
          odometer: byStep.odometro?.value ? { value: byStep.odometro.value } : undefined,
        },
      }),
    );
    state.finished = true;
    onProgress({ phase: 'done', done: uploaded(), total });
    return state;
  }

  return { run, state };
}
