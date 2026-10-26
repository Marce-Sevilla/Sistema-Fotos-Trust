// API del Worker: recibe los datos y las fotos del wizard y las entrega a BritoCRM (GoHighLevel).
// El token del CRM vive solo aquí (secreto de Cloudflare); el navegador nunca lo ve.
//
//   POST /api/start   { fullName, email, phone, vehicle, contactId? }   -> { contactId, isNew }
//   POST /api/finish  multipart: contactId, meta (JSON), photo_<paso> x6 -> { ok, warnings }
//
// Las 6 fotos se adjuntan al campo personalizado "Fotos" del contacto (visible en su ficha). El CRM
// REEMPLAZA los archivos del campo en cada subida, así que las 6 van juntas en una sola llamada. El servidor NO abre\n// las fotos: reenvía el cuerpo multipart que arma el navegador, para gastar muy poca CPU (ver handleFinish).
// Opcional (apagado por defecto): GHL_ADD_NOTE=true escribe una nota con los datos y GHL_TAGS pone etiquetas.
import { STEPS } from '../src/wizard/steps.js';
import { VEHICLE_TYPES } from '../src/wizard/guides.js';
import { validateProfile } from '../src/wizard/profile.js';
import { decodeMeta } from '../src/api/meta.js';
import { createGhlClient, GhlError, normalizePhone, splitName } from './ghl.js';

const STEP_IDS = STEPS.map((step) => step.id);
const VIN_LOCATIONS = ['windshield', 'door'];
const CONTACT_ID = /^[A-Za-z0-9]{8,40}$/;
const MAX_JSON_BYTES = 8 * 1024;
// Campo personalizado «Fotos» (tipo archivo) del contacto en el CRM de Trust. No es secreto. Vive aquí y no en
// wrangler.jsonc a propósito: las variables de ese archivo hacen que cada despliegue reemplace las del panel
// de Cloudflare y borre las que no estén (por ejemplo un GHL_TOKEN guardado como variable de texto).
const DEFAULT_PHOTOS_FIELD_ID = 'btVvykNbwpKlMzvMK7MA';
const photosFieldId = (env) => env.GHL_PHOTOS_FIELD_ID || DEFAULT_PHOTOS_FIELD_ID;
const MAX_FINISH_BYTES = 42 * 1024 * 1024; // 6 fotos de hasta ~7 MB cada una
const MIN_FINISH_BYTES = 60 * 1024; // 6 fotos de verdad pesan mucho más; menos que esto es una petición incompleta

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
    return json({ contactId: body.contactId, isNew: false, photosFieldId: photosFieldId(env) });
  }

  const { firstName, lastName } = splitName(profile.fullName);
  const contact = { firstName, lastName, email: profile.email.trim(), phone: normalizePhone(profile.phone), source: 'Sistema de Fotos' };

  // Si la persona ya es un contacto (por correo o teléfono), se usa tal cual: no se modifica ninguno de sus datos.
  const existing = await client.findContact({ email: contact.email, phone: contact.phone });
  if (existing?.id) return json({ contactId: existing.id, isNew: false, photosFieldId: photosFieldId(env) });

  let result;
  try {
    result = await client.upsertContact(contact);
  } catch (error) {
    // Si el CRM rechaza el teléfono (formato), se reintenta sin él: el contacto se identifica por el correo.
    if (error instanceof GhlError && (error.status === 400 || error.status === 422) && contact.phone) result = await client.upsertContact({ ...contact, phone: '' });
    else throw error;
  }
  if (!result.id) return fail('crm_error', 'El CRM no devolvió el contacto.', 502);
  return json({ contactId: result.id, isNew: result.isNew, photosFieldId: photosFieldId(env) });
}

// Cuerpo con longitud fija: algunos servidores rechazan las subidas "por trozos" (sin Content-Length). En
// Cloudflare, FixedLengthStream permite reenviar el flujo conservando la longitud original.
function lengthBoundBody(request, length) {
  if (typeof FixedLengthStream === 'undefined') return request.body;
  const { readable, writable } = new FixedLengthStream(length);
  request.body.pipeTo(writable).catch(() => {});
  return readable;
}

async function handleFinish(request, env, fetchImpl) {
  
  const url = new URL(request.url);
  const contactId = url.searchParams.get('contactId') ?? '';
  if (!CONTACT_ID.test(contactId)) return fail('invalid_request', 'Solicitud no válida.');

  // Las fotos NO se abren aquí: el navegador ya armó el cuerpo multipart con los archivos nombrados como pide
  // el CRM, y se reenvía tal cual. Abrirlas (formData) y volver a armarlas gastaba ~10 ms de CPU, el límite
  // entero del plan gratuito de Cloudflare, y a veces lo superaba (error 500).
  const contentType = request.headers.get('content-type') ?? '';
  const length = Number(request.headers.get('content-length') ?? 0);
  if (!contentType.startsWith('multipart/form-data') || !request.body || !length) return fail('invalid_request', 'Solicitud no válida.');
  if (length > MAX_FINISH_BYTES) return fail('too_large', 'Las fotos son demasiado pesadas.', 413);
  if (length < MIN_FINISH_BYTES) return fail('invalid_photo', 'Faltan fotos.', 400);

  const client = clientFor(env, fetchImpl);
  if (!(await verifyContact(client, env, contactId))) return fail('invalid_contact', 'El contacto no existe.');

  // Un solo intento: el flujo de la petición se consume una vez. Si falla, el navegador reintenta todo el envío
  // (es seguro: el CRM reemplaza los archivos del campo, nunca los duplica).
  const uploaded = await client.forwardContactFiles(contactId, photosFieldId(env), { body: lengthBoundBody(request, length), contentType, contentLength: length });

  const warnings = [];
  if (uploaded.length !== STEP_IDS.length) warnings.push('photo_count_mismatch'); // el CRM no confirmó las 6 en su respuesta

  // Opcional (apagado por defecto): nota con los datos. Los datos de apoyo vienen en la dirección (ver src/api/meta.js).
  if (env.GHL_ADD_NOTE === 'true') {
    const meta = decodeMeta(url.searchParams.get('meta'));
    const vinLocation = String(meta?.vinLocation ?? '');
    if (!meta || !VEHICLE_TYPES.includes(String(meta.vehicle)) || (vinLocation && !VIN_LOCATIONS.includes(vinLocation))) {
      warnings.push('note_skipped');
    } else {
      const links = {};
      for (const step of STEP_IDS) {
        const match = uploaded.find((file) => file.name === photoFileName(step));
        if (match?.url) links[step] = match.url;
      }
      const profile = { fullName: String(meta.fullName ?? ''), email: String(meta.email ?? ''), phone: String(meta.phone ?? '') };
      await client.addNote(contactId, buildNote({ profile, vehicle: String(meta.vehicle), vinLocation, links, statuses: meta.statuses ?? {}, readings: meta.readings ?? {} }));
    }
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

  const missing = ['GHL_TOKEN', 'GHL_LOCATION_ID'].filter((name) => !env[name]);
  if (missing.length) {
    console.error('[config] faltan variables del Worker:', missing.join(', '));
    return json({ error: 'not_configured', message: 'La conexión con el CRM no está configurada.', missing }, 500);
  }

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
