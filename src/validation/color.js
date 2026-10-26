// Color de la carrocería: sirve para comprobar que las 4 fotos exteriores son del mismo vehículo.
// Todo son funciones puras (sin DOM) para poder probarlas con datos de ejemplo.
//
// Se trabaja en el espacio Lab (L: luminosidad 0-100, a/b: color), que se parece más a cómo ve el ojo.
// La comparación es tolerante a propósito: una sombra o la luz amarilla de un garaje cambian la
// luminosidad y el matiz, así que solo se rechazan diferencias claras (blanco vs negro, rojo vs azul).

export const COLOR_LIMITS = {
  achromaticChroma: 18, // por debajo, el color es "sin matiz" (blanco, gris, plata, negro)
  clearlyColorfulChroma: 28, // por encima, el color es inequívocamente un color (rojo, azul...)
  maxHueDifference: 50, // grados de matiz de diferencia permitidos entre dos colores con matiz
  maxTierDifference: 1, // saltos permitidos entre niveles de gris vecinos (blanco~plata~gris~negro)
};

// Niveles de luminosidad de los colores sin matiz: 0 negro, 1 gris oscuro, 2 gris/plata, 3 blanco.
const tierOf = (L) => (L < 30 ? 0 : L < 50 ? 1 : L < 70 ? 2 : 3);

// sRGB (0-255) -> Lab (iluminante D65)
export function rgbToLab(r, g, b) {
  const lin = (v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  const X = (0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / 0.95047;
  const Y = 0.2126729 * R + 0.7151522 * G + 0.072175 * B;
  const Z = (0.0193339 * R + 0.119192 * G + 0.9503041 * B) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const [fx, fy, fz] = [f(X), f(Y), f(Z)];
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

const median = (values) => {
  const sorted = [...values].sort((x, y) => x - y);
  return sorted[Math.floor(sorted.length / 2)];
};

// Color mediano (Lab) de una región de una imagen RGBA. region = { x0, y0, x1, y1 } en píxeles.
// La mediana ignora lo que ocupa poco espacio (faros, rejilla, reflejos).
export function medianLab(data, width, region, step = 2) {
  const Ls = [];
  const As = [];
  const Bs = [];
  for (let y = Math.floor(region.y0); y < Math.floor(region.y1); y += step) {
    for (let x = Math.floor(region.x0); x < Math.floor(region.x1); x += step) {
      const i = (y * width + x) * 4;
      const { L, a, b } = rgbToLab(data[i], data[i + 1], data[i + 2]);
      Ls.push(L);
      As.push(a);
      Bs.push(b);
    }
  }
  if (!Ls.length) return null;
  return { L: median(Ls), a: median(As), b: median(Bs) };
}

// Zona de la carrocería que se muestrea dentro del recuadro del vehículo detectado.
// De lado: el panel de las puertas (entre las ruedas, bajo las ventanas). De frente o atrás: la tapa
// del cofre/cajuela (bajo el cristal y sobre las luces y la parrilla).
export function bodyRegion(view, box) {
  const [x0, x1, y0, y1] = view === 'side' ? [0.3, 0.7, 0.4, 0.66] : [0.2, 0.8, 0.36, 0.58];
  return { x0: box.x + box.width * x0, x1: box.x + box.width * x1, y0: box.y + box.height * y0, y1: box.y + box.height * y1 };
}

const chromaOf = ({ a, b }) => Math.hypot(a, b);
const hueOf = ({ a, b }) => ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
const hueGap = (h1, h2) => Math.min(Math.abs(h1 - h2), 360 - Math.abs(h1 - h2));

// Nombre aproximado del color, solo para el modo de diagnóstico.
export function colorName(lab) {
  const C = chromaOf(lab);
  if (C < COLOR_LIMITS.achromaticChroma) return ['negro', 'gris oscuro', 'gris/plata', 'blanco'][tierOf(lab.L)];
  const h = hueOf(lab);
  const hue = h < 20 || h >= 340 ? 'rojo' : h < 50 ? 'naranja/café' : h < 100 ? 'amarillo' : h < 170 ? 'verde' : h < 260 ? 'azul' : 'morado';
  return lab.L < 35 ? `${hue} oscuro` : hue;
}

// ¿Podrían ser el mismo vehículo? Rechaza solo diferencias claras de color.
export function sameVehicleColor(a, b) {
  const { achromaticChroma, clearlyColorfulChroma, maxHueDifference, maxTierDifference } = COLOR_LIMITS;
  const [ca, cb] = [chromaOf(a), chromaOf(b)];
  const [aGray, bGray] = [ca < achromaticChroma, cb < achromaticChroma];

  if (aGray && bGray) return Math.abs(tierOf(a.L) - tierOf(b.L)) <= maxTierDifference;

  if (aGray !== bGray) {
    // Un gris frente a un color: solo es distinto si el color es inequívoco. Un blanco bajo luz amarilla o
    // un negro azulado miden con algo de matiz y siguen siendo "blanco" o "negro".
    const colorful = aGray ? cb : ca;
    if (colorful >= clearlyColorfulChroma) return false;
    return Math.abs(tierOf(a.L) - tierOf(b.L)) <= maxTierDifference;
  }

  // Los dos con matiz: el matiz debe ser parecido (la luminosidad cambia mucho con la luz y la sombra).
  return hueGap(hueOf(a), hueOf(b)) <= maxHueDifference;
}
