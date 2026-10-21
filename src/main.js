import './style.css';
import logoUrl from './assets/logo-header.png';
import { initDebug, isDebug, toggleDebug } from './debug.js';
import { initI18n, t, getLang, setLang, onLangChange } from './i18n.js';
import { createWizard } from './wizard/wizard.js';

initDebug();
initI18n();

// El botón muestra el idioma al que se cambia, escrito en ese mismo idioma.
const LANG_NAMES = { es: 'Español', en: 'English' };

const app = document.getElementById('app');
app.innerHTML = `
  <div class="brand-bar">
    <div class="brand" data-brand></div>
    <button class="lang-toggle" type="button" data-lang-toggle></button>
  </div>
  ${isDebug() ? `<p class="debug-badge">debug · versión ${__COMMIT__}</p>` : ''}
  <main class="wizard" id="wizard"></main>`;

const brand = app.querySelector('[data-brand]');
const toggle = app.querySelector('[data-lang-toggle]');

function renderChrome() {
  brand.innerHTML = `<img src="${logoUrl}" alt="${t('brand.name')}" />`;
  const next = getLang() === 'es' ? 'en' : 'es';
  toggle.textContent = LANG_NAMES[next];
  toggle.setAttribute('aria-label', t('lang.switch'));
  toggle.dataset.next = next;
}

toggle.addEventListener('click', () => setLang(toggle.dataset.next));
onLangChange(renderChrome);
renderChrome();

// Tocar 5 veces el logo (en 3 s) activa o desactiva el modo de diagnóstico.
let taps = [];
brand.addEventListener('click', () => {
  const now = Date.now();
  taps = [...taps.filter((time) => now - time < 3000), now];
  if (taps.length >= 5) {
    // Se quita `?debug` de la dirección para que al recargar no vuelva a activarse solo.
    const url = new URL(location.href);
    url.searchParams.delete('debug');
    history.replaceState(null, '', url);
    toggleDebug();
    location.reload();
  }
});

createWizard(document.getElementById('wizard'));
