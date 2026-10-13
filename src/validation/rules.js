// Reglas de posición del vehículo (funciones puras, sin modelo ni DOM).
// `box` es el recuadro del vehículo detectado: { x, y, width, height } en píxeles de la imagen.

export const LIMITS = {
  edgeMargin: 0.015, // el vehículo no debe tocar el borde de la foto (se vería cortado)
  minWidth: 0.4, // ancho mínimo del vehículo respecto al ancho de la foto
  sideMinRatio: 2.2, // de lado un vehículo es mucho más ancho que alto (sedán ~3.1, SUV ~2.7; en diagonal ronda 2.0)
  faceMaxRatio: 1.65, // de frente o de atrás es casi cuadrado (un sedán ronda 1.3)
  centerRange: [0.3, 0.7], // el centro del vehículo debe quedar en el tercio central
};

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
