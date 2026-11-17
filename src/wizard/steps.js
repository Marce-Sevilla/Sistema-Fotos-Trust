// Las 6 posiciones requeridas, en el orden del flujo: una vuelta al vehículo en sentido horario
// (frente → lado derecho → trasera → lado izquierdo) y luego VIN y odómetro.
// Los textos (título y ayuda) viven en src/i18n.js bajo las claves `steps.<id>.title|hint`.
export const STEPS = [
  { id: 'frente', guide: 'front' },
  { id: 'lateral-derecho', guide: 'side-right' },
  { id: 'trasera', guide: 'rear' },
  { id: 'lateral-izquierdo', guide: 'side-left' },
  { id: 'vin', guide: 'vin' },
  { id: 'odometro', guide: 'odometer' },
];
