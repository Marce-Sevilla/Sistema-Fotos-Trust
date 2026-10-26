// Siluetas guía de encuadre (SVG) superpuestas al video.
// Hay 5 tipos de vehículo; cada uno tiene vista frontal, trasera y lateral (izquierda/derecha).
// VIN y odómetro son iguales para todos. Todo se dibuja en un viewBox 100x100 y conserva
// su proporción dentro del visor.

export const VEHICLE_TYPES = ['sedan', 'suv', 'pickup', 'hatchback', 'minivan'];

const MAIN = 'fill="none" stroke="#fff" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"';
const FINE = 'fill="none" stroke="#fff" stroke-opacity="0.75" stroke-width="1.2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"';

const path = (d, style = MAIN) => `<path ${style} d="${d}"/>`;
const mirror = (inner) => `<g transform="translate(100 0) scale(-1 1)">${inner}</g>`;

// ---------------------------------------------------------------- Vista lateral
// Todos los perfiles miran hacia la derecha (lateral izquierdo). El suelo está en y = 70.
const GROUND = 70;

const SIDE = {
  sedan: {
    sill: 62, R: 7.5, rx: 24, fx: 77, belt: 48.5,
    top: 'M5 62 L5 54 Q5 51 9 50.5 L21 49.5 Q27 49 31 45 L38 41.5 Q40 40 44 40 L60 40 Q64 40 67 43 L75 49 L89 51 Q96 52 96 57 L96 62',
    glass: ['M33 48 L39.5 42.5 H50 V48 Z', 'M53 48 V42.5 H61 Q63 42.5 64.5 44 L71 48 Z'],
    doors: [51.5], handles: [[45, 52], [56, 52]], mirror: [67, 46.5],
    lampF: [90, 51.5], lampR: [5.6, 52], extra: '',
  },
  suv: {
    sill: 60, R: 9.5, rx: 23, fx: 78, belt: 43.5,
    top: 'M5 60 L5 48 Q5 45 8 44.5 L12 43 L14 35.5 Q15 33 18 33 L62 33 Q66 33 68.5 35.5 L76 45.5 L89 47.5 Q96.5 48.5 96.5 54 L96.5 60',
    glass: ['M18 42 L19 35.5 H35 V42 Z', 'M38 42 V35.5 H51 V42 Z', 'M54 42 V35.5 H62 Q64 35.5 65.5 37.5 L71 42 Z'],
    doors: [36.5, 52.5], handles: [[31, 47.5], [47, 47.5], [58, 47.5]], mirror: [68, 41],
    lampF: [90.5, 48], lampR: [5.6, 46], extra: path('M17 31 H63', FINE),
  },
  pickup: {
    sill: 61, R: 9.5, rx: 20, fx: 79, belt: 45.5,
    top: 'M3 61 L3 46.5 H36.5 L37.5 37 Q38 34 41 34 L58 34 Q62 34 64.5 36.5 L72 45.5 L88 47.5 Q97.5 48.5 97.5 54 L97.5 61',
    glass: ['M41 44.5 L41.5 36.5 H50.5 V44.5 Z', 'M53 44.5 V36.5 H58 Q60 36.5 61.5 38 L67 44.5 Z'],
    doors: [51.8], handles: [[46, 50], [56, 50]], mirror: [66.5, 44],
    lampF: [91.5, 48], lampR: [3.6, 51],
    extra: path('M3 50.5 H36.5 M5 48 H35 M36.5 46.5 V61', FINE),
  },
  hatchback: {
    sill: 62, R: 7.5, rx: 26, fx: 75, belt: 47,
    top: 'M8 62 L8.5 52 Q9 49 12 47 L22 40.5 Q24 38.5 28 38 L58 38 Q63 38 66 41.5 L74 48.5 L87 50.5 Q94.5 51.5 94.5 56.5 L94.5 62',
    glass: ['M14 46.5 L21.5 41.8 L27 41.2 L29 46.5 Z', 'M31 46.5 L30 40 H49 V46.5 Z', 'M52 46.5 V40 H60 Q62 40 63.5 41.3 L69.5 46.5 Z'],
    doors: [50.5], handles: [[44, 50.5], [55, 50.5]], mirror: [65.5, 44.5],
    lampF: [88.5, 51], lampR: [8.6, 50], extra: '',
  },
  minivan: {
    sill: 62, R: 8, rx: 22, fx: 77, belt: 43.5,
    top: 'M5 62 L5.5 48 Q6 45 9 44.5 L12 43 L13.5 35.5 Q14.5 33 18 33 L66 33 Q70 33 72 36 L79 45 L90 47.5 Q95.5 48.5 95.5 54 L95.5 62',
    glass: ['M16.5 42 L17 35.5 H32 V42 Z', 'M35 42 V35.5 H48 V42 Z', 'M51 42 V35.5 H63 V42 Z', 'M66 42 V35.5 H68.5 Q70 35.5 71.2 37.3 L75.5 42 Z'],
    doors: [33.5, 49.5, 64.5], handles: [[39, 48], [55, 48]], mirror: [73, 42.5],
    lampF: [89.5, 48], lampR: [5.8, 46], extra: '',
  },
};

