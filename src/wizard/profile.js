import { VEHICLE_TYPES } from './guides.js';

// Valida los datos de contacto y el tipo de vehículo. Devuelve { campo: claveDeError } (vacío si todo es válido).
export function validateProfile({ fullName, email, phone, vehicle }) {
  const errors = {};

  if (!/^\S{2,}(\s+\S{2,})+$/.test(fullName.trim())) errors.fullName = 'error.name';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) errors.email = 'error.email';

  const digits = phone.replace(/\D/g, '');
  if (!/^[+\d\s().-]+$/.test(phone.trim()) || digits.length < 7 || digits.length > 15) errors.phone = 'error.phone';

  if (!VEHICLE_TYPES.includes(vehicle)) errors.vehicle = 'error.vehicle';

  return errors;
}
