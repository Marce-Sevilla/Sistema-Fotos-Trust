// Reglas de posición del vehículo (funciones puras, sin modelo ni DOM).
// `box` es el recuadro del vehículo detectado: { x, y, width, height } en píxeles de la imagen.

export const LIMITS = {
  edgeMargin: 0.015, // el vehículo no debe tocar el borde de la foto (se vería cortado)
  minWidth: 0.4, // ancho mínimo del vehículo respecto al ancho de la foto
  sideMinRatio: 2.2, // de lado un vehículo es mucho más ancho que alto (sedán ~3.1, SUV ~2.7; en diagonal ronda 2.0)
  faceMaxRatio: 1.65, // de frente o de atrás es casi cuadrado (un sedán ronda 1.3)
  centerRange: [0.3, 0.7], // el centro del vehículo debe quedar en el tercio central
};

// ---- Resolución, nitidez y exposición ----------------------------------------------
// Calibrados con fotos reales y versiones degradadas a propósito: las fotos nítidas dan 800-19000
// de nitidez y las muy desenfocadas menos de 60.
export const QUALITY_LIMITS = {
  minLongSide: 1280, // px; una foto 720p (1280x720) es el mínimo aceptable
  minShortSide: 720,
  // Cociente de bordes (ver quality.js): fotos nítidas 3-11, desenfoque leve 1-2.5, fuerte < 1.
  // Es el criterio principal: no depende de cuánta textura tenga la escena. Se ajusta con `?debug=1`.
  minEdgeRatio: 2.5,
  minSharpness: 120, // varianza del Laplaciano (percentil 90 de los bloques); segundo filtro
  maxMean: 215, // luminosidad media máxima (0-255)
  maxBrightFraction: 0.35, // proporción máxima de píxeles quemados (casi blancos)
  // Un tablero o un VIN en sombra son oscuros por naturaleza, así que las fotos de cerca
  // toleran mucha más oscuridad y es el OCR quien decide si se puede leer.
  dark: {
    exterior: { minMean: 50, maxDarkFraction: 0.45 },
    close: { minMean: 8, maxDarkFraction: 0.985 }, // solo descarta fotos casi negras (lente tapada)
  },
};

export function evaluateResolution(width, height) {
  const { minLongSide, minShortSide } = QUALITY_LIMITS;
  return Math.max(width, height) < minLongSide || Math.min(width, height) < minShortSide ? 'validate.lowResolution' : null;
}

// metrics: resultado de measureQuality(). kind: 'exterior' (foto del vehículo) | 'close' (VIN u odómetro).
// Devuelve la clave de i18n del problema, o null si está bien.
export function evaluateQuality({ edgeRatio, sharpness, mean, darkFraction, brightFraction }, kind = 'exterior') {
  const { minEdgeRatio, minSharpness, maxMean, maxBrightFraction, dark } = QUALITY_LIMITS;
  const { minMean, maxDarkFraction } = dark[kind];
  if (mean < minMean || darkFraction > maxDarkFraction) return 'validate.tooDark';
  if (mean > maxMean || brightFraction > maxBrightFraction) return 'validate.tooBright';
  if (edgeRatio < minEdgeRatio || sharpness < minSharpness) return 'validate.blurry';
  return null;
}

// vista: 'face' (frente o trasera) | 'side' (lateral). Devuelve la clave de i18n del problema, o null si es válida.
export function evaluateVehicleBox(view, box, imageWidth, imageHeight) {
  if (!box) return 'validate.noVehicle';

  const { edgeMargin, minWidth, sideMinRatio, faceMaxRatio, centerRange } = LIMITS;
  const touchesEdge =
    box.x < imageWidth * edgeMargin ||
    box.y < imageHeight * edgeMargin ||
    box.x + box.width > imageWidth * (1 - edgeMargin) ||
    box.y + box.height > imageHeight * (1 - edgeMargin);
  // Con el vehículo cortado la proporción no es confiable, así que se avisa primero.
  if (touchesEdge) return 'validate.cutOff';

  if (box.width / imageWidth < minWidth) return 'validate.tooFar';

  const ratio = box.width / box.height;
  if (view === 'side' && ratio < sideMinRatio) return 'validate.wrongAngleSide';
  if (view === 'face' && ratio > faceMaxRatio) return 'validate.wrongAngleFace';

  const centerX = (box.x + box.width / 2) / imageWidth;
  if (centerX < centerRange[0] || centerX > centerRange[1]) return 'validate.offCenter';

  return null;
}
