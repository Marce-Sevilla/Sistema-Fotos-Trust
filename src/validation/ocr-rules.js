// Interpretación del texto leído por OCR (funciones puras, sin Tesseract ni DOM).
//
// Entrada común: `lines` = [{ words: [{ text, confidence }] }] con la confianza (0-100) de cada palabra.
// Se trabaja con palabras seguras y dentro de una misma línea; buscar a ciegas en todo el texto
// encontraría "VIN" válidos por pura casualidad (1 de cada 11 cadenas cumple el dígito verificador).

// ---- VIN -------------------------------------------------------------------
// Un VIN tiene 17 caracteres alfanuméricos y nunca usa las letras I, O ni Q.
const VIN_VALUES = { A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8, J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9, S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9 };
const VIN_WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];

export const VIN_PATTERN = /^[A-HJ-NPR-Z0-9]{17}$/;

// Dígito verificador (posición 9) que exigen los vehículos de Norteamérica.
export function vinChecksumValid(vin) {
  if (!VIN_PATTERN.test(vin)) return false;
  let total = 0;
  for (let i = 0; i < 17; i++) {
    const c = vin[i];
    total += (/\d/.test(c) ? Number(c) : VIN_VALUES[c]) * VIN_WEIGHTS[i];
  }
  const check = total % 11;
  return vin[8] === (check === 10 ? 'X' : String(check));
}

// El OCR confunde I con 1 y O/Q con 0; como esas letras no existen en un VIN, se corrigen.
const cleanVin = (text) => text.toUpperCase().replace(/I/g, '1').replace(/[OQ]/g, '0').replace(/[^A-Z0-9]/g, '');

// Devuelve { vin, checksumOk } o null si ninguna línea contiene un VIN.
// Un VIN se reconoce como un grupo de 1 a 4 palabras seguidas (algunas etiquetas lo imprimen en
// bloques) que suman exactamente 17 caracteres. La confianza que reporta Tesseract no sirve aquí
// (con el alfabeto restringido da valores erráticos), así que la certeza sale de la forma del texto:
//  - con dígito verificador válido se acepta el grupo;
//  - sin él solo se acepta una palabra única de 17 con mezcla de letras y números (el OCR probablemente
//    erró un carácter y la persona lo corrige al confirmar).
const MAX_VIN_WORDS = 4;

export function extractVin(lines) {
  let fallback = null;
  for (const line of lines) {
    const words = line.words.map((w) => cleanVin(w.text)).filter(Boolean);
    for (let start = 0; start < words.length; start++) {
      let text = '';
      for (let end = start; end < Math.min(words.length, start + MAX_VIN_WORDS); end++) {
        text += words[end];
        if (text.length > 17) break;
        if (text.length < 17) continue;
        if (vinChecksumValid(text)) return { vin: text, checksumOk: true };
        const digits = text.replace(/\D/g, '').length;
        if (!fallback && end === start && VIN_PATTERN.test(text) && digits >= 3 && 17 - digits >= 3) {
          fallback = { vin: text, checksumOk: false };
        }
      }
    }
  }
  return fallback;
}

// ---- Odómetro ----------------------------------------------------------------
// El kilometraje es una cifra de 4 a 7 dígitos (los números de la escala del velocímetro tienen
// 3 como máximo). Se ignoran comas y puntos de miles ("87,654") y los decimales del parcial ("123.4").
// Aquí sí se usa la confianza: con el OCR sin restricción de alfabeto separa bien una lectura real
// (~90) de ruido (nada o muy baja). Se corrigen las letras que el OCR confunde con dígitos.
export function extractOdometer(lines, minConfidence = 60) {
  const readings = [];
  for (const line of lines) {
    for (const word of line.words) {
      if (word.confidence < minConfidence) continue;
      let text = word.text.trim();
      if (/^[\dOoIl,.]{4,9}$/.test(text) && (text.match(/\d/g) ?? []).length >= 3) text = text.replace(/[Oo]/g, '0').replace(/[Il]/g, '1');
      if (/^\d+[.,]\d{1,2}$/.test(text)) continue; // parcial con decimales
      const digits = text.replace(/[,.\s]/g, '');
      if (/^\d{4,7}$/.test(digits)) readings.push(digits);
    }
  }
  if (!readings.length) return null;
  // Con varias cifras (kilometraje y parcial), la más larga suele ser el total.
  return { reading: readings.sort((a, b) => b.length - a.length)[0] };
}

// ---- Validación de lo que el usuario confirma o corrige --------------------------
export const ODOMETER_PATTERN = /^\d{1,7}$/;
