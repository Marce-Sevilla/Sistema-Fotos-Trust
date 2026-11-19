// Efectos de texto y de transición entre pasos. Todos se apagan con «reducir movimiento».
import { onLangChange } from '../i18n.js';

const GLYPHS = '01<>/\\_-+*#';
const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// El título se «descifra»: las letras aparecen de izquierda a derecha sobre símbolos que cambian.
export function scramble(element, duration = 520) {
  const final = element.textContent;
  if (!final.trim() || reduceMotion()) return;
  element.setAttribute('aria-label', final);
  const start = performance.now();
  function tick(now) {
    const progress = Math.min(1, (now - start) / duration);
    const keep = Math.floor(final.length * progress);
    const tail = [...final.slice(keep)].map((char) => (char === ' ' ? ' ' : GLYPHS[Math.floor(Math.random() * GLYPHS.length)])).join('');
    element.textContent = progress < 1 ? final.slice(0, keep) + tail : final;
    if (progress < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

// Cada vez que la pantalla cambia de verdad (otro título), el contenido entra de borroso a nítido y el
// título se descifra. No se repite en la misma pantalla (p. ej. el resultado de la validación) ni al cambiar de idioma.
export function animateScreens(root) {
  let lastKey = null;
  let timer = 0;
  let languageChanged = false;
  // Al cambiar de idioma el texto se cambia directo, sin «descifrarlo» ni animar la pantalla.
  onLangChange(() => {
    languageChanged = true;
  });
  new MutationObserver(() => {
    const heading = root.querySelector('h1');
    const key = heading?.textContent ?? '';
    if (key === lastKey) return;
    lastKey = key;
    if (languageChanged) {
      languageChanged = false;
      return;
    }
    if (reduceMotion()) return;
    root.classList.remove('enter');
    void root.offsetWidth; // reinicia la animación
    root.classList.add('enter');
    clearTimeout(timer);
    timer = setTimeout(() => root.classList.remove('enter'), 700);
    root.querySelectorAll('h1').forEach((h) => scramble(h));
  }).observe(root, { childList: true });
}
