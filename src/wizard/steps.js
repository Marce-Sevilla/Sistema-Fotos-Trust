// Las 6 posiciones requeridas, en el orden del flujo.
export const STEPS = [
  {
    id: 'frente',
    title: 'Frente del vehículo',
    hint: 'Colócate a unos 3 metros y encuadra todo el frente dentro de la silueta.',
    guide: 'front',
  },
  {
    id: 'trasera',
    title: 'Parte trasera',
    hint: 'Encuadra toda la parte trasera, incluyendo la placa.',
    guide: 'rear',
  },
  {
    id: 'lateral-izquierdo',
    title: 'Lateral izquierdo',
    hint: 'Ponte al lado izquierdo y encuadra el vehículo completo de lado.',
    guide: 'side',
  },
  {
    id: 'lateral-derecho',
    title: 'Lateral derecho',
    hint: 'Ponte al lado derecho y encuadra el vehículo completo de lado.',
    guide: 'side',
  },
  {
    id: 'vin',
    title: 'Número VIN',
    hint: 'Acércate al VIN (parabrisas o puerta) y centra los 17 caracteres en el recuadro.',
    guide: 'vin',
  },
  {
    id: 'odometro',
    title: 'Odómetro',
    hint: 'Con el vehículo encendido, encuadra el tablero para que el kilometraje se lea bien.',
    guide: 'odometer',
  },
];
