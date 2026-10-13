// Internacionalización mínima: español / inglés con persistencia en localStorage.
const STORAGE_KEY = 'tru-lang';
const SUPPORTED = ['es', 'en'];

const MESSAGES = {
  es: {
    'app.title': 'Fotos del vehículo | Trust Insurance Services',
    'brand.name': 'Trust Insurance Services',
    'lang.switch': 'Cambiar idioma',
    'wizard.counter': 'Foto {current} de {total}',
    'wizard.back': 'Atrás',
    'wizard.retake': 'Repetir',
    'wizard.next': 'Continuar',
    'wizard.finish': 'Finalizar',
    'wizard.capture': 'Tomar foto',
    'wizard.photoAlt': 'Foto tomada: {title}',
    'wizard.noCamera': 'Tu navegador no permite usar la cámara aquí. Toca el botón para abrir la cámara del teléfono.',
    'wizard.cameraDenied': 'No pudimos acceder a la cámara. Permite el acceso en tu navegador o toca el botón para usar la cámara del teléfono.',
    'summary.title': 'Revisa tus fotos',
    'summary.hint': 'Verifica que las {total} fotos se vean bien antes de enviarlas.',
    'summary.submit': 'Enviar',
    'summary.submitSoon': 'El envío se activa en la integración con BritoCRM',
    'steps.frente.title': 'Frente del vehículo',
    'steps.frente.hint': 'Colócate a unos 3 metros y encuadra todo el frente dentro de la silueta.',
    'steps.trasera.title': 'Parte trasera',
    'steps.trasera.hint': 'Encuadra toda la parte trasera, incluyendo la placa.',
    'steps.lateral-izquierdo.title': 'Lateral izquierdo',
    'steps.lateral-izquierdo.hint': 'Ponte al lado izquierdo y encuadra el vehículo completo de lado.',
    'steps.lateral-derecho.title': 'Lateral derecho',
    'steps.lateral-derecho.hint': 'Ponte al lado derecho y encuadra el vehículo completo de lado.',
    'steps.vin.title': 'Número VIN',
    'steps.vin.hint': 'Acércate al VIN (parabrisas o puerta) y centra los 17 caracteres en el recuadro.',
    'steps.odometro.title': 'Odómetro',
    'steps.odometro.hint': 'Con el vehículo encendido, encuadra el tablero para que el kilometraje se lea bien.',
  },
  en: {
    'app.title': 'Vehicle photos | Trust Insurance Services',
    'brand.name': 'Trust Insurance Services',
    'lang.switch': 'Change language',
    'wizard.counter': 'Photo {current} of {total}',
    'wizard.back': 'Back',
    'wizard.retake': 'Retake',
    'wizard.next': 'Continue',
    'wizard.finish': 'Finish',
    'wizard.capture': 'Take photo',
    'wizard.photoAlt': 'Photo taken: {title}',
    'wizard.noCamera': "Your browser can't use the camera here. Tap the button to open your phone's camera.",
    'wizard.cameraDenied': "We couldn't access the camera. Allow access in your browser or tap the button to use your phone's camera.",
    'summary.title': 'Review your photos',
    'summary.hint': 'Make sure all {total} photos look good before sending them.',
    'summary.submit': 'Submit',
    'summary.submitSoon': 'Submission will be enabled with the BritoCRM integration',
    'steps.frente.title': 'Front of the vehicle',
    'steps.frente.hint': 'Stand about 10 feet away and fit the whole front inside the outline.',
    'steps.trasera.title': 'Rear of the vehicle',
    'steps.trasera.hint': 'Fit the whole rear inside the outline, including the license plate.',
    'steps.lateral-izquierdo.title': 'Left side',
    'steps.lateral-izquierdo.hint': 'Stand on the left side and fit the whole vehicle in the frame.',
    'steps.lateral-derecho.title': 'Right side',
    'steps.lateral-derecho.hint': 'Stand on the right side and fit the whole vehicle in the frame.',
    'steps.vin.title': 'VIN number',
    'steps.vin.hint': 'Get close to the VIN (windshield or door jamb) and center all 17 characters in the box.',
    'steps.odometro.title': 'Odometer',
    'steps.odometro.hint': 'With the vehicle on, frame the dashboard so the mileage is easy to read.',
  },
};

function detectLang() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (SUPPORTED.includes(saved)) return saved;
  } catch {
    // localStorage puede no estar disponible (modo privado); se ignora.
  }
  return navigator.language?.toLowerCase().startsWith('en') ? 'en' : 'es';
}

let current = detectLang();
const listeners = new Set();

export const getLang = () => current;

export function setLang(lang) {
  if (!SUPPORTED.includes(lang) || lang === current) return;
  current = lang;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // Sin persistencia: el idioma solo dura la sesión.
  }
  document.documentElement.lang = lang;
  document.title = t('app.title');
  listeners.forEach((fn) => fn(lang));
}

export function t(key, params = {}) {
  const text = MESSAGES[current][key] ?? MESSAGES.es[key] ?? key;
  return text.replace(/\{(\w+)\}/g, (_, name) => params[name] ?? '');
}

export function onLangChange(fn) {
  listeners.add(fn);
}

export function initI18n() {
  document.documentElement.lang = current;
  document.title = t('app.title');
}
