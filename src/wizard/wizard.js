import { STEPS } from './steps.js';
import { guideSvg, vehicleIcon, VEHICLE_TYPES } from './guides.js';
import { validateProfile } from './profile.js';
import { cameraSupported, startCamera, stopCamera, captureFrame, pickPhotoFile } from './camera.js';
import { validatePhoto } from '../validation/index.js';
import { loadVehicleModel } from '../validation/vehicle.js';
import { loadOcr } from '../validation/ocr.js';
import { colorName, sameVehicleColor } from '../validation/color.js';
import { createSubmission, contactIdFromUrl } from '../api/submit.js';
import { t, getLang, onLangChange } from '../i18n.js';
import { isDebug } from '../debug.js';

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const VIN_LOCATIONS = ['windshield', 'door'];
const CLOSE_UP_STEPS = new Set(['vin', 'odometro']); // fotos de cerca: se pueden tomar con el teléfono en horizontal

export function createWizard(root) {
  const photos = new Array(STEPS.length).fill(null); // { blob, width, height, url, status, ... }
  const profile = { fullName: '', email: '', phone: '', vehicle: '' };
  const announced = new Set(); // pasos cuya tarjeta "esta es la foto que sigue" ya se vio
  const readFailures = {}; // intentos fallidos de lectura del VIN/odómetro, por paso
  const OCR_FAIL_REASONS = new Set(['validate.noVin', 'validate.noOdometer']);
  const MAX_READ_FAILURES = 2;
  let vinLocation = ''; // 'windshield' | 'door': dónde se va a fotografiar el VIN
  let index = -1; // -1 = pantalla inicial (datos y tipo de vehículo)
  let stream = null;
  const linkContactId = contactIdFromUrl(location.search); // contacto del CRM que viene en el enlace (?contact=ID)
  let submission = null; // envío al CRM en curso (conserva lo ya subido para reintentar)
  let sendView = null; // { status: 'sending' | 'error' | 'done', progress, error } mientras se envía

  // Teléfono en horizontal: las siluetas de VIN y odómetro se redibujan más anchas (ver guides.js).
  const orientation = window.matchMedia?.('(orientation: landscape)');
  const isLandscape = () => Boolean(orientation?.matches);

  // VIN con la pantalla en vertical: el texto no cambia, pero la silueta se dibuja de pie en la pantalla para que, con el
  // teléfono acostado (parte de arriba hacia la izquierda), la persona la vea horizontal. Con la pantalla en horizontal
  // se usa la silueta ancha de siempre.
  const vinTurned = () => STEPS[index]?.id === 'vin' && !isLandscape();
  const wideNow = () => isLandscape();

  // Al girar el teléfono se actualiza la silueta sin tocar la cámara. Si todavía se está en la tarjeta
  // "esta es la foto que sigue" (sin cámara abierta) se redibuja esa pantalla.
  function refreshGuideForOrientation() {
    if (sendView || index < 0 || index >= STEPS.length || photos[index]) return;
    if (!announced.has(index)) return render();
    const current = root.querySelector('.viewer > svg.guide');
    if (!current) return;
    const step = STEPS[index];
    const holder = document.createElement('div');
    holder.innerHTML = guideSvg(guideKindFor(step), profile.vehicle, 'guide', wideNow(), vinTurned());
    current.replaceWith(holder.firstElementChild);
  }
  orientation?.addEventListener?.('change', refreshGuideForOrientation);

  // El texto de ayuda del VIN depende de la ubicación elegida.
  const hintFor = (step) => (step.id === 'vin' && vinLocation ? t(`vin.${vinLocation}Hint`) : t(`steps.${step.id}.hint`));
  // Parabrisas y puerta usan la misma silueta del VIN (la de la placa). La de etiqueta de puerta ('vin-door' en guides.js) quedó sin uso a propósito.
  const guideKindFor = (step) => step.guide;

  function render() {
    stopCamera(stream);
    stream = null;
    if (sendView) return renderSendView();
    if (index < 0) return renderIntro();
    if (index >= STEPS.length) return renderSummary();

    const step = STEPS[index];
    const photo = photos[index];
    const title = t(`steps.${step.id}.title`);
    const isVin = step.id === 'vin';
    if (index >= 4) loadOcr().catch(() => {}); // precarga el OCR antes de llegar al odómetro
    // Antes de abrir la cámara, cada paso muestra al centro qué foto se va a tomar.
    const announcing = !photo && !announced.has(index);
    const needsLocation = isVin && !vinLocation;

    root.innerHTML = `
      <header class="top">
        <div class="progress" role="progressbar" aria-valuemin="1" aria-valuemax="${STEPS.length}" aria-valuenow="${index + 1}">
          ${STEPS.map((_, i) => `<span class="dot ${i < index ? 'done' : ''} ${i === index ? 'current' : ''}"></span>`).join('')}
        </div>
        <p class="counter">${t('wizard.counter', { current: index + 1, total: STEPS.length })}</p>
        ${
          announcing
            ? ''
            : `<h1>${title}</h1><p class="hint">${hintFor(step)}</p>
               ${isVin && !photo ? `<button class="vin-switch" type="button" data-action="switch-vin-location">${t(vinLocation === 'door' ? 'vin.switchToWindshield' : 'vin.switchToDoor')}</button>` : ''}`
        }
      </header>
      <div class="viewer">
        ${
          announcing
            ? `<div class="announce">
                 <p class="announce-label">${t('wizard.nextPhoto')}</p>
                 ${needsLocation ? '' : guideSvg(guideKindFor(step), profile.vehicle, 'announce-guide', wideNow())}
                 <h1>${title}</h1>
                 <p class="hint">${needsLocation ? t('vin.pickHint') : hintFor(step)}</p>
                 ${
                   needsLocation
                     ? vinLocationPicker() // VIN, 1.ª pantalla: solo se elige dónde está; al tocar una opción pasa a las indicaciones
                     : `${CLOSE_UP_STEPS.has(step.id) ? `<p class="rotate-tip">↻ ${t('wizard.rotateTip')}</p>` : ''}
                        <button class="btn primary" data-action="open-camera">${t('wizard.openCamera')}</button>`
                 }
               </div>`
            : `${photo ? `<img class="photo" alt="${t('wizard.photoAlt', { title })}" src="${photo.url}" />` : '<video class="video" playsinline muted></video>'}
               ${photo ? verdictHtml(photo) : guideSvg(guideKindFor(step), profile.vehicle, 'guide', wideNow(), vinTurned())}`
        }
      </div>
      <footer class="actions">
        ${
          photo
            ? photo.status === 'fail'
              ? `<button class="btn primary" data-action="retake">${t('wizard.retake')}</button>`
              : `<button class="btn secondary" data-action="retake">${t('wizard.retake')}</button>
                 <button class="btn primary" data-action="next" ${photo.status === 'checking' ? 'disabled' : ''}>${index === STEPS.length - 1 ? t('wizard.finish') : t('wizard.next')}</button>`
            : announcing
              ? `<button class="btn secondary" data-action="back">${t('wizard.back')}</button>`
              : `<button class="btn secondary" data-action="back">${t('wizard.back')}</button>
                 <button class="btn shutter" data-action="capture" aria-label="${t('wizard.capture')}"></button>`
        }
      </footer>`;

    if (!photo && !announcing) initCamera();
  }

  // Selector de dónde se fotografiará el VIN: en el parabrisas (placa a la vista) o en la puerta (etiqueta del marco).
  function vinLocationPicker() {
    return `
      <div class="vin-location" role="radiogroup" aria-label="${t('vin.locationTitle')}">
        <p class="vin-location-title">${t('vin.locationTitle')}</p>
        <div class="vin-location-options">
          ${VIN_LOCATIONS.map(
            (location) => `
            <button type="button" class="chip ${vinLocation === location ? 'selected' : ''}" role="radio" aria-checked="${vinLocation === location}"
              data-action="vin-location" data-value="${location}">${t(`vin.${location}`)}</button>`,
          ).join('')}
        </div>
      </div>`;
  }

  // ---- Pantalla inicial -------------------------------------------------------
  function renderIntro(errors = {}) {
    const field = (name, type, autocomplete, inputmode = '') => `
      <div class="field ${errors[name] ? 'invalid' : ''}">
        <label for="f-${name}">${t(`intro.${name === 'fullName' ? 'name' : name}`)}</label>
        <input id="f-${name}" name="${name}" type="${type}" autocomplete="${autocomplete}" ${inputmode ? `inputmode="${inputmode}"` : ''}
          placeholder="${escapeHtml(t(`intro.${name === 'fullName' ? 'name' : name}.placeholder`))}"
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
    const shutter = root.querySelector('[data-action="capture"]');
    if (!video || !shutter) return;
    hideCameraAlert();

    if (!cameraSupported()) return showCameraAlert('unsupported');
    shutter.disabled = true;
    try {
      stream = await startCamera(video);
    } catch {
      // Sin permiso (o rechazado): alerta al centro con un botón para activarlo, en vez de dejar el visor en negro.
      shutter.disabled = false;
      return showCameraAlert((await cameraPermission()) === 'denied' ? 'denied' : 'prompt');
    }
    shutter.disabled = false;
  }

  // Estado del permiso de cámara: 'granted' | 'prompt' | 'denied', o 'unknown' si el navegador no lo informa (Safari).
  async function cameraPermission() {
    try {
      return (await navigator.permissions.query({ name: 'camera' })).state;
    } catch {
      return 'unknown';
    }
  }

  let permissionWatch = null;
  function hideCameraAlert() {
    if (permissionWatch) permissionWatch.onchange = null;
    permissionWatch = null;
    root.querySelector('.cam-alert')?.remove();
  }

  // Alerta al centro del visor cuando la cámara no se pudo abrir. kind: 'prompt' (aún no decide), 'denied' (bloqueada
  // en el navegador) o 'unsupported' (el navegador no permite la cámara aquí, p. ej. sin HTTPS).
  function showCameraAlert(kind) {
    const viewer = root.querySelector('.viewer');
    if (!viewer) return;
    hideCameraAlert();
    const canRetry = kind !== 'unsupported';
    viewer.insertAdjacentHTML(
      'beforeend',
      `<div class="cam-alert" role="alertdialog" aria-labelledby="cam-alert-title">
         <svg class="cam-alert-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3l1.6-2.4h6.8L17 8h3v11H4z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><circle cx="12" cy="13.5" r="3.4" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>
         <h2 id="cam-alert-title">${t(`camera.${kind}.title`)}</h2>
         <p>${t(`camera.${kind}.text`)}</p>
         ${canRetry ? `<button class="btn primary" type="button" data-action="enable-camera">${t('camera.enable')}</button>` : ''}
         <button class="btn ${canRetry ? 'secondary' : 'primary'}" type="button" data-action="native-camera">${t('camera.useNative')}</button>
       </div>`,
    );
    // Si la persona habilita el permiso desde el navegador, la cámara arranca sola.
    navigator.permissions?.query({ name: 'camera' }).then((status) => {
      if (!root.querySelector('.cam-alert')) return;
      permissionWatch = status;
      status.onchange = () => status.state === 'granted' && initCamera();
    }, () => {});
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
    // El cliente solo pide una foto de buena calidad donde se lea el número. Si la foto ya pasó resolución,
    // nitidez y exposición pero el OCR no logra leerla tras dos intentos, se acepta para no atascar a la
    // persona (queda marcada como no verificada) y el equipo la revisa a simple vista.
    if (verdict.status === 'fail' && OCR_FAIL_REASONS.has(verdict.reason)) {
      readFailures[at] = (readFailures[at] ?? 0) + 1;
      if (readFailures[at] >= MAX_READ_FAILURES) Object.assign(verdict, { status: 'unverified', reason: 'validate.readFailedAccepted' });
    }
    // Las 4 fotos exteriores deben ser del mismo vehículo: se compara el color de la carrocería con el de
    // otra foto exterior ya aceptada (con tolerancia a sombras y luz; solo se rechazan diferencias claras).
    if (verdict.status === 'ok' && verdict.color) {
      const reference = photos.find((p, i) => i !== at && p?.color && p.status !== 'fail');
      if (reference && !sameVehicleColor(reference.color, verdict.color)) Object.assign(verdict, { status: 'fail', reason: 'validate.differentVehicle' });
    }
    Object.assign(photo, verdict, { vinLocation: STEPS[at].id === 'vin' ? vinLocation : undefined });
    if (photos[at] === photo && index === at) render();
  }

  // En modo de diagnóstico se muestran las medidas de la foto, para calibrar los umbrales (ver debug.js).
  function debugHtml(photo) {
    const m = photo.metrics;
    if (!isDebug() || !m) return '';
    const n = (v, d = 1) => Number(v).toFixed(d);
    const color = photo.color ? ` · color ${colorName(photo.color)} (L${n(photo.color.L, 0)} a${n(photo.color.a, 0)} b${n(photo.color.b, 0)})` : '';
    return `<small class="debug">bordes ${n(m.edgeRatio, 2)} · nitidez ${n(m.sharpness, 0)} · luz ${n(m.mean, 0)} · oscuro ${n(m.darkFraction * 100, 0)}% · quemado ${n(m.brightFraction * 100, 0)}% · ${m.width}×${m.height}${color}</small>`;
  }

  function verdictHtml(photo) {
    if (photo.status === 'checking') return `<p class="verdict checking" role="status">${t('validate.checking')}</p>`;
    if (photo.status === 'ok') return `<p class="verdict ok" role="status">✓ ${t('validate.ok')}${debugHtml(photo)}</p>`;
    if (photo.status === 'fail') return `<p class="verdict fail" role="alert">${t(photo.reason)}${debugHtml(photo)}</p>`;
    return photo.reason ? `<p class="verdict warn" role="status">${t(photo.reason)}${debugHtml(photo)}</p>` : '';
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
        <button class="btn primary" data-action="submit">${t('summary.submit')}</button>
      </footer>`;
  }

  // ---- Envío al CRM -------------------------------------------------------------
  function buildPayload() {
    return {
      profile: { fullName: profile.fullName, email: profile.email, phone: profile.phone, vehicle: profile.vehicle },
      contactId: linkContactId,
      vinLocation,
      lang: getLang(),
      photos: STEPS.map((step, i) => ({ step: step.id, blob: photos[i].blob, status: photos[i].status, value: photos[i].value, checksumOk: photos[i].checksumOk })),
    };
  }

  async function send() {
    submission ??= createSubmission(buildPayload());
    sendView = { status: 'sending', progress: { phase: 'contact' } };
    render();
    try {
      await submission.run((progress) => {
        sendView = { status: 'sending', progress };
        renderSendView();
      });
      sendView = { status: 'done' };
    } catch (error) {
      console.error(error);
      sendView = { status: 'error', error };
    }
    render();
  }

  function sendErrorMessage(error) {
    if (error?.code === 'network') return t('send.errorNetwork');
    if (error?.code === 'invalid_contact') return t('send.errorLink');
    return t('send.errorServer');
  }

  function renderSendView() {
    const { status, progress = {}, error } = sendView;

    const title = status === 'done' ? t('done.title') : status === 'error' ? t('send.errorTitle') : t('send.title');
    const hint = status === 'done' ? '' : status === 'error' ? sendErrorMessage(error) : t('send.hint');

    // La barra refleja los bytes subidos. Al llegar al 100 % el servidor todavía entrega todo al CRM.
    const percent = progress.phase === 'upload' && progress.total ? Math.min(100, Math.round((progress.loaded / progress.total) * 100)) : 0;
    const phase = progress.phase === 'upload' ? (percent >= 100 ? t('send.phaseFinish') : t('send.phaseUpload', { percent })) : t('send.phaseContact');

    root.innerHTML = `
      <header class="top">
        <h1>${title}</h1>
        ${hint ? `<p class="hint" role="${status === 'error' ? 'alert' : 'status'}">${hint}</p>` : ''}
      </header>
      <div class="send">
        ${
          status === 'done'
            ? `<div class="done-icon" aria-hidden="true">✓</div>
               <p class="done-text">${t('done.message')}</p>`
            : status === 'sending'
              ? `<div class="send-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}"><span style="width:${percent}%"></span></div>
                 <p class="send-note" role="status">${phase}</p>`
              : ''
        }
        ${status === 'error' && error?.stage ? `<p class="error-code">${escapeHtml(`${error.stage} · ${error.code}${error.status ? ` · HTTP ${error.status}` : ''}`)}</p>` : ''}
      </div>
      <footer class="actions">
        ${
          status === 'error'
            ? `<button class="btn secondary" data-action="cancel-send">${t('wizard.back')}</button>
               <button class="btn primary" data-action="retry-send">${t('send.retry')}</button>`
            : ''
        }
      </footer>`;
  }

  root.addEventListener('submit', (event) => {
    if (event.target.matches('form.intro')) submitIntro(event);
  });

  root.addEventListener('click', (event) => {
    const target = event.target.closest('[data-action]');
    const action = target?.dataset.action;
    if (!action) return;
    if (action === 'open-camera') {
      announced.add(index);
      render();
    } else if (action === 'vin-location') {
      vinLocation = target.dataset.value;
      render();
    } else if (action === 'switch-vin-location') {
      vinLocation = vinLocation === 'door' ? 'windshield' : 'door'; // cambia de Parabrisas a Puerta (o al revés) sin salir de la cámara
      render();
    } else if (action === 'submit' || action === 'retry-send') send();
    else if (action === 'cancel-send') {
      sendView = null; // vuelve al resumen; lo ya subido se conserva para el próximo intento
      render();
    } else if (action === 'enable-camera') initCamera();
    else if (action === 'native-camera') capture(); // sin cámara en vivo, la captura abre la cámara del teléfono
    else if (action === 'capture') capture();
    else if (action === 'retake') retake();
    else if (action === 'next') {
      index += 1;
      render();
    } else if (action === 'back') {
      if (STEPS[index]?.id === 'vin' && vinLocation && !photos[index] && !announced.has(index)) {
        vinLocation = ''; // en las indicaciones del VIN, «Atrás» vuelve a elegir Parabrisas o Puerta
        render();
        return;
      }
      index = Math.max(-1, index - 1);
      render();
    }
  });

  // Al cambiar de idioma se conserva lo escrito en el formulario.
  onLangChange(() => {
    if (index < 0) readIntroForm();
    render();
  });

  // Solo en desarrollo (`npm run dev`): ?step=vin salta a un paso sin llenar el formulario ni tomar las fotos anteriores.
  // Opcionales: &vehicle=suv y &location=windshield|door (esta última abre directo la cámara del VIN). No existe en producción.
  if (import.meta.env.DEV) {
    const params = new URLSearchParams(location.search);
    const wanted = params.get('step');
    const at = STEPS.findIndex((step, i) => step.id === wanted || String(i + 1) === wanted);
    if (at >= 0) {
      Object.assign(profile, { fullName: 'Prueba Desarrollo', email: 'prueba@example.com', phone: '3055550123', vehicle: VEHICLE_TYPES.includes(params.get('vehicle')) ? params.get('vehicle') : 'sedan' });
      if (VIN_LOCATIONS.includes(params.get('location'))) {
        vinLocation = params.get('location');
        announced.add(at);
      }
      index = at;
    }
  }

  render();
}
