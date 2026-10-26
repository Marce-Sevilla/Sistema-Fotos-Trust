// Verifica la conexión REAL con BritoCRM (GoHighLevel) antes de publicar.
//
//   1. Crea el archivo .dev.vars (no se sube a git) con:   GHL_TOKEN=...   GHL_LOCATION_ID=...
//   2. npm run check:ghl            (o: node scripts/check-ghl.mjs ruta/a/una-foto.jpg)
//
// Crea un contacto de prueba, sube una foto, y borra el contacto.
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
// El ID del campo «Fotos» vive en wrangler.jsonc (no es secreto); .dev.vars puede sobrescribirlo.
if (!vars.GHL_PHOTOS_FIELD_ID && existsSync('wrangler.jsonc')) {
  vars.GHL_PHOTOS_FIELD_ID = readFileSync('wrangler.jsonc', 'utf8').match(/"GHL_PHOTOS_FIELD_ID"\s*:\s*"([^"]+)"/)?.[1];
}
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
  const fieldId = vars.GHL_PHOTOS_FIELD_ID;
  let links = [];
  if (!fieldId) {
    failures += 1;
    console.log('✗ Falta GHL_PHOTOS_FIELD_ID (el ID del campo «Fotos»; vive en wrangler.jsonc).');
  } else {
    // El CRM reemplaza los archivos del campo en cada subida, así que las 6 fotos van juntas en una sola llamada.
    const six = Array.from({ length: 6 }, (_, i) => ({ blob: new Blob([photoBytes], { type: 'image/jpeg' }), name: `verificacion-${i + 1}.jpg` }));
    links = (await step('Subir 6 fotos al campo «Fotos» (una sola llamada)', async () => {
      const uploaded = await client.uploadContactFiles(contact, fieldId, six);
      if (uploaded.length !== 6) throw new Error(`el CRM confirmó ${uploaded.length} archivos y se esperaban 6`);
      return `${uploaded.length} archivos`;
    })) ? ['ok'] : [];
    await step('Comprobar en la ficha del contacto que el campo tiene las 6 fotos', async () => {
      const files = Object.values((await client.getContact(contact)).customFields?.find((entry) => entry.id === fieldId)?.value ?? {});
      if (files.length !== 6) throw new Error(`el campo tiene ${files.length} archivos y se esperaban 6`);
      return `${files.length} archivos`;
    });
  }
  await step('Borrar el contacto de prueba', async () => void (await client.deleteContact(contact)));
}

console.log(failures ? `\n${failures} paso(s) fallaron: corrige y vuelve a ejecutar.` : '\nTodo funciona: la conexión con BritoCRM está lista.');
// No se usa process.exit(): en Windows cerrar a la fuerza con conexiones abiertas imprime un error de Node.
process.exitCode = failures ? 1 : 0;
