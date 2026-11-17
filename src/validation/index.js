import { decodeImage } from './image.js';
import { measureQuality } from './quality.js';
import { detectVehicle } from './vehicle.js';
import { evaluateQuality, evaluateResolution, evaluateVehicleBox } from './rules.js';

// Qué tipo de vista exige cada paso de vehículo exterior.
const VIEW_BY_STEP = {
  frente: 'face',
  trasera: 'face',
  'lateral-izquierdo': 'side',
  'lateral-derecho': 'side',
};

// Valida una foto en este orden (de lo más barato a lo más pesado):
//   1. resolución mínima  2. nitidez y exposición  3. contenido (solo el vehículo exterior; el VIN y el odómetro no se leen)
//
// Resultado: { status, reason?, value?, color?, metrics? }  (color: Lab de la carrocería, en fotos exteriores)
//  - ok:         pasó todas las pruebas
//  - fail:       hay un problema que el usuario debe corregir repitiendo la foto
//  - unverified: no se pudo comprobar del todo (p. ej. fallo del motor); no bloquea
//  - metrics:    medidas de nitidez y exposición, para el modo de diagnóstico (?debug=1)
export async function validatePhoto(stepId, blob) {
  let bitmap;
  try {
    bitmap = await decodeImage(blob);
  } catch (error) {
    console.warn('No se pudo leer la imagen', error);
    return { status: 'unverified', reason: 'validate.engineError' };
  }

  let metrics;
  const result = (verdict) => ({ ...verdict, metrics: metrics && { ...metrics, width: bitmap.width, height: bitmap.height } });
  const fail = (reason) => result({ status: 'fail', reason });

  try {
    const lowResolution = evaluateResolution(bitmap.width, bitmap.height);
    if (lowResolution) return fail(lowResolution);

    metrics = measureQuality(bitmap);
    const quality = evaluateQuality(metrics, VIEW_BY_STEP[stepId] ? 'exterior' : 'close');
    if (quality) return fail(quality);

    if (VIEW_BY_STEP[stepId]) {
      const { box, color, width, height } = await detectVehicle(bitmap, VIEW_BY_STEP[stepId]);
      const reason = evaluateVehicleBox(VIEW_BY_STEP[stepId], box, width, height);
      // `color` se devuelve para que el wizard compruebe que todas las fotos exteriores son del mismo vehículo.
      return reason ? fail(reason) : result({ status: 'ok', color });
    }

    // VIN y odómetro: ya no se leen con OCR (en las pruebas fallaba con fotos nítidas y frustraba a la persona). Basta con
    // que la foto pase la resolución, la nitidez y la exposición de arriba; quien emite la póliza revisa el número a simple vista.
    if (stepId === 'vin' || stepId === 'odometro') return result({ status: 'ok' });

    return result({ status: 'unverified' });
  } catch (error) {
    console.warn('No se pudo validar la foto automáticamente', error);
    return result({ status: 'unverified', reason: 'validate.engineError' });
  } finally {
    bitmap.close?.();
  }
}
