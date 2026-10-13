import { STEPS } from './steps.js';
import { guideSvg } from './guides.js';
import { cameraSupported, startCamera, stopCamera, captureFrame, pickPhotoFile } from './camera.js';
import { t, onLangChange } from '../i18n.js';

export function createWizard(root) {
  const photos = new Array(STEPS.length).fill(null); // { blob, width, height, url }
  let index = 0;
  let stream = null;

  function render() {
    stopCamera(stream);
    stream = null;
    if (index >= STEPS.length) return renderSummary();

    const step = STEPS[index];
    const photo = photos[index];
    const title = t(`steps.${step.id}.title`);

    root.innerHTML = `
      <header class="top">
        <div class="progress" role="progressbar" aria-valuemin="1" aria-valuemax="${STEPS.length}" aria-valuenow="${index + 1}">
          ${STEPS.map((_, i) => `<span class="dot ${i < index ? 'done' : ''} ${i === index ? 'current' : ''}"></span>`).join('')}
        </div>
        <p class="counter">${t('wizard.counter', { current: index + 1, total: STEPS.length })}</p>
        <h1>${title}</h1>
        <p class="hint">${t(`steps.${step.id}.hint`)}</p>
      </header>
      <div class="viewer">
        ${photo ? `<img class="photo" alt="${t('wizard.photoAlt', { title })}" src="${photo.url}" />` : '<video class="video" playsinline muted></video>'}
        ${photo ? '' : guideSvg(step.guide)}
        <p class="status" role="status" hidden></p>
      </div>
      <footer class="actions">
        ${
          photo
            ? `<button class="btn secondary" data-action="retake">${t('wizard.retake')}</button>
               <button class="btn primary" data-action="next">${index === STEPS.length - 1 ? t('wizard.finish') : t('wizard.next')}</button>`
            : `<button class="btn secondary" data-action="back" ${index === 0 ? 'disabled' : ''}>${t('wizard.back')}</button>
               <button class="btn shutter" data-action="capture" aria-label="${t('wizard.capture')}"></button>`
        }
      </footer>`;

    if (!photo) initCamera();
  }

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
      </header>
      <ul class="grid">
        ${STEPS.map((s, i) => `<li><img alt="${t(`steps.${s.id}.title`)}" src="${photos[i].url}" /><span>${t(`steps.${s.id}.title`)}</span></li>`).join('')}
      </ul>
      <footer class="actions">
        <button class="btn secondary" data-action="back">${t('wizard.back')}</button>
        <button class="btn primary" data-action="submit" disabled title="${t('summary.submitSoon')}">${t('summary.submit')}</button>
      </footer>`;
  }

  root.addEventListener('click', (event) => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (!action) return;
    if (action === 'capture') capture();
    else if (action === 'retake') retake();
    else if (action === 'next') {
      index += 1;
      render();
    } else if (action === 'back') {
      index = Math.max(0, index - 1);
      render();
    }
  });

  onLangChange(render);
  render();
}
