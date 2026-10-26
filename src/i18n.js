// Internacionalización mínima: español / inglés con persistencia en localStorage.
const STORAGE_KEY = 'tru-lang';
const SUPPORTED = ['es', 'en'];

const MESSAGES = {
  es: {
    'app.title': 'Fotos del vehículo | Trust Insurance Services',
    'brand.name': 'Trust Insurance Services',
    'lang.switch': 'Cambiar idioma',
    'intro.title': 'Fotos de tu vehículo',
    'intro.subtitle': 'Cuéntanos sobre ti y tu vehículo para comenzar. Te guiaremos para tomar las 6 fotos.',
    'intro.name': 'Nombre completo',
    'intro.email': 'Correo electrónico',
    'intro.phone': 'Teléfono',
    'intro.vehicle': 'Tipo de vehículo',
    'intro.start': 'Comenzar',
    'error.name': 'Escribe tu nombre completo (nombre y apellido).',
    'error.email': 'Escribe un correo electrónico válido.',
    'error.phone': 'Escribe un teléfono válido (mínimo 7 dígitos).',
    'error.vehicle': 'Selecciona el tipo de vehículo.',
    'vehicle.sedan': 'Sedán',
    'vehicle.suv': 'SUV',
    'vehicle.pickup': 'Pickup',
    'vehicle.hatchback': 'Hatchback',
    'vehicle.minivan': 'Minivan',
    'wizard.counter': 'Foto {current} de {total}',
    'wizard.nextPhoto': 'Ahora vas a tomar',
    'wizard.openCamera': 'Abrir cámara',
    'wizard.back': 'Atrás',
    'wizard.retake': 'Repetir',
    'wizard.next': 'Continuar',
    'wizard.finish': 'Finalizar',
    'wizard.capture': 'Tomar foto',
    'wizard.photoAlt': 'Foto tomada: {title}',
    'validate.checking': 'Validando la foto…',
    'validate.ok': '¡Foto válida!',
    'validate.noVehicle': 'No detectamos un vehículo en la foto. Encuadra el vehículo completo dentro de la silueta.',
    'validate.cutOff': 'El vehículo se sale del encuadre. Aléjate un poco para que se vea completo.',
    'validate.tooFar': 'El vehículo se ve muy pequeño. Acércate un poco.',
    'validate.wrongAngleSide': 'Esta foto debe ser exactamente de lado, a la altura del vehículo y no en diagonal.',
    'validate.wrongAngleFace': 'Esta foto debe ser de frente (o de atrás), alineada con el vehículo y no en diagonal.',
    'validate.offCenter': 'Centra el vehículo en la foto.',
    'validate.engineError': 'No pudimos validar la foto automáticamente. Revisa que se vea bien y continúa.',
    'validate.lowResolution': 'La foto tiene muy poca resolución. Vuelve a tomarla con la cámara del teléfono y buena luz.',
    'validate.blurry': 'La foto está borrosa. Mantén el teléfono quieto, enfoca bien y vuelve a intentarlo.',
    'validate.tooDark': 'La foto está muy oscura. Busca más luz y vuelve a intentarlo.',
    'validate.tooBright': 'La foto tiene demasiada luz. Evita el sol directo y los reflejos, y vuelve a intentarlo.',
    'validate.noVin': 'No pudimos leer el VIN. Acércate, enfoca los 17 caracteres y evita los reflejos.',
    'validate.noOdometer': 'No pudimos leer el kilometraje. Acércate al tablero, enciende el vehículo y evita los reflejos.',
    'validate.readFailedAccepted': 'No pudimos leer el número automáticamente, pero la foto tiene buena calidad. Si se lee bien a simple vista, continúa.',
    'wizard.rotateTip': 'Para esta foto puedes girar el teléfono en horizontal: es más cómodo.',
    'vin.locationTitle': '¿Dónde vas a tomar el VIN?',
    'vin.windshield': 'Parabrisas',
    'vin.door': 'Puerta',
    'vin.change': 'Cambiar',
    'vin.windshieldHint': 'Mira por el parabrisas, del lado del conductor: la placa del VIN está en la base del cristal, sobre el tablero. Acércate hasta que los 17 caracteres se vean grandes y sin reflejos.',
    'vin.doorHint': 'Abre la puerta del conductor: el VIN está en la etiqueta del marco de la puerta. Acércate hasta que los 17 caracteres se vean grandes y nítidos.',
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
    'steps.vin.hint': 'Elige dónde está el VIN de tu vehículo. Luego acércate hasta que los 17 caracteres se vean grandes, nítidos y sin reflejos.',
    'steps.odometro.title': 'Odómetro',
    'steps.odometro.hint': 'Con el vehículo encendido, acércate al kilometraje hasta que los dígitos se vean grandes y nítidos.',
  },
  en: {
    'app.title': 'Vehicle photos | Trust Insurance Services',
    'brand.name': 'Trust Insurance Services',
    'lang.switch': 'Change language',
    'intro.title': 'Photos of your vehicle',
    'intro.subtitle': "Tell us about you and your vehicle to get started. We'll guide you through the 6 photos.",
    'intro.name': 'Full name',
    'intro.email': 'Email',
    'intro.phone': 'Phone',
    'intro.vehicle': 'Vehicle type',
    'intro.start': 'Start',
    'error.name': 'Enter your full name (first and last name).',
    'error.email': 'Enter a valid email address.',
    'error.phone': 'Enter a valid phone number (at least 7 digits).',
    'error.vehicle': 'Select the vehicle type.',
    'vehicle.sedan': 'Sedan',
    'vehicle.suv': 'SUV',
    'vehicle.pickup': 'Pickup truck',
    'vehicle.hatchback': 'Hatchback',
    'vehicle.minivan': 'Minivan',
    'wizard.counter': 'Photo {current} of {total}',
    'wizard.nextPhoto': "You're about to take",
    'wizard.openCamera': 'Open camera',
    'wizard.back': 'Back',
    'wizard.retake': 'Retake',
    'wizard.next': 'Continue',
    'wizard.finish': 'Finish',
    'wizard.capture': 'Take photo',
    'wizard.photoAlt': 'Photo taken: {title}',
    'validate.checking': 'Checking the photo…',
    'validate.ok': 'Photo looks good!',
    'validate.noVehicle': "We couldn't detect a vehicle in the photo. Fit the whole vehicle inside the outline.",
    'validate.cutOff': 'The vehicle is cut off. Step back a little so it fits in the frame.',
    'validate.tooFar': 'The vehicle looks too small. Move a little closer.',
    'validate.wrongAngleSide': 'This photo must be taken straight from the side, level with the vehicle, not at an angle.',
    'validate.wrongAngleFace': 'This photo must be taken straight from the front (or rear), lined up with the vehicle, not at an angle.',
    'validate.offCenter': 'Center the vehicle in the photo.',
    'validate.engineError': "We couldn't check the photo automatically. Make sure it looks good and continue.",
    'validate.lowResolution': 'The photo resolution is too low. Retake it with your phone camera in good light.',
    'validate.blurry': 'The photo is blurry. Hold the phone steady, focus, and try again.',
    'validate.tooDark': 'The photo is too dark. Find more light and try again.',
    'validate.tooBright': 'The photo has too much light. Avoid direct sun and glare, and try again.',
    'validate.noVin': "We couldn't read the VIN. Get closer, focus on all 17 characters and avoid glare.",
    'validate.noOdometer': "We couldn't read the mileage. Get closer to the dashboard, turn the vehicle on and avoid glare.",
    'validate.readFailedAccepted': "We couldn't read the number automatically, but the photo quality is good. If it's readable by eye, continue.",
    'wizard.rotateTip': 'For this photo you can turn your phone sideways: it is more comfortable.',
    'vin.locationTitle': 'Where will you photograph the VIN?',
    'vin.windshield': 'Windshield',
    'vin.door': 'Door',
    'vin.change': 'Change',
    'vin.windshieldHint': 'Look through the windshield on the driver side: the VIN plate is at the base of the glass, above the dashboard. Get close until all 17 characters look large and free of glare.',
    'vin.doorHint': "Open the driver's door: the VIN is on the label on the door jamb. Get close until all 17 characters look large and sharp.",
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
    'steps.vin.hint': "Choose where your vehicle's VIN is. Then get close until all 17 characters look large, sharp and free of glare.",
    'steps.odometro.title': 'Odometer',
    'steps.odometro.hint': 'With the vehicle on, get close to the mileage until the digits look large and sharp.',
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
