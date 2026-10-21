import { drawScaled } from './image.js';

const ANALYSIS_SIDE = 512;
const GRID = 8; // la foto se divide en GRID x GRID bloques
const EDGE_TILE_SHARE = 0.25; // fracción de bloques con más bordes que se usa para medir el desenfoque

// Mide nitidez y exposición de una imagen. Devuelve:
//  - edgeRatio: energía del Laplaciano / energía del gradiente en los bloques con más bordes.
//    Un borde enfocado es abrupto (segunda derivada alta respecto a la primera); uno desenfocado se
//    ensancha y el cociente cae. Al ser un cociente no depende del contraste ni de cuánta textura tenga
//    la escena (un garaje lleno de líneas engaña a la varianza del Laplaciano, pero no a este cociente).
//  - sharpness: varianza del Laplaciano del bloque más nítido (percentil 90). Se conserva como segundo filtro.
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

  const tiles = GRID * GRID;
  const lapSum = new Float64Array(tiles);
  const lapSq = new Float64Array(tiles);
  const gradSq = new Float64Array(tiles);
  const count = new Float64Array(tiles);
  for (let y = 1; y < h - 1; y++) {
    const ty = Math.min(GRID - 1, Math.floor((y * GRID) / h));
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx = (gray[i + 1] - gray[i - 1]) / 2;
      const gy = (gray[i + w] - gray[i - w]) / 2;
      const lap = 4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - w] - gray[i + w];
      const t = ty * GRID + Math.min(GRID - 1, Math.floor((x * GRID) / w));
      lapSum[t] += lap;
      lapSq[t] += lap * lap;
      gradSq[t] += gx * gx + gy * gy;
      count[t]++;
    }
  }

  const variances = [];
  const edgeTiles = [];
  for (let t = 0; t < tiles; t++) {
    if (!count[t]) continue;
    const mean = lapSum[t] / count[t];
    variances.push(lapSq[t] / count[t] - mean * mean);
    edgeTiles.push({ grad: gradSq[t], ratio: lapSq[t] / (gradSq[t] + 1e-6) });
  }
  variances.sort((a, b) => a - b);
  edgeTiles.sort((a, b) => b.grad - a.grad);
  const strongest = edgeTiles
    .slice(0, Math.max(1, Math.ceil(edgeTiles.length * EDGE_TILE_SHARE)))
    .map((tile) => tile.ratio)
    .sort((a, b) => a - b);

  return {
    edgeRatio: strongest[Math.floor(strongest.length / 2)] ?? 0,
    sharpness: variances[Math.floor(variances.length * 0.9)] ?? 0,
    mean: sum / gray.length,
    darkFraction: dark / gray.length,
    brightFraction: bright / gray.length,
  };
}
