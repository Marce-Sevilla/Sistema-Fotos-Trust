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

