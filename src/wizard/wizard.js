import { STEPS } from './steps.js';
import { guideSvg } from './guides.js';
import { cameraSupported, startCamera, stopCamera, captureFrame, pickPhotoFile } from './camera.js';

export function createWizard(root) {
  const photos = new Array(STEPS.length).fill(null); // { blob, width, height, url }
  let index = 0;
  let stream = null;
  let mode = 'live'; // 'live' | 'preview'

  function render() {
    stopCamera(stream);
    stream = null;
    if (index >= STEPS.length) return renderSummary();

    const step = STEPS[index];
    const photo = photos[index];
    mode = photo ? 'preview' : 'live';

    root.innerHTML = `
      <header class="top">
        <div class="progress" role="progressbar" aria-valuemin="1" aria-valuemax="${STEPS.length}" aria-valuenow="${index + 1}">
          ${STEPS.map((_, i) => `<span class="dot ${i < index ? 'done' : ''} ${i === index ? 'current' : ''}"></span>`).join('')}
        </div>
        <p class="counter">Foto ${index + 1} de ${STEPS.length}</p>
        <h1>${step.title}</h1>
        <p class="hint">${step.hint}</p>
      </header>
      <div class="viewer">
        ${photo ? `<img class="photo" alt="Foto tomada: ${step.title}" src="${photo.url}" />` : '<video class="video" playsinline muted></video>'}
        ${photo ? '' : guideSvg(step.guide)}
        <p class="status" role="status" hidden></p>
      </div>
      <footer class="actions">
        ${
          photo
            ? `<button class="btn secondary" data-action="retake">Repetir</button>
               <button class="btn primary" data-action="next">${index === STEPS.length - 1 ? 'Finalizar' : 'Continuar'}</button>`
            : `<button class="btn secondary" data-action="back" ${index === 0 ? 'disabled' : ''}>Atrás</button>
               <button class="btn shutter" data-action="capture" aria-label="Tomar foto"></button>`
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
      showStatus('Tu navegador no permite usar la cámara aquí. Toca el botón para abrir la cámara del teléfono.');
      return;
    }
    shutter.disabled = true;
    try {
      stream = await startCamera(video);
      shutter.disabled = false;
    } catch {
      showStatus('No pudimos acceder a la cámara. Permite el acceso en tu navegador o toca el botón para usar la cámara del teléfono.');
      shutter.disabled = false;
    }
  }

  async function capture() {
    const video = root.querySelector('video');
    let result = null;
    if (stream && video?.videoWidth) {
      result = await captureFrame(video);
    } else {
      result = await pickPhotoFile();
    }
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
        <h1>Revisa tus fotos</h1>
        <p class="hint">Verifica que las ${STEPS.length} fotos se vean bien antes de enviarlas.</p>
      </header>
      <ul class="grid">
        ${STEPS.map((s, i) => `<li><img alt="${s.title}" src="${photos[i].url}" /><span>${s.title}</span></li>`).join('')}
      </ul>
      <footer class="actions">
        <button class="btn secondary" data-action="back">Atrás</button>
        <button class="btn primary" data-action="submit" disabled title="El envío se activa en la integración con BritoCRM">Enviar</button>
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

  render();
}
