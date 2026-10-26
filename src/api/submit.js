// Envío al CRM a través del Worker (/api/*). El token del CRM nunca pasa por el navegador.
//
// El envío tiene dos etapas, y si algo falla se puede volver a llamar a `run()`:
//   1. /api/start   -> contacto (el del enlace, o uno nuevo por correo/teléfono). Se hace una sola vez.
//   2. /api/finish  -> las 6 fotos JUNTAS + datos. El CRM reemplaza (no suma) los archivos del campo "Fotos",
//                      así que repetir esta etapa es seguro: nunca deja fotos duplicadas.
import { STEPS } from '../wizard/steps.js';

export class SubmitError extends Error {
  // stage: 'contact' | 'upload'.  code: 'network' o el código que devuelve el servidor.
  constructor(stage, code, status = 0) {
    super(`Envío falló en ${stage}: ${code}`);
    this.stage = stage;
    this.code = code;
    this.status = status;
  }
}

const RETRY_DELAYS_MS = [1000, 3000];
const REQUEST_TIMEOUT_MS = 120_000;
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

// POST que devuelve { status, data }. Para los archivos usa XMLHttpRequest porque fetch no informa el
// progreso de la subida. Lanza si no hay conexión o se agota el tiempo.
function defaultPost(path, body, onProgress) {
  if (!(body instanceof FormData)) {
    return fetch(path, { method: 'POST', body, headers: { 'content-type': 'application/json' } }).then(async (response) => ({ status: response.status, data: await response.json().catch(() => ({})) }));
  }
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', path);
    xhr.timeout = REQUEST_TIMEOUT_MS;
    xhr.upload.onprogress = (event) => event.lengthComputable && onProgress?.({ loaded: event.loaded, total: event.total });
    xhr.onload = () => {
      let data = {};
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        // respuesta sin JSON: se informa solo el código HTTP
      }
      resolve({ status: xhr.status, data });
    };
    xhr.onerror = xhr.ontimeout = xhr.onabort = () => reject(new Error('network'));
    xhr.send(body);
  });
}

export function createSubmission(payload, { post = defaultPost, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) } = {}) {
  const state = { contactId: null, finished: false };

  // `expect` comprueba que la respuesta sea la del servidor del CRM. Sin esto, cualquier 2xx (por ejemplo la
  // página del sitio devuelta por error en lugar de la API) se daría por buena y se mostraría un falso "¡Listo!".
  async function call(stage, path, body, onProgress, expect) {
    for (let attempt = 0; ; attempt++) {
      let response;
      try {
        response = await post(path, body, onProgress);
      } catch {
        // Sin conexión o tiempo agotado: se reintenta.
        if (attempt >= RETRY_DELAYS_MS.length) throw new SubmitError(stage, 'network');
        await sleep(RETRY_DELAYS_MS[attempt]);
        continue;
      }
      if ((response.status === 429 || response.status >= 500) && attempt < RETRY_DELAYS_MS.length) {
        await sleep(RETRY_DELAYS_MS[attempt]);
        continue;
      }
      if (response.status < 200 || response.status >= 300) throw new SubmitError(stage, response.data?.error ?? `http_${response.status}`, response.status);
      if (!expect(response.data)) throw new SubmitError(stage, 'invalid_response', response.status);
      return response.data;
    }
  }

  async function run(onProgress = () => {}) {
    if (state.finished) return state;
    const { profile, lang, vinLocation } = payload;

    if (!state.contactId) {
      onProgress({ phase: 'contact' });
      const started = await call('contact', '/api/start', JSON.stringify({ ...profile, contactId: payload.contactId ?? undefined }), undefined, (data) => typeof data?.contactId === 'string' && data.contactId.length > 0);
      state.contactId = started.contactId;
    }

    const byStep = Object.fromEntries(payload.photos.map((photo) => [photo.step, photo]));
    const form = new FormData();
    form.append('contactId', state.contactId);
    form.append(
      'meta',
      JSON.stringify({
        ...profile,
        vinLocation: vinLocation || undefined,
        lang,
        statuses: Object.fromEntries(payload.photos.map((photo) => [photo.step, photo.status])),
        readings: {
          vin: byStep.vin?.value ? { value: byStep.vin.value, checksumOk: byStep.vin.checksumOk } : undefined,
          odometer: byStep.odometro?.value ? { value: byStep.odometro.value } : undefined,
        },
      }),
    );
    for (const step of STEPS) form.append(`photo_${step.id}`, byStep[step.id].blob, `${step.id}.jpg`);

    onProgress({ phase: 'upload', loaded: 0, total: 1 });
    await call('upload', '/api/finish', form, (progress) => onProgress({ phase: 'upload', ...progress }), (data) => data?.ok === true);
    state.finished = true;
    onProgress({ phase: 'done' });
    return state;
  }

  return { run, state };
}
