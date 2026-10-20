import { drawScaled } from './image.js';

const ANALYSIS_SIDE = 512;
const GRID = 8; // la foto se divide en GRID x GRID bloques para medir la nitidez

// Mide nitidez y exposición de una imagen. Devuelve:
//  - sharpness: varianza del Laplaciano del bloque más nítido (percentil 90 entre bloques).
//    Se usa el percentil y no el promedio para que un vehículo enfocado sobre un fondo liso
//    (cielo, pared) no parezca borroso, mientras que una foto movida es baja en todos sus bloques.
//  - mean: luminosidad media (0-255)
//  - darkFraction / brightFraction: proporción de píxeles casi negros / casi blancos
export function measureQuality(bitmap) {
  const canvas = drawScaled(bitmap, ANALYSIS_SIDE);
  const { width: w, height: h } = canvas;
  const { data } = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h);

  const gray = new Float32Array(w * h);
  let sum = 0;
  let dark = 0;
  let bright = 0;
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const g = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    gray[p] = g;
    sum += g;
    if (g < 25) dark++;
    else if (g > 240) bright++;
  }

  const tileSum = new Float64Array(GRID * GRID);
  const tileSq = new Float64Array(GRID * GRID);
  const tileN = new Float64Array(GRID * GRID);
  for (let y = 1; y < h - 1; y++) {
    const ty = Math.min(GRID - 1, Math.floor((y * GRID) / h));
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const lap = 4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - w] - gray[i + w];
      const t = ty * GRID + Math.min(GRID - 1, Math.floor((x * GRID) / w));
      tileSum[t] += lap;
      tileSq[t] += lap * lap;
      tileN[t]++;
    }
  }
  const variances = [];
  for (let t = 0; t < GRID * GRID; t++) {
    if (!tileN[t]) continue;
    const mean = tileSum[t] / tileN[t];
    variances.push(tileSq[t] / tileN[t] - mean * mean);
  }
  variances.sort((a, b) => a - b);

  return {
    sharpness: variances[Math.floor(variances.length * 0.9)] ?? 0,
    mean: sum / gray.length,
    darkFraction: dark / gray.length,
    brightFraction: bright / gray.length,
  };
}
