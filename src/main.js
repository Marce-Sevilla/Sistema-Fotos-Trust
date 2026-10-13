import './style.css';
import { initI18n, t, getLang, setLang, onLangChange } from './i18n.js';
import { createWizard } from './wizard/wizard.js';

initI18n();

const app = document.getElementById('app');
app.innerHTML = `
  <div class="brand-bar">
    <div class="brand" data-brand></div>
    <button class="lang-toggle" type="button" data-lang-toggle></button>
  </div>
  <main class="wizard" id="wizard"></main>`;

const brand = app.querySelector('[data-brand]');
const toggle = app.querySelector('[data-lang-toggle]');

// Para usar el logo oficial: colocar el archivo en public/ (p. ej. public/logo.svg)
// y cambiar el contenido de la marca por <img src="/logo.svg" alt="...">.
function renderChrome() {
  brand.innerHTML = `<span class="brand-name">${t('brand.name')}</span>`;
  const next = getLang() === 'es' ? 'en' : 'es';
  toggle.textContent = next.toUpperCase();
  toggle.setAttribute('aria-label', t('lang.switch'));
  toggle.dataset.next = next;
}

toggle.addEventListener('click', () => setLang(toggle.dataset.next));
onLangChange(renderChrome);
renderChrome();

createWizard(document.getElementById('wizard'));
