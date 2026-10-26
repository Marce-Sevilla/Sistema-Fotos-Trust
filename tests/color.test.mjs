import assert from 'node:assert/strict';
import { bodyRegion, colorName, medianLab, rgbToLab, sameVehicleColor } from '../src/validation/color.js';

const check = (name, actual, expected) => {
  assert.equal(actual, expected, name);
  console.log('ok  -', name);
};
const lab = (L, a, b) => ({ L, a, b });

// ---- Conversión de color ----
check('blanco puro es L=100', Math.round(rgbToLab(255, 255, 255).L), 100);
check('negro puro es L=0', Math.round(rgbToLab(0, 0, 0).L), 0);
check('rojo puro tiene a muy positivo', rgbToLab(255, 0, 0).a > 70, true);
check('azul puro tiene b muy negativo', rgbToLab(0, 0, 255).b < -90, true);

// ---- Color mediano: lo que ocupa poco espacio (faros, rejilla) no cambia el resultado ----
{
  const w = 10;
  const h = 10;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) data.set([240, 240, 240, 255], i * 4); // carrocería blanca
  for (let i = 0; i < 12; i++) data.set([10, 10, 10, 255], i * 4); // unos píxeles negros (faro)
  const median = medianLab(data, w, { x0: 0, y0: 0, x1: w, y1: h }, 1);
  check('la mediana ignora un faro oscuro en una carrocería blanca', colorName(median), 'blanco');
}

// ---- Zona muestreada ----
{
  const side = bodyRegion('side', { x: 0, y: 0, width: 100, height: 100 });
  check('de lado se muestrea el centro, entre las ruedas', side.x0 === 30 && side.x1 === 70, true);
  const face = bodyRegion('face', { x: 100, y: 50, width: 100, height: 100 });
  check('de frente la zona se desplaza con el recuadro', face.x0 === 120 && face.y0 === 86, true);
}

// ---- Mismo vehículo / vehículo distinto ----
const white = lab(78, 0, -4);
const whiteInShadow = lab(58, 0, -6);
const whiteWarmLight = lab(78, 2, 20); // blanco bajo luz amarilla de garaje
const silver = lab(66, 0, -3);
const gray = lab(52, 0, 0);
const black = lab(14, 0, 0);
const darkBlue = lab(22, 6, -20); // azul muy oscuro, casi negro
const red = lab(50, 70, 45);
const darkRed = lab(28, 40, 20);
const blue = lab(38, 3, -35);

check('blanco vs blanco', sameVehicleColor(white, white), true);
check('blanco vs el mismo blanco en sombra', sameVehicleColor(white, whiteInShadow), true);
check('blanco vs blanco con luz amarilla', sameVehicleColor(white, whiteWarmLight), true);
check('blanco vs plata (tolerado por la luz)', sameVehicleColor(white, silver), true);
check('plata vs gris', sameVehicleColor(silver, gray), true);
check('blanco vs negro es otro vehículo', sameVehicleColor(white, black), false);
check('negro vs blanco es otro vehículo', sameVehicleColor(black, white), false);
check('plata vs negro es otro vehículo', sameVehicleColor(silver, black), false);
check('negro vs azul muy oscuro (mismo, por la luz)', sameVehicleColor(black, darkBlue), true);
check('rojo vs rojo oscuro (sombra)', sameVehicleColor(red, darkRed), true);
check('rojo vs azul es otro vehículo', sameVehicleColor(red, blue), false);
check('rojo vs blanco es otro vehículo', sameVehicleColor(red, white), false);
check('azul vs negro es otro vehículo', sameVehicleColor(blue, black), false);
check('negro vs rojo es otro vehículo', sameVehicleColor(black, red), false);

// ---- Nombres (modo de diagnóstico) ----
check('nombre: blanco', colorName(white), 'blanco');
check('nombre: negro', colorName(black), 'negro');
