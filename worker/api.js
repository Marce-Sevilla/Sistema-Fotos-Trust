// API del Worker: recibe los datos y las fotos del wizard y las entrega a BritoCRM (GoHighLevel).
// El token del CRM vive solo aquí (secreto de Cloudflare); el navegador nunca lo ve.
//
//   POST /api/start   { fullName, email, phone, vehicle, contactId? }   -> { contactId, isNew }
//   POST /api/finish  multipart: contactId, meta (JSON), photo_<paso> x6 -> { ok, warnings }
//
// Las 6 fotos se adjuntan al campo personalizado "Fotos" del contacto (visible en su ficha). El CRM
// REEMPLAZA los archivos del campo en cada subida, así que las 6 van juntas en una sola llamada.
// Opcional (apagado por defecto): GHL_ADD_NOTE=true escribe una nota con los datos y GHL_TAGS pone etiquetas.
import { STEPS } from '../src/wizard/steps.js';
import { VEHICLE_TYPES } from '../src/wizard/guides.js';
import { validateProfile } from '../src/wizard/profile.js';
import { createGhlClient, GhlError, normalizePhone, splitName } from './ghl.js';

const STEP_IDS = STEPS.map((step) => step.id);
const VIN_LOCATIONS = ['windshield', 'door'];
const CONTACT_ID = /^[A-Za-z0-9]{8,40}$/;
const PHOTO_LIMITS = { minBytes: 10_000, maxBytes: 10 * 1024 * 1024 };
const MAX_JSON_BYTES = 8 * 1024;
const MAX_FINISH_BYTES = 42 * 1024 * 1024; // 6 fotos de hasta 10 MB más los datos

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const fail = (error, message, status = 400) => json({ error, message }, status);

// ---- Piezas puras (probadas por separado) ------------------------------------------

const STEP_LABELS = {
  frente: 'Frente',
  trasera: 'Trasera',
  'lateral-izquierdo': 'Lateral izquierdo',
  'lateral-derecho': 'Lateral derecho',
  vin: 'VIN',
  odometro: 'Odómetro',
};
const VEHICLE_LABELS = { sedan: 'Sedán', suv: 'SUV', pickup: 'Pickup', hatchback: 'Hatchback', minivan: 'Minivan' };
const LOCATION_LABELS = { windshield: 'parabrisas', door: 'puerta' };

// Nombre con el que se guarda cada foto en el CRM, y para reconocerla en la respuesta.
export const photoFileName = (step) => `${step}.jpg`;

// Texto de la nota que queda en el contacto del CRM. `links` (opcional): { paso: enlaceDeLaFoto }.
export function buildNote(data, now = new Date()) {
  const { profile, vehicle, vinLocation, links = {}, statuses = {}, readings = {} } = data;
  const lines = ['📸 Fotos del vehículo (Sistema de Fotos)', ''];
  lines.push(`Cliente: ${profile.fullName} · ${profile.email} · ${profile.phone}`);
  lines.push(`Vehículo: ${VEHICLE_LABELS[vehicle] ?? vehicle}`);
  lines.push(`Fecha: ${now.toISOString().replace('T', ' ').slice(0, 16)} UTC`, '');
  lines.push('Las 6 fotos están en el campo «Fotos» de este contacto.');
  for (const step of STEP_IDS) {
    const extra = step === 'vin' && vinLocation ? ` (en ${LOCATION_LABELS[vinLocation]})` : '';
    if (links[step]) lines.push(`${STEP_LABELS[step]}${extra}: ${links[step]}`);
    else if (extra) lines.push(`${STEP_LABELS[step]}${extra}`);
  }

  const unverified = STEP_IDS.filter((step) => statuses[step] === 'unverified').map((step) => STEP_LABELS[step]);
  lines.push('', unverified.length ? `⚠️ Sin verificar automáticamente (revisar a simple vista): ${unverified.join(', ')}` : '✅ Las 6 fotos pasaron la validación automática.');

  // Lecturas del OCR: solo de referencia; la persona no las confirmó.
  const reference = [];
  if (readings.vin?.value) reference.push(`VIN: ${readings.vin.value}${readings.vin.checksumOk === false ? ' (el dígito verificador no cuadra: posible error de lectura)' : ''}`);
  if (readings.odometer?.value) reference.push(`Kilometraje: ${readings.odometer.value}`);
  if (reference.length) lines.push('', 'Lectura automática (solo referencia, sin confirmar):', ...reference);
  return lines.join('\n');
}