function wheel(cx, cy, R) {
  return `<circle ${MAIN} cx="${cx}" cy="${cy}" r="${R}"/>
    <circle ${FINE} cx="${cx}" cy="${cy}" r="${(R * 0.58).toFixed(2)}"/>
    <circle ${FINE} cx="${cx}" cy="${cy}" r="1.2"/>`;
}

function sideProfile(type) {
  const s = SIDE[type];
  const arch = s.R + 2;
  const cy = GROUND - s.R;
  const body = `${s.top} L${s.fx + arch} ${s.sill} A${arch} ${arch} 0 0 0 ${s.fx - arch} ${s.sill} L${s.rx + arch} ${s.sill} A${arch} ${arch} 0 0 0 ${s.rx - arch} ${s.sill} Z`;
  const [mx, my] = s.mirror;
  const [fx, fy] = s.lampF;
  const [rx, ry] = s.lampR;
  return [
    path(body),
    ...s.glass.map((d) => path(d, FINE)),
    ...s.doors.map((x) => path(`M${x} ${s.belt} V${s.sill - 0.5}`, FINE)),
    ...s.handles.map(([x, y]) => path(`M${x} ${y} h3.2`, FINE)),
    path(`M${mx} ${my} q2.4 -1.6 4.2 0.4 l-0.8 2.2 h-3 z`, FINE),
    path(`M${fx} ${fy} l5 1.4 v3 l-5.4 -1 z`, FINE),
    path(`M${rx} ${ry} h4 l0.4 3 h-4.4 z`, FINE),
    path(`M${s.rx + arch + 1} ${s.sill - 3} H${s.fx - arch - 1}`, FINE),
    s.extra,
    wheel(s.rx, cy, s.R),
    wheel(s.fx, cy, s.R),
  ].join('');
}

// ------------------------------------------------------------ Vista frontal / trasera
// El contorno exterior sigue la forma real de cada carrocería vista de frente: techo angosto,
// pilares inclinados, cofre, guardafangos redondeados y el parachoques con las llantas asomando.
// Parámetros (mitad derecha, centro en x = 50, suelo en y = 78):
//   w: semiancho de la carrocería   roof / roofW: altura y semiancho del techo
//   cowl: altura de la base del parabrisas   pillar: semiancho en esa base
//   bottom: borde inferior del parachoques   rearGlass: dónde termina el vidrio trasero
const GROUND_Y = 78;
const TIRE_Y = 76.5; // las llantas solo asoman unas unidades bajo el parachoques

const FACE = {
  sedan: { w: 26, roof: 35, roofW: 15.5, cowl: 50.5, pillar: 21, bottom: 71, rearGlass: 47.5, trunk: true },
  hatchback: { w: 25, roof: 36, roofW: 15.5, cowl: 51, pillar: 20.5, bottom: 71, rearGlass: 50 },
  suv: { w: 27, roof: 27, roofW: 18.5, cowl: 47.5, pillar: 22.5, bottom: 70, rearGlass: 46.5 },
  pickup: { w: 27.5, roof: 28, roofW: 17.5, cowl: 46, pillar: 22, bottom: 70, rearGlass: 39, tailgate: true },
  minivan: { w: 26.5, roof: 22, roofW: 19.5, cowl: 46, pillar: 23.5, bottom: 70.5, rearGlass: 45 },
};

