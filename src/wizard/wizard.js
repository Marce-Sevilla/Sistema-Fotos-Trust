import { STEPS } from './steps.js';
import { guideSvg, vehicleIcon, VEHICLE_TYPES } from './guides.js';
import { validateProfile } from './profile.js';
import { cameraSupported, startCamera, stopCamera, captureFrame, pickPhotoFile } from './camera.js';
import { validatePhoto } from '../validation/index.js';
import { loadVehicleModel } from '../validation/vehicle.js';
import { loadOcr } from '../validation/ocr.js';
import { ODOMETER_PATTERN, VIN_PATTERN, vinChecksumValid } from '../validation/ocr-rules.js';
import { t, onLangChange } from '../i18n.js';

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function createWizard(root) {
  const photos = new Array(STEPS.length).fill(null); // { blob, width, height, url }
  const profile = { fullName: '', email: '', phone: '', vehicle: '' };
  const announced = new Set(); // pasos cuya tarjeta "esta es la foto que sigue" ya se vio
  const ocrFailures = {}; // intentos fallidos de lectura (OCR) por paso
  const OCR_FAIL_REASONS = new Set(['validate.noVin', 'validate.noOdometer']);
  const MAX_OCR_FAILURES = 2;
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
    if (index >= 3) loadOcr().catch(() => {}); // precarga el OCR antes de llegar al VIN y al odómetro
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
               ${photo ? verdictHtml(photo) : guideSvg(step.guide, profile.vehicle)}
               <p class="status" role="status" hidden></p>`
        }
      </div>
      ${photo ? confirmHtml(step, photo) : ''}
      <footer class="actions">
        ${
          photo
            ? photo.status === 'fail'
              ? `<button class="btn primary" data-action="retake">${t('wizard.retake')}</button>`
              : `<button class="btn secondary" data-action="retake">${t('wizard.retake')}</button>
                 <button class="btn primary" data-action="next" ${photo.status === 'checking' || valueCheck(step, photo).blocking ? 'disabled' : ''}>${index === STEPS.length - 1 ? t('wizard.finish') : t('wizard.next')}</button>`
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
    loadVehicleModel().catch(() => {}); // precarga el detector mientras el usuario lee las instrucciones
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

    const photo = { ...result, url: URL.createObjectURL(result.blob), status: 'checking' };
    const at = index;
    photos[at] = photo;
    render();

    // Solo se puede continuar si la foto pasa la validación (o si no pudo validarse).
    const verdict = await validatePhoto(STEPS[at].id, result.blob);
    // Si el OCR no logra leer el VIN/kilometraje tras dos intentos, se permite escribirlo a mano
    // (la foto igual tuvo que pasar resolución, nitidez y exposición).
    if (verdict.status === 'fail' && OCR_FAIL_REASONS.has(verdict.reason)) {
      ocrFailures[at] = (ocrFailures[at] ?? 0) + 1;
      if (ocrFailures[at] >= MAX_OCR_FAILURES) Object.assign(verdict, { status: 'unverified', reason: 'validate.manualEntry' });
    }
    Object.assign(photo, verdict);
    if (photos[at] === photo && index === at) render();
  }

  // ---- Confirmación del VIN y del kilometraje leídos ---------------------------------
  // El OCR puede equivocarse en un carácter, así que la persona confirma o corrige lo leído.
  const READ_STEPS = new Set(['vin', 'odometro']);

  // blocking: impide continuar; warning: solo avisa (p. ej. un VIN que no pasa el dígito verificador).
  function valueCheck(step, photo) {
    if (!READ_STEPS.has(step.id) || photo.status === 'fail' || photo.status === 'checking') return { blocking: null, warning: null };
    const value = photo.value ?? '';
    if (step.id === 'vin') {
      if (!VIN_PATTERN.test(value)) return { blocking: 'confirm.vinInvalid', warning: null };
      return { blocking: null, warning: vinChecksumValid(value) ? null : 'confirm.vinChecksum' };
    }
    return { blocking: ODOMETER_PATTERN.test(value) ? null : 'confirm.odometerInvalid', warning: null };
  }

  function confirmHtml(step, photo) {
    if (!READ_STEPS.has(step.id) || photo.status === 'fail' || photo.status === 'checking') return '';
    const isVin = step.id === 'vin';
    const { blocking, warning } = valueCheck(step, photo);
    const message = blocking ?? warning;
    return `
      <div class="confirm">
        <label for="confirm-value">${t(isVin ? 'confirm.vin' : 'confirm.odometer')}</label>
        <input id="confirm-value" data-confirm type="text" value="${escapeHtml(photo.value ?? '')}" autocomplete="off" autocorrect="off" spellcheck="false"
          ${isVin ? 'maxlength="17" autocapitalize="characters"' : 'maxlength="7" inputmode="numeric"'} />
        <p class="error confirm-message" role="alert" ${message ? '' : 'hidden'}>${message ? t(message) : ''}</p>
      </div>`;
  }

  function onConfirmInput(input) {
    const photo = photos[index];
    const step = STEPS[index];
    // Normaliza lo que se escribe: el VIN va en mayúsculas y el kilometraje solo lleva números.
    photo.value = step.id === 'vin' ? input.value.toUpperCase().replace(/[^A-Z0-9]/g, '') : input.value.replace(/\D/g, '');
    input.value = photo.value;
    const { blocking, warning } = valueCheck(step, photo);
    const message = blocking ?? warning;
    const note = root.querySelector('.confirm-message');
    note.textContent = message ? t(message) : '';
    note.hidden = !message;
    root.querySelector('[data-action="next"]').disabled = Boolean(blocking);
  }

  // Con `?debug=1` se muestran las medidas de la foto, para calibrar los umbrales con fotos reales.
  const DEBUG = new URLSearchParams(location.search).has('debug');

  function debugHtml(photo) {
    const m = photo.metrics;
    if (!DEBUG || !m) return '';
    const n = (v, d = 1) => Number(v).toFixed(d);
    return `<small class="debug">bordes ${n(m.edgeRatio, 2)} · nitidez ${n(m.sharpness, 0)} · luz ${n(m.mean, 0)} · oscuro ${n(m.darkFraction * 100, 0)}% · quemado ${n(m.brightFraction * 100, 0)}% · ${m.width}×${m.height}</small>`;
  }

  function verdictHtml(photo) {
    if (photo.status === 'checking') return `<p class="verdict checking" role="status">${t('validate.checking')}</p>`;
    if (photo.status === 'ok') return `<p class="verdict ok" role="status">✓ ${escapeHtml(t(photo.reason ?? 'validate.ok', photo.params))}${debugHtml(photo)}</p>`;
    if (photo.status === 'fail') return `<p class="verdict fail" role="alert">${t(photo.reason)}${debugHtml(photo)}</p>`;
    return photo.reason ? `<p class="verdict warn" role="status">${escapeHtml(t(photo.reason, photo.params))}${debugHtml(photo)}</p>` : '';
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
        <p class="contact">VIN ${escapeHtml(photos[STEPS.findIndex((s) => s.id === 'vin')]?.value ?? '')} · ${escapeHtml(photos[STEPS.findIndex((s) => s.id === 'odometro')]?.value ?? '')}</p>
      </header>
      <ul class="grid">
        ${STEPS.map((s, i) => `<li><img alt="${t(`steps.${s.id}.title`)}" src="${photos[i].url}" /><span>${t(`steps.${s.id}.title`)}</span></li>`).join('')}
      </ul>
      <footer class="actions">
        <button class="btn secondary" data-action="back">${t('wizard.back')}</button>
        <button class="btn primary" data-action="submit" disabled title="${t('summary.submitSoon')}">${t('summary.submit')}</button>
      </footer>`;
  }

  root.addEventListener('input', (event) => {
    if (event.target.matches('[data-confirm]')) onConfirmInput(event.target);
  });

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
