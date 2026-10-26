// Verifica la conexión REAL con BritoCRM (GoHighLevel) antes de publicar.
//
//   1. Crea el archivo .dev.vars (no se sube a git) con:   GHL_TOKEN=...   GHL_LOCATION_ID=...
//   2. npm run check:ghl            (o: node scripts/check-ghl.mjs ruta/a/una-foto.jpg)
//
// Crea un contacto de prueba, sube una foto, escribe la nota, pone la etiqueta y borra el contacto.
// Cada paso dice si funcionó; si falla, indica la causa más probable (token, permisos, formato).
import { readFileSync, existsSync } from 'node:fs';
import { createGhlClient, GhlError } from '../worker/ghl.js';

function loadVars() {
  const vars = { ...process.env };
  if (existsSync('.dev.vars')) {
    for (const line of readFileSync('.dev.vars', 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (match && !line.trim().startsWith('#')) vars[match[1]] = match[2].replace(/^["']|["']$/g, '');
    }
  }
  return vars;
}

const vars = loadVars();
if (!vars.GHL_TOKEN || !vars.GHL_LOCATION_ID) {
  console.error('Faltan GHL_TOKEN y/o GHL_LOCATION_ID. Créalos en el archivo .dev.vars (una línea por variable).');
  process.exit(1);
}

// Una imagen JPEG mínima (1x1), por si no se indica una foto real.
const TINY_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+iiigD/2Q==',
  'base64',
);
const photoPath = process.argv[2];
const photoBytes = photoPath ? readFileSync(photoPath) : TINY_JPEG;

// GHL_BASE_URL solo sirve para probar este mismo script contra un CRM simulado; en la práctica no se define.
const client = createGhlClient({ token: vars.GHL_TOKEN, locationId: vars.GHL_LOCATION_ID, version: vars.GHL_API_VERSION || undefined, baseUrl: vars.GHL_BASE_URL || undefined });

const HINTS = {
  401: 'El token no es válido o fue revocado. Revisa GHL_TOKEN (Ajustes > Integraciones privadas).',
  403: 'El token no tiene permiso para esto. Agrega el scope que falta en la integración privada (contacts.write, contacts.readonly, medias.write).',
  404: 'No se encontró. Revisa GHL_LOCATION_ID, o el recurso no existe en esta subcuenta.',
  422: 'El CRM rechazó los datos (formato). Mira el detalle de arriba.',
  429: 'Demasiadas peticiones. Espera un minuto y vuelve a intentar.',
};

let failures = 0;
async function step(name, fn) {
  try {
    const result = await fn();
    console.log(`✓ ${name}`, result ? `→ ${result}` : '');
    return result;
  } catch (error) {
    failures += 1;
    if (error instanceof GhlError) {
      console.log(`✗ ${name} → HTTP ${error.status}: ${error.detail}`);
      if (HINTS[error.status]) console.log(`  ${HINTS[error.status]}`);
    } else {
      console.log(`✗ ${name} →`, error.message);
    }
    return null;
  }
}

console.log(`Probando BritoCRM (ubicación ${vars.GHL_LOCATION_ID}, Version ${vars.GHL_API_VERSION || '2021-07-28'})\n`);

const email = `prueba+${Date.now()}@example.com`;
const contact = await step('Crear contacto de prueba (upsert)', async () => (await client.upsertContact({ firstName: 'Prueba', lastName: 'Sistema Fotos', email, source: 'Sistema de Fotos (verificación)' })).id);
if (contact) {
  await step('Leer el contacto', async () => (await client.getContact(contact)).locationId === vars.GHL_LOCATION_ID ? 'pertenece a esta ubicación' : 'ATENCIÓN: otra ubicación');
  const media = await step('Subir foto a la biblioteca de medios', async () => (await client.uploadMedia(new Blob([photoBytes], { type: 'image/jpeg' }), `verificacion-${Date.now()}.jpg`, vars.GHL_MEDIA_FOLDER_ID || undefined)).url);
  await step('Crear nota en el contacto', async () => {
    await client.addNote(contact, `Prueba de verificación del Sistema de Fotos.\nFoto: ${media ?? '(no se pudo subir)'}`);
  });
  await step('Poner etiqueta', async () => {
    await client.addTags(contact, ['fotos-vehiculo']);
  });

  let fieldIds = {};
  try {
    fieldIds = vars.GHL_PHOTO_FIELD_IDS ? JSON.parse(vars.GHL_PHOTO_FIELD_IDS) : {};
  } catch {
    console.log('✗ GHL_PHOTO_FIELD_IDS no es un JSON válido (ej.: {"frente":"abc123"})');
    failures += 1;
  }
  if (fieldIds.frente) await step('Adjuntar foto al campo de archivo "frente"', async () => void (await client.uploadCustomFile(contact, fieldIds.frente, new Blob([photoBytes], { type: 'image/jpeg' }), 'verificacion.jpg')));

  await step('Borrar el contacto de prueba', async () => void (await client.deleteContact(contact)));
}

console.log(failures ? `\n${failures} paso(s) fallaron: corrige y vuelve a ejecutar.` : '\nTodo funciona: la conexión con BritoCRM está lista.');
// No se usa process.exit(): en Windows cerrar a la fuerza con conexiones abiertas imprime un error de Node.
process.exitCode = failures ? 1 : 0;
