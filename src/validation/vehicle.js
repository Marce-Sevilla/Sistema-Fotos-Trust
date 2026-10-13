// Detección de vehículos con TensorFlow.js + COCO-SSD, cargados bajo demanda para no
// penalizar la carga inicial de la página.
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

async function toCanvas(blob) {
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return canvas;
}

// Devuelve { box, width, height } con el vehículo más grande detectado (box = null si no hay ninguno).
export async function detectVehicle(blob) {
  const [model, canvas] = await Promise.all([loadVehicleModel(), toCanvas(blob)]);
  const predictions = await model.detect(canvas, 10, MIN_SCORE);
  const vehicles = predictions.filter((p) => VEHICLE_CLASSES.has(p.class));
  vehicles.sort((a, b) => b.bbox[2] * b.bbox[3] - a.bbox[2] * a.bbox[3]);
  const best = vehicles[0];
  return {
    width: canvas.width,
    height: canvas.height,
    box: best ? { x: best.bbox[0], y: best.bbox[1], width: best.bbox[2], height: best.bbox[3], score: best.score } : null,
  };
}
