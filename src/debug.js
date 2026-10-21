// Modo de diagnóstico: muestra las medidas de cada foto para calibrar los umbrales con fotos reales.
// Se activa con `?debug=1` en la dirección (queda guardado en el teléfono) o tocando 5 veces el logo.
// `?debug=0` lo desactiva.
const KEY = 'tru-debug';

export function initDebug() {
  try {
    const param = new URLSearchParams(location.search).get('debug');
    if (param === '1' || param === '') localStorage.setItem(KEY, '1');
    else if (param === '0') localStorage.removeItem(KEY);
  } catch {
    // Sin localStorage (modo privado): se usa solo el parámetro de la dirección.
  }
}

export function isDebug() {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return new URLSearchParams(location.search).has('debug');
  }
}

export function toggleDebug() {
  try {
    if (isDebug()) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, '1');
  } catch {
    // Sin persistencia no se puede alternar.
  }
}
