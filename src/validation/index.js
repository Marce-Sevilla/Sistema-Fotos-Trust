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

const fail = (reason) => ({ status: 'fail', reason });

// Valida una foto en este orden (de lo más barato a lo más pesado):
//   1. resolución mínima  2. nitidez y exposición  3. contenido (vehículo, VIN u odómetro)
//
// Resultado: { status, reason?, params?, value? }
//  - ok:         pasó todas las pruebas (`value` trae el VIN o kilometraje leído, si aplica)
//  - fail:       hay un problema que el usuario debe corregir repitiendo la foto
//  - unverified: no se pudo comprobar del todo (fallo del motor o lectura dudosa); no bloquea
export async function validatePhoto(stepId, blob) {
  let bitmap;
  try {
    bitmap = await decodeImage(blob);
  } catch (error) {
    console.warn('No se pudo leer la imagen', error);
    return { status: 'unverified', reason: 'validate.engineError' };
  }

  try {
    const lowResolution = evaluateResolution(bitmap.width, bitmap.height);
    if (lowResolution) return fail(lowResolution);

    const quality = evaluateQuality(measureQuality(bitmap), VIEW_BY_STEP[stepId] ? 'exterior' : 'close');
    if (quality) return fail(quality);

    if (VIEW_BY_STEP[stepId]) {
      const { box, width, height } = await detectVehicle(bitmap);
      const reason = evaluateVehicleBox(VIEW_BY_STEP[stepId], box, width, height);
      return reason ? fail(reason) : { status: 'ok' };
    }

    if (stepId === 'vin') {
      const found = await readVin(bitmap);
      if (!found) return fail('validate.noVin');
      // Sin dígito verificador válido es probable que el OCR haya errado un carácter: se avisa pero no se bloquea.
      return found.checksumOk
        ? { status: 'ok', reason: 'validate.vinRead', params: { value: found.vin }, value: found.vin }
        : { status: 'unverified', reason: 'validate.vinCheck', params: { value: found.vin }, value: found.vin };
    }

    if (stepId === 'odometro') {
      const found = await readOdometer(bitmap);
      if (!found) return fail('validate.noOdometer');
      return { status: 'ok', reason: 'validate.odometerRead', params: { value: found.reading }, value: found.reading };
    }

    return { status: 'unverified' };
  } catch (error) {
    console.warn('No se pudo validar la foto automáticamente', error);
    return { status: 'unverified', reason: 'validate.engineError' };
  } finally {
    bitmap.close?.();
  }
}
