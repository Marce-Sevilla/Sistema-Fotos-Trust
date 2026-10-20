// Lectura de texto (VIN y odómetro) con Tesseract.js, cargado bajo demanda: el motor y el
// idioma se descargan solo cuando se acerca el paso del VIN.
import { drawScaled } from './image.js';
import { extractOdometer, extractVin } from './ocr-rules.js';

const VIN_CHARS = 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789'; // sin I, O ni Q: no existen en un VIN
// Odómetro: sin restringir el alfabeto, para que Tesseract dé una confianza fiable (ver ocr-rules.js).
const ALL_CHARS = '';

let tesseractPromise = null;
let workerPromise = null;

function loadTesseract() {
  tesseractPromise ??= import('tesseract.js');
  return tesseractPromise;
}

export function loadOcr() {
  workerPromise ??= loadTesseract()
    .then(({ createWorker }) => createWorker('eng'))
    .catch((error) => {
      workerPromise = null; // permite reintentar si falló la red
      throw error;
    });
  return workerPromise;
}

// Escala de grises con el contraste estirado: ayuda a leer números sobre fondos oscuros o con poca luz.
function prepare(bitmap, side) {
  const canvas = drawScaled(bitmap, side);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { data } = image;
  const histogram = new Uint32Array(256);
  for (let i = 0; i < data.length; i += 4) {
    const g = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    data[i] = g;
    histogram[g]++;
  }
  const total = data.length / 4;
  let acc = 0;
  let lo = 0;
  let hi = 255;
  for (let v = 0; v < 256; v++) {
    acc += histogram[v];
    if (acc >= total * 0.02) {
      lo = v;
      break;
    }
  }
  acc = 0;
  for (let v = 255; v >= 0; v--) {
    acc += histogram[v];
    if (acc >= total * 0.02) {
      hi = v;
      break;
    }
  }
  const range = Math.max(1, hi - lo);
  for (let i = 0; i < data.length; i += 4) {
    const g = Math.max(0, Math.min(255, ((data[i] - lo) * 255) / range));
    data[i] = data[i + 1] = data[i + 2] = g;
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

// Devuelve las líneas leídas con la confianza de cada palabra: [{ words: [{ text, confidence }] }].
async function recognize(canvas, whitelist, pageSegMode) {
  const [worker, { PSM }] = await Promise.all([loadOcr(), loadTesseract()]);
  await worker.setParameters({ tessedit_char_whitelist: whitelist, tessedit_pageseg_mode: PSM[pageSegMode] });
  const { data } = await worker.recognize(canvas, {}, { text: true, blocks: true });
  return (data.blocks ?? [])
    .flatMap((block) => block.paragraphs.flatMap((paragraph) => paragraph.lines))
    .map((line) => ({ words: line.words.map((word) => ({ text: word.text, confidence: word.confidence })) }));
}

// Tesseract lee mejor los caracteres de tamaño moderado (~30-40 px de alto): si la foto está muy de cerca
// los caracteres salen enormes y falla. Por eso se prueba a más de una escala, y se corta al primer acierto.
// Devuelve { vin, checksumOk } o null si no se encontró un VIN. Prefiere una lectura con dígito
// verificador válido; si ninguna lo tiene, devuelve la primera lectura dudosa.
const VIN_ATTEMPTS = [
  { side: 1280, chars: ALL_CHARS },
  { side: 800, chars: ALL_CHARS },
  { side: 1280, chars: VIN_CHARS },
];

export async function readVin(bitmap) {
  let best = null;
  for (const { side, chars } of VIN_ATTEMPTS) {
    const found = extractVin(await recognize(prepare(bitmap, side), chars, 'SPARSE_TEXT'));
    if (found?.checksumOk) return found;
    best ??= found;
  }
  return best;
}

// Devuelve { reading } o null si no se encontró un kilometraje.
export async function readOdometer(bitmap) {
  for (const side of [1280, 800]) {
    const found = extractOdometer(await recognize(prepare(bitmap, side), ALL_CHARS, 'SPARSE_TEXT'));
    if (found) return found;
  }
  return null;
}
