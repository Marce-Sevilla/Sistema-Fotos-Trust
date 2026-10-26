// Detección de vehículos con TensorFlow.js + COCO-SSD, cargados bajo demanda para no
// penalizar la carga inicial de la página.
import { drawScaled } from './image.js';
import { bodyRegion, medianLab } from './color.js';

const VEHICLE_CLASSES = new Set(['car', 'truck', 'bus']);
const MIN_SCORE = 0.4;
const MAX_SIDE = 640; // se analiza una versión reducida de la foto: es más rápido y basta para detectar

let modelPromise = null;

export function loadVehicleModel() {
  modelPromise ??= (async () => {
    const [tf, cocoSsd] = await Promise.all([import('@tensorflow/tfjs'), import('@tensorflow-models/coco-ssd')]);
    await tf.ready();
    return cocoSsd.load({ base: 'lite_mobilenet_v2' });
  })().catch((error) => {
    modelPromise = null; // permite reintentar si falló la red
    throw error;
  });
  return modelPromise;
}

// Devuelve { box, color, width, height } con el vehículo más grande detectado (box = null si no hay ninguno).
// `color` es el color Lab de la carrocería (para comprobar que todas las fotos son del mismo vehículo);
// `view` ('side' | 'face') decide qué zona del vehículo se muestrea.
export async function detectVehicle(bitmap, view = 'face') {
  const canvas = drawScaled(bitmap, MAX_SIDE);
  const model = await loadVehicleModel();
  const predictions = await model.detect(canvas, 10, MIN_SCORE);
  const vehicles = predictions.filter((p) => VEHICLE_CLASSES.has(p.class));
  vehicles.sort((a, b) => b.bbox[2] * b.bbox[3] - a.bbox[2] * a.bbox[3]);
  const best = vehicles[0];
  const box = best ? { x: best.bbox[0], y: best.bbox[1], width: best.bbox[2], height: best.bbox[3], score: best.score } : null;
  return { width: canvas.width, height: canvas.height, box, color: box ? sampleBodyColor(canvas, view, box) : null };
}

function sampleBodyColor(canvas, view, box) {
  const region = bodyRegion(view, box);
  // Se recorta a los límites de la imagen por si el recuadro se sale un poco.
  const clamped = {
    x0: Math.max(0, region.x0),
    y0: Math.max(0, region.y0),
    x1: Math.min(canvas.width, region.x1),
    y1: Math.min(canvas.height, region.y1),
  };
  const { data } = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height);
  return medianLab(data, canvas.width, clamped);
}
