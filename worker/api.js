// API del Worker: recibe los datos y las fotos del wizard y las entrega a BritoCRM (GoHighLevel).
// El token del CRM vive solo aquí (secreto de Cloudflare); el navegador nunca lo ve.
//
//   POST /api/start   { fullName, email, phone, vehicle, contactId? }  -> { contactId, isNew }
//   POST /api/photo   multipart: contactId, step, photo                -> { step, url }
//   POST /api/finish  { contactId, vehicle, vinLocation, photos, ... } -> { ok, warnings }
//
// Las fotos se suben una por una: así hay progreso, se reintenta solo la que falla y cada petición es pequeña.
import { STEPS } from '../src/wizard/steps.js';
import { VEHICLE_TYPES } from '../src/wizard/guides.js';
import { validateProfile } from '../src/wizard/profile.js';
import { createGhlClient, GhlError, normalizePhone, splitName } from './ghl.js';

const STEP_IDS = STEPS.map((step) => step.id);
const VIN_LOCATIONS = ['windshield', 'door'];
const CONTACT_ID = /^[A-Za-z0-9]{8,40}$/;
const PHOTO_LIMITS = { minBytes: 10_000, maxBytes: 10 * 1024 * 1024 };
const MAX_JSON_BYTES = 8 * 1024;
const MAX_PHOTO_REQUEST_BYTES = PHOTO_LIMITS.maxBytes + 64 * 1024;
const DEFAULT_TAGS = ['fotos-vehiculo'];
// Las URL que devuelve el CRM para los archivos subidos; no se aceptan enlaces de otros sitios en la nota.
const ALLOWED_PHOTO_HOSTS = [/(^|\.)googleapis\.com$/, /(^|\.)leadconnectorhq\.com$/, /(^|\.)msgsndr\.com$/];

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

export function isAllowedPhotoUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && ALLOWED_PHOTO_HOSTS.some((host) => host.test(url.hostname));
  } catch {
    return false;
  }
}

// Texto de la nota que queda en el contacto del CRM.
export function buildNote(data, now = new Date()) {
  const { profile, vehicle, vinLocation, photos, statuses = {}, readings = {} } = data;
  const lines = ['📸 Fotos del vehículo (Sistema de Fotos)', ''];
  lines.push(`Cliente: ${profile.fullName} · ${profile.email} · ${profile.phone}`);
  lines.push(`Vehículo: ${VEHICLE_LABELS[vehicle] ?? vehicle}`);
  lines.push(`Fecha: ${now.toISOString().replace('T', ' ').slice(0, 16)} UTC`, '');
  for (const step of STEP_IDS) {
    const extra = step === 'vin' && vinLocation ? ` (en ${LOCATION_LABELS[vinLocation]})` : '';
    lines.push(`${STEP_LABELS[step]}${extra}: ${photos[step]}`);
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

async function readJson(request) {
  const text = await request.text();
  if (text.length > MAX_JSON_BYTES) return null;
  try {
    const data = JSON.parse(text);
    return data && typeof data === 'object' ? data : null;
  } catch {
    return null;
  }
}

async function looksLikeJpeg(file) {
  const bytes = new Uint8Array(await file.slice(0, 3).arrayBuffer());
  return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

function clientFor(env, fetchImpl) {
  return createGhlClient({ token: env.GHL_TOKEN, locationId: env.GHL_LOCATION_ID, version: env.GHL_API_VERSION || undefined, fetchImpl });
}

function photoFieldIds(env) {
  try {
    const map = env.GHL_PHOTO_FIELD_IDS ? JSON.parse(env.GHL_PHOTO_FIELD_IDS) : {};
    return map && typeof map === 'object' ? map : {};
  } catch {
    return {};
  }
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
  const body = await readJson(request);
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

async function handlePhoto(request, env, fetchImpl) {
  if (Number(request.headers.get('content-length') ?? 0) > MAX_PHOTO_REQUEST_BYTES) return fail('too_large', 'La foto es demasiado grande.', 413);
  let form;
  try {
    form = await request.formData();
  } catch {
    return fail('invalid_request', 'Solicitud no válida.');
  }

  const contactId = String(form.get('contactId') ?? '');
  const step = String(form.get('step') ?? '');
  const photo = form.get('photo');
  if (!CONTACT_ID.test(contactId) || !STEP_IDS.includes(step) || !photo || typeof photo === 'string') return fail('invalid_request', 'Solicitud no válida.');
  if (photo.size < PHOTO_LIMITS.minBytes || photo.size > PHOTO_LIMITS.maxBytes) return fail('invalid_photo', 'La foto no tiene un tamaño válido.', 413);
  if (!(await looksLikeJpeg(photo))) return fail('invalid_photo', 'La foto debe ser una imagen JPEG.', 415);

  const client = clientFor(env, fetchImpl);
  const name = `${contactId}-${step}-${Date.now()}.jpg`;
  const media = await client.uploadMedia(photo, name, env.GHL_MEDIA_FOLDER_ID || undefined);
  if (!media.url) return fail('crm_error', 'El CRM no devolvió la dirección de la foto.', 502);

  // Opcional: si Trust creó campos de archivo en el contacto, la foto también se adjunta ahí.
  const warnings = [];
  const fieldId = photoFieldIds(env)[step];
  if (fieldId) {
    try {
      await client.uploadCustomFile(contactId, fieldId, photo, name);
    } catch {
      warnings.push('custom_field_upload_failed');
    }
  }
  return json({ step, url: media.url, warnings });
}

async function handleFinish(request, env, fetchImpl) {
  const body = await readJson(request);
  if (!body) return fail('invalid_request', 'Solicitud no válida.');

  const contactId = String(body.contactId ?? '');
  const photos = body.photos ?? {};
  const profile = { fullName: String(body.fullName ?? ''), email: String(body.email ?? ''), phone: String(body.phone ?? ''), vehicle: String(body.vehicle ?? '') };
  const vinLocation = String(body.vinLocation ?? '');
  const photosValid = STEP_IDS.every((step) => typeof photos[step] === 'string' && isAllowedPhotoUrl(photos[step]));
  if (!CONTACT_ID.test(contactId) || !photosValid || !VEHICLE_TYPES.includes(profile.vehicle) || (vinLocation && !VIN_LOCATIONS.includes(vinLocation))) {
    return fail('invalid_request', 'Solicitud no válida.');
  }

  const client = clientFor(env, fetchImpl);
  if (!(await verifyContact(client, env, contactId))) return fail('invalid_contact', 'El contacto no existe.');

  const note = buildNote({ profile, vehicle: profile.vehicle, vinLocation, photos, statuses: body.statuses ?? {}, readings: body.readings ?? {} });
  await client.addNote(contactId, note);

  // La etiqueta permite que el CRM dispare automatizaciones; si falla, las fotos ya quedaron guardadas en la nota.
  const warnings = [];
  const tags = (env.GHL_TAGS ? String(env.GHL_TAGS).split(',').map((tag) => tag.trim()).filter(Boolean) : DEFAULT_TAGS);
  try {
    await client.addTags(contactId, tags);
  } catch {
    warnings.push('tag_failed');
  }
  return json({ ok: true, warnings });
}

// ---- Enrutador --------------------------------------------------------------------------

const ROUTES = { '/api/start': handleStart, '/api/photo': handlePhoto, '/api/finish': handleFinish };

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
