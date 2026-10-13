// Siluetas guía de encuadre (SVG) superpuestas al video, basadas en las 6 posiciones
// que aceptan las aseguradoras: frente, trasera, lateral izquierdo/derecho, VIN y odómetro.
// Todas se dibujan en un viewBox 100x100 y conservan su proporción dentro del visor.
const STROKE =
  'fill="none" stroke="#fff" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"';

// Sedán visto de frente.
const FRONT = `
  <path ${STROKE} d="M16 66 V53 Q16 47 22 45 L30 41 H70 L78 45 Q84 47 84 53 V66 Q84 70 80 70 H20 Q16 70 16 66 Z"/>
  <path ${STROKE} d="M31 41 L37 29 Q38 27 41 27 H59 Q62 27 63 29 L69 41"/>
  <path ${STROKE} d="M36 41 L40 31 H60 L64 41"/>
  <rect ${STROKE} x="10" y="43" width="6" height="5" rx="1.5"/>
  <rect ${STROKE} x="84" y="43" width="6" height="5" rx="1.5"/>
  <path ${STROKE} d="M19 50 H36 L34 57 H19 Z"/>
  <path ${STROKE} d="M81 50 H64 L66 57 H81 Z"/>
  <rect ${STROKE} x="40" y="50" width="20" height="8" rx="2"/>
  <rect ${STROKE} x="43" y="62" width="14" height="7" rx="1"/>
  <rect ${STROKE} x="20" y="70" width="9" height="8" rx="2"/>
  <rect ${STROKE} x="71" y="70" width="9" height="8" rx="2"/>`;

// Sedán visto desde atrás.
const REAR = `
  <path ${STROKE} d="M16 66 V54 Q16 48 22 46 L28 44 H72 L78 46 Q84 48 84 54 V66 Q84 70 80 70 H20 Q16 70 16 66 Z"/>
  <path ${STROKE} d="M29 44 L35 33 Q36 31 39 31 H61 Q64 31 65 33 L71 44"/>
  <path ${STROKE} d="M34 44 L38 34 H62 L66 44"/>
  <rect ${STROKE} x="10" y="45" width="6" height="5" rx="1.5"/>
  <rect ${STROKE} x="84" y="45" width="6" height="5" rx="1.5"/>
  <path ${STROKE} d="M19 49 H33 V55 H19 Z"/>
  <path ${STROKE} d="M81 49 H67 V55 H81 Z"/>
  <path ${STROKE} d="M33 52 H67"/>
  <rect ${STROKE} x="42" y="58" width="16" height="7" rx="1"/>
  <rect ${STROKE} x="20" y="70" width="9" height="8" rx="2"/>
  <rect ${STROKE} x="71" y="70" width="9" height="8" rx="2"/>`;

// Sedán de perfil con el frente hacia la derecha (lateral izquierdo).
const SIDE = `
  <path ${STROKE} d="M6 64 V56 Q6 52 11 51 L24 49 L33 38 Q35 35 39 35 H62 Q66 35 69 38 L76 49 L90 52 Q95 53 95 58 V64 Z"/>
  <path ${STROKE} d="M32 49 L39 38 H49 V49 Z"/>
  <path ${STROKE} d="M54 49 V38 H63 L71 49 Z"/>
  <path ${STROKE} d="M51 38 V64"/>
  <path ${STROKE} d="M43 54 H47 M56 54 H60"/>
  <circle ${STROKE} cx="25" cy="65" r="8"/>
  <circle ${STROKE} cx="77" cy="65" r="8"/>`;

// VIN: placa larga con 17 casillas, como el VIN visible en la base del parabrisas.
const VIN_TICKS = Array.from({ length: 16 }, (_, i) => {
  const x = 6 + ((i + 1) * 88) / 17;
  return `M${x.toFixed(2)} 44 V56`;
}).join(' ');
const VIN = `
  <rect ${STROKE} x="6" y="42" width="88" height="16" rx="2"/>
  <path ${STROKE} d="${VIN_TICKS}" stroke-width="1.2"/>`;

// Odómetro: tablero de instrumentos con dos diales y pantalla central.
const ODOMETER = `
  <path ${STROKE} d="M8 38 Q8 30 16 30 H84 Q92 30 92 38 V62 Q92 70 84 70 H16 Q8 70 8 62 Z"/>
  <circle ${STROKE} cx="26" cy="50" r="13"/>
  <circle ${STROKE} cx="74" cy="50" r="13"/>
  <rect ${STROKE} x="42" y="44" width="16" height="12" rx="2"/>
  <path ${STROKE} d="M45 50 H55" stroke-dasharray="2 2"/>`;

const SHAPES = {
  front: FRONT,
  rear: REAR,
  'side-left': SIDE,
  'side-right': `<g transform="translate(100 0) scale(-1 1)">${SIDE}</g>`,
  vin: VIN,
  odometer: ODOMETER,
};

export function guideSvg(kind) {
  return `<svg class="guide" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${SHAPES[kind] ?? ''}</svg>`;
}
