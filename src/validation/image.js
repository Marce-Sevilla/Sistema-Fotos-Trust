// Utilidades de imagen compartidas por los validadores.

export function decodeImage(blob) {
  return createImageBitmap(blob);
}

// Copia la imagen a un canvas reducido (lado mayor <= maxSide). Analizar una versión pequeña es
// mucho más rápido y además hace que las métricas no dependan de la resolución de cada teléfono.
export function drawScaled(bitmap, maxSide) {
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d', { willReadFrequently: true }).drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas;
}