const half = (inner) => inner + mirror(inner);

function faceView(type, rear) {
  const p = FACE[type];
  const { w, roof, roofW, cowl, pillar, bottom } = p;
  const L = 50 - w;
  const R = 50 + w;
  const fender = cowl + 1.5;

  // Contorno exterior (una sola línea cerrada).
  const outline = `M${L + 3} ${bottom} Q${L} ${bottom} ${L} ${bottom - 3} V${fender + 8} Q${L} ${fender + 1.5} ${L + 4} ${fender} L${50 - pillar} ${cowl} L${50 - roofW - 1} ${roof + 3} Q${50 - roofW} ${roof} ${50 - roofW + 3.5} ${roof} H${50 + roofW - 3.5} Q${50 + roofW} ${roof} ${50 + roofW + 1} ${roof + 3} L${50 + pillar} ${cowl} L${R - 4} ${fender} Q${R} ${fender + 1.5} ${R} ${fender + 8} V${bottom - 3} Q${R} ${bottom} ${R - 3} ${bottom} Z`;

  // Cristal del parabrisas (o del vidrio trasero): sigue la inclinación de los pilares.
  const glassBottom = rear ? p.rearGlass : cowl - 1;
  const slope = ((50 - pillar + 3) - (50 - roofW + 3)) / (cowl - 1 - (roof + 4));
  const gx = (50 - roofW + 3) + slope * (glassBottom - (roof + 4));
  const glass = `M${gx.toFixed(2)} ${glassBottom} L${50 - roofW + 3} ${roof + 4} H${50 + roofW - 3} L${(100 - gx).toFixed(2)} ${glassBottom} Z`;

  const parts = [
    path(outline),
    path(glass, FINE),
    // retrovisores (sobresalen un poco del ancho de la carrocería)
    half(path(`M${L + 3} ${cowl - 4} H${L - 2.5} Q${L - 4} ${cowl - 4} ${L - 4} ${cowl - 2.5} V${cowl + 0.5} Q${L - 4} ${cowl + 2} ${L - 2.5} ${cowl + 2} H${L + 3}`)),
    // llantas: solo se ve la parte que asoma bajo el parachoques
    half(path(`M${L + 2} ${bottom} V${TIRE_Y - 1} Q${L + 2} ${TIRE_Y} ${L + 3.5} ${TIRE_Y} H${L + 7.5} Q${L + 9} ${TIRE_Y} ${L + 9} ${TIRE_Y - 1} V${bottom}`)),
  ];

  if (!rear) {
    parts.push(
      // faros angulosos, rejilla, emblema, toma de aire inferior y faros antiniebla
      half(path(`M${L + 3} ${cowl + 6} Q${L + 3.5} ${cowl + 3.5} ${L + 8} ${cowl + 4} L${50 - 9.5} ${cowl + 5.5} Q${50 - 9} ${cowl + 8} ${50 - 12} ${cowl + 9} L${L + 5} ${cowl + 10} Q${L + 2.5} ${cowl + 9.5} ${L + 3} ${cowl + 6} Z`, FINE)),
      path(`M${50 - 8.5} ${cowl + 9.5} H${50 + 8.5} L${50 + 7.5} ${cowl + 14.5} H${50 - 7.5} Z`, FINE),
      `<circle ${FINE} cx="50" cy="${cowl + 7}" r="1.4"/>`,
      path(`M${50 - 14} ${cowl + 16} H${50 + 14} L${50 + 12} ${bottom - 1.5} H${50 - 12} Z`, FINE),
      half(`<circle ${FINE} cx="${L + 7.5}" cy="${bottom - 4}" r="1.8"/>`),
    );
  } else {
    parts.push(
      // luces traseras anchas, placa y línea del parachoques
      half(path(`M${L + 2.5} ${cowl + 4} H${50 - 9} V${cowl + 9} H${L + 4} Q${L + 2.5} ${cowl + 9} ${L + 2.5} ${cowl + 7.5} Z`, FINE)),
      `<rect ${FINE} x="43" y="${cowl + 9.5}" width="14" height="6.5" rx="1"/>`,
      path(`M${L + 3} ${bottom - 4.5} H${R - 3}`, FINE),
    );
    if (p.trunk) parts.push(path(`M${L + 4} ${cowl + 2.5} H${R - 4}`, FINE)); // tapa de la cajuela
    if (p.tailgate) parts.push(`<rect ${FINE} x="${L + 3}" y="${cowl + 3}" width="${2 * w - 6}" height="${bottom - 2 - cowl - 3}" rx="1.5"/>`);
  }
  return parts.join('');
}

