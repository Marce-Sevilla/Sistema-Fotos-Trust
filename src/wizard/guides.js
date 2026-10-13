// Siluetas guía de encuadre (SVG) que se superponen al video.
// Todas usan viewBox 0 0 100 100 con preserveAspectRatio="none" para ocupar el visor.
const STROKE = 'fill="none" stroke="#fff" stroke-width="0.8" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"';

const SHAPES = {
  front: `
    <path ${STROKE} d="M18 70 L18 52 Q18 44 24 41 L32 28 Q34 24 40 24 L60 24 Q66 24 68 28 L76 41 Q82 44 82 52 L82 70 Z"/>
    <path ${STROKE} d="M34 41 L40 29 L60 29 L66 41 Z"/>
    <circle ${STROKE} cx="28" cy="58" r="4"/>
    <circle ${STROKE} cx="72" cy="58" r="4"/>
    <rect ${STROKE} x="42" y="60" width="16" height="7" rx="1"/>
    <rect ${STROKE} x="20" y="70" width="10" height="8" rx="2"/>
    <rect ${STROKE} x="70" y="70" width="10" height="8" rx="2"/>`,
  rear: `
    <path ${STROKE} d="M18 70 L18 50 Q18 44 24 42 L30 30 Q32 25 38 25 L62 25 Q68 25 70 30 L76 42 Q82 44 82 50 L82 70 Z"/>
    <path ${STROKE} d="M32 42 L37 30 L63 30 L68 42 Z"/>
    <rect ${STROKE} x="20" y="50" width="10" height="6" rx="1"/>
    <rect ${STROKE} x="70" y="50" width="10" height="6" rx="1"/>
    <rect ${STROKE} x="42" y="58" width="16" height="7" rx="1"/>
    <rect ${STROKE} x="20" y="70" width="10" height="8" rx="2"/>
    <rect ${STROKE} x="70" y="70" width="10" height="8" rx="2"/>`,
  side: `
    <path ${STROKE} d="M8 62 L8 54 Q8 49 14 48 L26 46 L36 34 Q38 31 42 31 L62 31 Q66 31 69 35 L76 46 L88 48 Q93 49 93 54 L93 62 Z"/>
    <path ${STROKE} d="M30 46 L38 35 L50 35 L50 46 Z"/>
    <path ${STROKE} d="M54 46 L54 35 L63 35 L70 46 Z"/>
    <circle ${STROKE} cx="27" cy="64" r="8"/>
    <circle ${STROKE} cx="74" cy="64" r="8"/>`,
  vin: `
    <rect ${STROKE} x="8" y="40" width="84" height="20" rx="2"/>
    <path ${STROKE} d="M14 50 L86 50" stroke-dasharray="2 2"/>`,
  odometer: `
    <rect ${STROKE} x="10" y="30" width="80" height="40" rx="3"/>
    <circle ${STROKE} cx="30" cy="50" r="14"/>
    <circle ${STROKE} cx="70" cy="50" r="14"/>
    <rect ${STROKE} x="42" y="44" width="16" height="12" rx="1"/>`,
};

export function guideSvg(kind) {
  return `<svg class="guide" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${SHAPES[kind] ?? ''}</svg>`;
}
