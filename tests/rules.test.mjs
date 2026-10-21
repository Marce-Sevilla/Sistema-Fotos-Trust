import assert from 'node:assert/strict';
import { evaluateVehicleBox } from '../src/validation/rules.js';

const W = 640;
const H = 480;
const box = (x, y, w, h) => ({ x, y, width: w, height: h });

const cases = [
  ['sin vehÃ­culo', 'side', null, 'validate.noVehicle'],
  ['lateral correcto (ratio 3.3)', 'side', box(60, 160, 520, 160), null],
  ['lateral pero se ve de frente (ratio 1.3)', 'side', box(160, 100, 320, 250), 'validate.wrongAngleSide'],
  ['lateral en diagonal (ratio 1.8)', 'side', box(80, 120, 480, 267), 'validate.wrongAngleSide'],
  ['frente correcto (ratio 1.3)', 'face', box(150, 100, 340, 260), null],
  ['frente pero se ve de lado (ratio 3.3)', 'face', box(60, 160, 520, 160), 'validate.wrongAngleFace'],
  ['vehÃ­culo cortado por la izquierda', 'side', box(0, 160, 520, 160), 'validate.cutOff'],
  ['vehÃ­culo muy lejos', 'side', box(250, 200, 120, 40), 'validate.tooFar'],
  ['frente descentrado a la derecha', 'face', box(360, 100, 262, 200), 'validate.offCenter'],
];

for (const [name, view, b, expected] of cases) {
  assert.equal(evaluateVehicleBox(view, b, W, H), expected, name);
  console.log('ok  -', name);
}


// ---- Nitidez y exposición ----
import { evaluateQuality, evaluateResolution } from '../src/validation/rules.js';

const q = (over = {}) => ({ edgeRatio: 6, sharpness: 3000, mean: 110, darkFraction: 0.05, brightFraction: 0.02, ...over });
const check = (name, actual, expected) => {
  assert.equal(actual, expected, name);
  console.log('ok  -', name);
};

check('foto nítida y bien expuesta', evaluateQuality(q()), null);
check('desenfoque medido por bordes (aunque la escena tenga textura)', evaluateQuality(q({ edgeRatio: 1.54, sharpness: 500 })), 'validate.blurry');
check('desenfoque fuerte', evaluateQuality(q({ edgeRatio: 0.4, sharpness: 30 })), 'validate.blurry');
check('muy oscura', evaluateQuality(q({ mean: 30 })), 'validate.tooDark');
check('muy oscura por proporción de negros', evaluateQuality(q({ darkFraction: 0.6 })), 'validate.tooDark');
check('sobreexpuesta', evaluateQuality(q({ mean: 230, brightFraction: 0.5 })), 'validate.tooBright');
check('tablero oscuro es válido de cerca', evaluateQuality(q({ mean: 25, darkFraction: 0.8 }), 'close'), null);
check('lente tapada se rechaza incluso de cerca', evaluateQuality(q({ mean: 3, darkFraction: 0.99 }), 'close'), 'validate.tooDark');
check('resolución suficiente (1920x1080)', evaluateResolution(1920, 1080), null);
check('resolución suficiente en vertical (1080x1920)', evaluateResolution(1080, 1920), null);
check('resolución baja', evaluateResolution(640, 480), 'validate.lowResolution');
