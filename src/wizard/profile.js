import { VEHICLE_TYPES } from './guides.js';

// Solo números de Estados Unidos (indicativo +1): 10 dígitos, con o sin «1» o «+1» delante.
export function isUsPhone(phone) {
  const text = phone.trim();
  if (!/^[+\d\s().-]+$/.test(text)) return false;
  const digits = text.replace(/\D/g, '');
  if (text.includes('+') && !/^\+\s*1(?!\d*\+)/.test(text)) return false; // el + solo al inicio y seguido de 1
  return digits.length === 10 || (digits.length === 11 && digits.startsWith('1'));
}

// Valida los datos de contacto y el tipo de vehículo. Devuelve { campo: claveDeError } (vacío si todo es válido).
export function validateProfile({ fullName, email, phone, vehicle }) {
  const errors = {};

  if (!/^\S{2,}(\s+\S{2,})+$/.test(fullName.trim())) errors.fullName = 'error.name';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) errors.email = 'error.email';

  if (!isUsPhone(phone)) errors.phone = 'error.phone';

  if (!VEHICLE_TYPES.includes(vehicle)) errors.vehicle = 'error.vehicle';

  return errors;
}