// ---- Entrada y validación -------------------------------------------------------------

const parseJson = (text) => {
  if (typeof text !== 'string' || text.length > MAX_JSON_BYTES) return null;
  try {
    const data = JSON.parse(text);
    return data && typeof data === 'object' ? data : null;
  } catch {
    return null;
  }
};

async function looksLikeJpeg(file) {
  const bytes = new Uint8Array(await file.slice(0, 3).arrayBuffer());
  return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

function clientFor(env, fetchImpl) {
  return createGhlClient({ token: env.GHL_TOKEN, locationId: env.GHL_LOCATION_ID, version: env.GHL_API_VERSION || undefined, fetchImpl });
}

// Comprueba que el contacto exista en esta ubicación del CRM.
async function verifyContact(client, env, contactId) {
  try {
    const contact = await client.getContact(contactId);
    return !contact?.locationId || contact.locationId === env.GHL_LOCATION_ID;
  } catch (error) {
    if (error instanceof GhlError && (error.status === 404 || error.status === 400 || error.status === 422)) return false;
    throw error;
  }
}

// ---- Endpoints ------------------------------------------------------------------------

async function handleStart(request, env, fetchImpl) {
  const body = parseJson(await request.text());
  if (!body) return fail('invalid_request', 'Solicitud no válida.');
  if (body.hp) return fail('invalid_request', 'Solicitud no válida.'); // campo trampa para bots

  const profile = { fullName: String(body.fullName ?? ''), email: String(body.email ?? ''), phone: String(body.phone ?? ''), vehicle: String(body.vehicle ?? '') };
  if (Object.keys(validateProfile(profile)).length) return fail('invalid_profile', 'Los datos del cliente no son válidos.');

  const client = clientFor(env, fetchImpl);
  if (body.contactId) {
    if (!CONTACT_ID.test(String(body.contactId))) return fail('invalid_contact', 'El enlace no es válido.');
    if (!(await verifyContact(client, env, body.contactId))) return fail('invalid_contact', 'El enlace no es válido.');
    return json({ contactId: body.contactId, isNew: false });
  }

  const { firstName, lastName } = splitName(profile.fullName);
  const contact = { firstName, lastName, email: profile.email.trim(), phone: normalizePhone(profile.phone), source: 'Sistema de Fotos' };
  let result;
  try {
    result = await client.upsertContact(contact);
  } catch (error) {
    // Si el CRM rechaza el teléfono (formato), se reintenta sin él: el contacto se identifica por el correo.
    if (error instanceof GhlError && (error.status === 400 || error.status === 422) && contact.phone) result = await client.upsertContact({ ...contact, phone: '' });
    else throw error;
  }
  if (!result.id) return fail('crm_error', 'El CRM no devolvió el contacto.', 502);
  return json({ contactId: result.id, isNew: result.isNew });
}

async function handleFinish(request, env, fetchImpl) {
  if (!env.GHL_PHOTOS_FIELD_ID) return fail('not_configured', 'Falta configurar el campo «Fotos» del CRM.', 500);
  if (Number(request.headers.get('content-length') ?? 0) > MAX_FINISH_BYTES) return fail('too_large', 'Las fotos son demasiado pesadas.', 413);

  let form;
  try {
    form = await request.formData();
  } catch {
    return fail('invalid_request', 'Solicitud no válida.');
  }

  const contactId = String(form.get('contactId') ?? '');
  const meta = parseJson(form.get('meta'));
  if (!CONTACT_ID.test(contactId) || !meta) return fail('invalid_request', 'Solicitud no válida.');

  const profile = { fullName: String(meta.fullName ?? ''), email: String(meta.email ?? ''), phone: String(meta.phone ?? ''), vehicle: String(meta.vehicle ?? '') };
  const vinLocation = String(meta.vinLocation ?? '');
  if (!VEHICLE_TYPES.includes(profile.vehicle) || (vinLocation && !VIN_LOCATIONS.includes(vinLocation))) return fail('invalid_request', 'Solicitud no válida.');

  // Las 6 fotos son obligatorias: deben ser JPEG y de tamaño razonable.
  const files = [];
  for (const step of STEP_IDS) {
    const photo = form.get(`photo_${step}`);
    if (!photo || typeof photo === 'string') return fail('invalid_request', 'Falta una foto.');
    if (photo.size < PHOTO_LIMITS.minBytes || photo.size > PHOTO_LIMITS.maxBytes) return fail('invalid_photo', 'Una foto no tiene un tamaño válido.', 413);
    if (!(await looksLikeJpeg(photo))) return fail('invalid_photo', 'Las fotos deben ser imágenes JPEG.', 415);
    files.push({ step, blob: photo, name: photoFileName(step) });
  }

  const client = clientFor(env, fetchImpl);
  if (!(await verifyContact(client, env, contactId))) return fail('invalid_contact', 'El contacto no existe.');

  const uploaded = await client.uploadContactFiles(contactId, env.GHL_PHOTOS_FIELD_ID, files);
  const warnings = [];
  const links = {};
  for (const step of STEP_IDS) {
    const match = uploaded.find((file) => file.name === photoFileName(step));
    if (match?.url) links[step] = match.url;
  }
  if (uploaded.length !== STEP_IDS.length) warnings.push('photo_count_mismatch'); // el CRM no confirmó las 6 en su respuesta

  // Por defecto solo se suben las fotos. La nota y las etiquetas son opcionales (se activan con variables).
  if (env.GHL_ADD_NOTE === 'true') {
    const note = buildNote({ profile, vehicle: profile.vehicle, vinLocation, links, statuses: meta.statuses ?? {}, readings: meta.readings ?? {} });
    await client.addNote(contactId, note);
  }

  // Las etiquetas permiten que el CRM dispare automatizaciones; si fallan, las fotos ya quedaron guardadas.
  const tags = env.GHL_TAGS ? String(env.GHL_TAGS).split(',').map((tag) => tag.trim()).filter(Boolean) : [];
  if (tags.length) {
    try {
      await client.addTags(contactId, tags);
    } catch {
      warnings.push('tag_failed');
    }
  }
  return json({ ok: true, warnings });
}

// ---- Enrutador --------------------------------------------------------------------------

const ROUTES = { '/api/start': handleStart, '/api/finish': handleFinish };

export async function route(request, env, fetchImpl = fetch) {
  const url = new URL(request.url);
  const handler = ROUTES[url.pathname];
  if (!handler) return fail('not_found', 'No existe.', 404);
  if (request.method !== 'POST') return fail('method_not_allowed', 'Método no permitido.', 405);

  // Solo se aceptan peticiones del propio sitio (los navegadores envían Origin al hacer POST).
  const origin = request.headers.get('origin');
  if (origin && new URL(origin).host !== url.host) return fail('forbidden', 'Origen no permitido.', 403);

  if (!env.GHL_TOKEN || !env.GHL_LOCATION_ID) return fail('not_configured', 'La conexión con el CRM no está configurada.', 500);

  try {
    return await handler(request, env, fetchImpl);
  } catch (error) {
    if (error instanceof GhlError) {
      console.error(`[crm] ${error.step} -> ${error.status}: ${error.detail}`);
      // El detalle técnico queda en el registro del Worker; al navegador solo llega qué paso falló.
      return json({ error: 'crm_error', step: error.step, message: 'No pudimos entregar la información al CRM.' }, 502);
    }
    console.error('[api] error inesperado', error);
    return fail('server_error', 'Error inesperado.', 500);
  }
}
