// Cliente mínimo de la API v2 de GoHighLevel (BritoCRM es su versión white label).
// Recibe `fetchImpl` para poder probarlo con un CRM simulado, sin red ni token.

export class GhlError extends Error {
  constructor(step, status, detail) {
    super(`GHL ${step} falló (${status})`);
    this.step = step; // qué paso falló: 'upsertContact', 'uploadMedia', 'addNote'...
    this.status = status;
    this.detail = detail;
  }
}

// GHL espera teléfonos en formato internacional (E.164). Sin código de país se asume EE. UU. (Florida).
export function normalizePhone(raw) {
  const text = String(raw ?? '').trim();
  const digits = text.replace(/\D/g, '');
  if (!digits) return '';
  if (text.startsWith('+')) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return `+${digits}`;
}

export function splitName(fullName) {
  const parts = String(fullName ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { firstName: parts[0] ?? '', lastName: '' };
  // Con 3 o más palabras, la primera es el nombre y el resto el apellido ("Juan Carlos Pérez" -> "Juan" / "Carlos Pérez").
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

const RETRY_STATUS = new Set([429, 500, 502, 503, 504]);
const RETRY_DELAYS_MS = [400, 1200];

export function createGhlClient({
  token,
  locationId,
  fetchImpl = fetch,
  baseUrl = 'https://services.leadconnectorhq.com',
  version = '2021-07-28',
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) {
  async function request(step, path, { method = 'GET', json, form, query } = {}) {
    const url = new URL(baseUrl + path);
    for (const [key, value] of Object.entries(query ?? {})) url.searchParams.set(key, value);
    const headers = { Authorization: `Bearer ${token}`, Version: version, Accept: 'application/json' };
    let body;
    if (json !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(json);
    } else if (form) {
      body = form; // el Content-Type multipart (con su boundary) lo pone fetch
    }

    let response;
    for (let attempt = 0; ; attempt++) {
      try {
        response = await fetchImpl(url, { method, headers, body });
      } catch (error) {
        if (attempt >= RETRY_DELAYS_MS.length) throw new GhlError(step, 0, String(error?.message ?? error));
        await sleep(RETRY_DELAYS_MS[attempt]);
        continue;
      }
      if (RETRY_STATUS.has(response.status) && attempt < RETRY_DELAYS_MS.length) {
        await sleep(RETRY_DELAYS_MS[attempt]);
        continue;
      }
      break;
    }

    const text = await response.text();
    if (!response.ok) throw new GhlError(step, response.status, text.slice(0, 300));
    try {
      return text ? JSON.parse(text) : {};
    } catch {
      return {};
    }
  }

  return {
    // Devuelve el contacto, o lanza GhlError (404 si no existe en esta ubicación).
    async getContact(contactId) {
      const data = await request('getContact', `/contacts/${encodeURIComponent(contactId)}`);
      return data.contact ?? data;
    },

    // Crea el contacto o actualiza el existente (según correo/teléfono). No se envían `tags` aquí:
    // en el upsert reemplazarían todas las etiquetas que el contacto ya tenga.
    async upsertContact({ firstName, lastName, email, phone, source }) {
      const data = await request('upsertContact', '/contacts/upsert', {
        method: 'POST',
        json: { locationId, firstName, lastName, email, ...(phone ? { phone } : {}), source },
      });
      return { id: data.contact?.id, isNew: Boolean(data.new) };
    },

    // Adjunta archivos a un campo personalizado de tipo archivo del contacto (queda en su ficha).
    // IMPORTANTE: cada llamada REEMPLAZA los archivos que el campo tuviera, no los suma. Por eso todos los
    // archivos deben ir juntos en una sola llamada. Devuelve [{ name, url }] con lo que quedó en el campo.
    async uploadContactFiles(contactId, fieldId, files) {
      const form = new FormData();
      for (const { blob, name } of files) form.append(`${fieldId}_${crypto.randomUUID()}`, blob, name);
      const data = await request('uploadFiles', '/forms/upload-custom-files', { method: 'POST', form, query: { contactId, locationId } });
      const field = (data.contact?.customFields ?? []).find((entry) => entry.id === fieldId);
      return Object.values(field?.value ?? {}).map((file) => ({ name: file.meta?.originalname, url: file.url }));
    },

    async addNote(contactId, body) {
      await request('addNote', `/contacts/${encodeURIComponent(contactId)}/notes`, { method: 'POST', json: { body } });
    },

    // Solo lo usa scripts/check-ghl.mjs para limpiar el contacto de prueba.
    async deleteContact(contactId) {
      await request('deleteContact', `/contacts/${encodeURIComponent(contactId)}`, { method: 'DELETE' });
    },

    async addTags(contactId, tags) {
      await request('addTags', `/contacts/${encodeURIComponent(contactId)}/tags`, { method: 'POST', json: { tags } });
    },
  };
}