// ----------------------------------------------------------------- VIN y odómetro
const VIN_TICKS = Array.from({ length: 16 }, (_, i) => {
  const x = 6 + ((i + 1) * 88) / 17;
  return `M${x.toFixed(2)} 44 V56`;
}).join(' ');

const VIN = `${`<rect ${MAIN} x="6" y="42" width="88" height="16" rx="2"/>`}${path(VIN_TICKS, FINE)}`;

// VIN en la puerta: etiqueta del marco con código de barras, textos y, resaltada, la línea del VIN (17 casillas).
const DOOR_TICKS = Array.from({ length: 16 }, (_, i) => `M${(22 + ((i + 1) * 56) / 17).toFixed(2)} 58 V66`).join(' ');

const VIN_DOOR = [
  `<rect ${MAIN} x="16" y="26" width="68" height="48" rx="3"/>`,
  path('M22 32 V42 M25 32 V42 M27 32 V42 M31 32 V42 M33 32 V42 M37 32 V42 M39 32 V42 M43 32 V42', FINE),
  path('M52 33 H78 M52 38 H72 M52 43 H76', FINE),
  `<rect ${MAIN} x="22" y="55" width="56" height="14" rx="2"/>`,
  path(DOOR_TICKS, FINE),
].join('');

const ODOMETER = [
  path('M8 38 Q8 30 16 30 H84 Q92 30 92 38 V62 Q92 70 84 70 H16 Q8 70 8 62 Z'),
  `<circle ${MAIN} cx="26" cy="50" r="13"/>`,
  `<circle ${MAIN} cx="74" cy="50" r="13"/>`,
  `<rect ${MAIN} x="42" y="44" width="16" height="12" rx="2"/>`,
  path('M45 50 H55', FINE),
].join('');

// ------------------------------------------------------------------------ API
// Las vistas frontal/trasera son más angostas que las laterales; se amplían para llenar el visor.
// Escala 1.5: la carrocería (~52 de ancho) pasa a ocupar ~78 % del visor, centrada según su altura.
const enlarge = (inner, type) => `<g transform="translate(50 50) scale(1.5) translate(-50 -${(FACE[type].roof + GROUND_Y) / 2})">${inner}</g>`;

function shape(kind, vehicle) {
  const type = VEHICLE_TYPES.includes(vehicle) ? vehicle : 'sedan';
  switch (kind) {
    case 'front':
      return enlarge(faceView(type, false), type);
    case 'rear':
      return enlarge(faceView(type, true), type);
    case 'side-left':
      return sideProfile(type);
    case 'side-right':
      return mirror(sideProfile(type));
    case 'vin':
      return VIN;
    case 'vin-door':
      return VIN_DOOR;
    case 'odometer':
      return ODOMETER;
    default:
      return '';
  }
}

export function guideSvg(kind, vehicle = 'sedan', cls = 'guide') {
  return `<svg class="${cls}" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${shape(kind, vehicle)}</svg>`;
}

// Icono pequeño (perfil) para el selector de tipo de vehículo.
export function vehicleIcon(vehicle) {
  return `<svg class="vehicle-icon" viewBox="0 28 100 46" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${sideProfile(vehicle)}</svg>`;
}
