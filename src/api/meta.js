// Los datos de apoyo del envío (tipo de vehículo, ubicación del VIN, estado de cada foto, lecturas del OCR)
// viajan en la dirección de /api/finish, codificados en base64url, y no dentro del cuerpo multipart: así el
// servidor puede reenviar las fotos al CRM sin abrir el cuerpo (ver worker/api.js).
export const MAX_META_LENGTH = 4096;

export function encodeMeta(meta) {
  const bytes = new TextEncoder().encode(JSON.stringify(meta));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

// Devuelve el objeto, o null si no es válido.
export function decodeMeta(text) {
  if (typeof text !== 'string' || !text || text.length > MAX_META_LENGTH) return null;
  try {
    const base64 = text.replaceAll('-', '+').replaceAll('_', '/');
    const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
    const data = JSON.parse(new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0))));
    return data && typeof data === 'object' ? data : null;
  } catch {
    return null;
  }
}
