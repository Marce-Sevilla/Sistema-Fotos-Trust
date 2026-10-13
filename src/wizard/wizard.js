import { STEPS } from './steps.js';
import { guideSvg, vehicleIcon, VEHICLE_TYPES } from './guides.js';
import { validateProfile } from './profile.js';
import { cameraSupported, startCamera, stopCamera, captureFrame, pickPhotoFile } from './camera.js';
import { t, onLangChange } from '../i18n.js';

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function createWizard(root) {
  const photos = new Array(STEPS.length).fill(null); // { blob, width, height, url }
  const profile = { fullName: '', email: '', phone: '', vehicle: '' };
  const announced = new Set(); // pasos cuya tarjeta "esta es la foto que sigue" ya se vio
  let index = -1; // -1 = pantalla inicial (datos y tipo de vehículo)
  let stream = null;

  function render() {
    stopCamera(stream);
    stream = null;
    if (index < 0) return renderIntro();
    if (index >= STEPS.length) return renderSummary();

    const step = STEPS[index];
    const photo = photos[index];
    const title = t(`steps.${step.id}.title`);
    // Antes de abrir la cámara, cada paso muestra al centro qué foto se va a tomar.
    const announcing = !photo && !announced.has(index);

    root.innerHTML = `
      <header class="top">
        <div class="progress" role="progressbar" aria-valuemin="1" aria-valuemax="${STEPS.length}" aria-valuenow="${index + 1}">
          ${STEPS.map((_, i) => `<span class="dot ${i < index ? 'done' : ''} ${i === index ? 'current' : ''}"></span>`).join('')}
        </div>
        <p class="counter">${t('wizard.counter', { current: index + 1, total: STEPS.length })}</p>
        ${announcing ? '' : `<h1>${title}</h1><p class="hint">${t(`steps.${step.id}.hint`)}</p>`}
      </header>
      <div class="viewer">
        ${
          announcing
            ? `<div class="announce">
                 <p class="announce-label">${t('wizard.nextPhoto')}</p>
                 ${guideSvg(step.guide, profile.vehicle, 'announce-guide')}
                 <h1>${title}</h1>
                 <p class="hint">${t(`steps.${step.id}.hint`)}</p>
                 <button class="btn primary" data-action="open-camera">${t('wizard.openCamera')}</button>
               </div>`
            : `${photo ? `<img class="photo" alt="${t('wizard.photoAlt', { title })}" src="${photo.url}" />` : '<video class="video" playsinline muted></video>'}
               ${photo ? '' : guideSvg(step.guide, profile.vehicle)}
               <p class="status" role="status" hidden></p>`
        }
      </div>
      <footer class="actions">
        ${
          photo
            ? `<button class="btn secondary" data-action="retake">${t('wizard.retake')}</button>
               <button class="btn primary" data-action="next">${index === STEPS.length - 1 ? t('wizard.finish') : t('wizard.next')}</button>`
            : announcing
              ? `<button class="btn secondary" data-action="back">${t('wizard.back')}</button>`
              : `<button class="btn secondary" data-action="back">${t('wizard.back')}</button>
                 <button class="btn shutter" data-action="capture" aria-label="${t('wizard.capture')}"></button>`
        }
      </footer>`;

    if (!photo && !announcing) initCamera();
  }

  // ---- Pantalla inicial -------------------------------------------------------
  function renderIntro(errors = {}) {
    const field = (name, type, autocomplete, inputmode = '') => `
      <div class="field ${errors[name] ? 'invalid' : ''}">
        <label for="f-${name}">${t(`intro.${name === 'fullName' ? 'name' : name}`)}</label>
        <input id="f-${name}" name="${name}" type="${type}" autocomplete="${autocomplete}" ${inputmode ? `inputmode="${inputmode}"` : ''}
          value="${escapeHtml(profile[name])}" aria-invalid="${errors[name] ? 'true' : 'false'}" />
        ${errors[name] ? `<p class="error" role="alert">${t(errors[name])}</p>` : ''}
      </div>`;

    root.innerHTML = `
      <form class="intro" novalidate>
        <header class="top">
          <h1>${t('intro.title')}</h1>
          <p class="hint">${t('intro.subtitle')}</p>
        </header>
        <div class="intro-fields">
          ${field('fullName', 'text', 'name')}
          ${field('email', 'email', 'email', 'email')}
          ${field('phone', 'tel', 'tel', 'tel')}
          <fieldset class="vehicle-picker ${errors.vehicle ? 'invalid' : ''}">
            <legend>${t('intro.vehicle')}</legend>
            <div class="vehicle-grid">
              ${VEHICLE_TYPES.map(
                (type) => `
                <label class="vehicle-card">
                  <input type="radio" name="vehicle" value="${type}" ${profile.vehicle === type ? 'checked' : ''} />
                  <span class="vehicle-card-body">${vehicleIcon(type)}<span>${t(`vehicle.${type}`)}</span></span>
                </label>`,
              ).join('')}
            </div>
            ${errors.vehicle ? `<p class="error" role="alert">${t(errors.vehicle)}</p>` : ''}
          </fieldset>
        </div>
        <footer class="actions">
          <button class="btn primary" type="submit">${t('intro.start')}</button>
        </footer>
      </form>`;
  }

  function readIntroForm() {
    const form = root.querySelector('form.intro');
    if (!form) return;
    const data = new FormData(form);
    for (const key of Object.keys(profile)) profile[key] = String(data.get(key) ?? '');
  }

  function submitIntro(event) {
    event.preventDefault();
    readIntroForm();
    for (const key of ['fullName', 'email', 'phone']) profile[key] = profile[key].trim();
    const errors = validateProfile(profile);
    if (Object.keys(errors).length) {
      renderIntro(errors);
      root.querySelector('.invalid input')?.focus();
      return;
    }
    index = 0;
    render();
  }

  // ---- Cámara y captura -------------------------------------------------------
  async function initCamera() {
    const video = root.querySelector('video');
    const status = root.querySelector('.status');
    const shutter = root.querySelector('[data-action="capture"]');
    const showStatus = (msg) => {
      status.textContent = msg;
      status.hidden = false;
    };

    if (!cameraSupported()) {
      showStatus(t('wizard.noCamera'));
      return;
    }
    shutter.disabled = true;
    try {
      stream = await startCamera(video);
    } catch {
      showStatus(t('wizard.cameraDenied'));
    }
    shutter.disabled = false;
  }

  async function capture() {
    const video = root.querySelector('video');
    const result = stream && video?.videoWidth ? await captureFrame(video) : await pickPhotoFile();
    if (!result) return;
    photos[index] = { ...result, url: URL.createObjectURL(result.blob) };
    render();
  }

  function retake() {
    URL.revokeObjectURL(photos[index].url);
    photos[index] = null;
    render();
  }

  function renderSummary() {
    root.innerHTML = `
      <header class="top">
        <h1>${t('summary.title')}</h1>
        <p class="hint">${t('summary.hint', { total: STEPS.length })}</p>
        <p class="contact">${escapeHtml(profile.fullName)} · ${escapeHtml(profile.email)} · ${escapeHtml(profile.phone)} · ${t(`vehicle.${profile.vehicle}`)}</p>
      </header>
      <ul class="grid">
        ${STEPS.map((s, i) => `<li><img alt="${t(`steps.${s.id}.title`)}" src="${photos[i].url}" /><span>${t(`steps.${s.id}.title`)}</span></li>`).join('')}
      </ul>
      <footer class="actions">
        <button class="btn secondary" data-action="back">${t('wizard.back')}</button>
        <button class="btn primary" data-action="submit" disabled title="${t('summary.submitSoon')}">${t('summary.submit')}</button>
      </footer>`;
  }

  root.addEventListener('submit', (event) => {
    if (event.target.matches('form.intro')) submitIntro(event);
  });

  root.addEventListener('click', (event) => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (!action) return;
    if (action === 'open-camera') {
      announced.add(index);
      render();
    } else if (action === 'capture') capture();
    else if (action === 'retake') retake();
    else if (action === 'next') {
      index += 1;
      render();
    } else if (action === 'back') {
      index = Math.max(-1, index - 1);
      render();
    }
  });

  // Al cambiar de idioma se conserva lo escrito en el formulario.
  onLangChange(() => {
    if (index < 0) readIntroForm();
    render();
  });

  render();
}
