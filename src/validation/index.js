import { detectVehicle } from './vehicle.js';
import { evaluateVehicleBox } from './rules.js';

// Qué tipo de vista exige cada paso. VIN y odómetro se validarán con OCR (aún pendiente).
const VIEW_BY_STEP = {
  frente: 'face',
  trasera: 'face',
  'lateral-izquierdo': 'side',
  'lateral-derecho': 'side',
};

// Resultado: { status: 'ok' | 'fail' | 'unverified', reason?: claveI18n }
//  - ok:         pasó todas las reglas
//  - fail:       hay un problema que el usuario debe corregir repitiendo la foto
//  - unverified: no se pudo validar (sin modelo, sin red o paso sin validador todavía); no bloquea
export async function validatePhoto(stepId, blob) {
  const view = VIEW_BY_STEP[stepId];
  if (!view) return { status: 'unverified' };

  try {
    const { box, width, height } = await detectVehicle(blob);
    const reason = evaluateVehicleBox(view, box, width, height);
    return reason ? { status: 'fail', reason } : { status: 'ok' };
  } catch (error) {
    console.warn('No se pudo validar la foto automáticamente', error);
    return { status: 'unverified', reason: 'validate.engineError' };
  }
}
