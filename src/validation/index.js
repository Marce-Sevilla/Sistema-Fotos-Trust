import { decodeImage } from './image.js';
import { measureQuality } from './quality.js';
import { detectVehicle } from './vehicle.js';
import { readOdometer, readVin } from './ocr.js';
import { evaluateQuality, evaluateResolution, evaluateVehicleBox } from './rules.js';

// Qué tipo de vista exige cada paso de vehículo exterior.
const VIEW_BY_STEP = {
  frente: 'face',
  trasera: 'face',
  'lateral-izquierdo': 'side',
  'lateral-derecho': 'side',
};

// Valida una foto en este orden (de lo más barato a lo más pesado):
//   1. resolución mínima  2. nitidez y exposición  3. contenido (vehículo, VIN u odómetro)
//
// Resultado: { status, reason?, value?, metrics? }
//  - ok:         pasó todas las pruebas (`value` trae el VIN o kilometraje leído, solo como dato de apoyo)
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
      const { box, width, height } = await detectVehicle(bitmap);
      const reason = evaluateVehicleBox(VIEW_BY_STEP[stepId], box, width, height);
      return reason ? fail(reason) : result({ status: 'ok' });
    }

    if (stepId === 'vin') {
      const found = await readVin(bitmap);
      if (!found) return fail('validate.noVin');
      // La foto es válida porque el número se pudo leer. El texto leído (y si su dígito verificador cuadra)
      // queda solo como dato de apoyo: no se muestra ni se le pide a la persona.
      return result({ status: 'ok', value: found.vin, checksumOk: found.checksumOk });
    }

    if (stepId === 'odometro') {
      const found = await readOdometer(bitmap);
      if (!found) return fail('validate.noOdometer');
      return result({ status: 'ok', value: found.reading });
    }

    return result({ status: 'unverified' });
  } catch (error) {
    console.warn('No se pudo validar la foto automáticamente', error);
    return result({ status: 'unverified', reason: 'validate.engineError' });
  } finally {
    bitmap.close?.();
  }
}
