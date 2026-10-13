// Acceso a la cámara (getUserMedia) y captura de fotogramas con canvas.

export function cameraSupported() {
  return Boolean(navigator.mediaDevices?.getUserMedia);
}

export async function startCamera(video) {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: { ideal: 'environment' },
      width: { ideal: 1920 },
      height: { ideal: 1080 },
    },
    audio: false,
  });
  video.srcObject = stream;
  await video.play();
  return stream;
}

export function stopCamera(stream) {
  stream?.getTracks().forEach((track) => track.stop());
}

// Captura el fotograma actual a su resolución nativa y lo devuelve como Blob JPEG.
export function captureFrame(video, quality = 0.92) {
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve({ blob, width: canvas.width, height: canvas.height }) : reject(new Error('No se pudo capturar la foto'))),
      'image/jpeg',
      quality,
    );
  });
}

// Respaldo cuando no hay getUserMedia o el permiso fue denegado: abre la cámara nativa del teléfono.
export function pickPhotoFile() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      const bitmap = await createImageBitmap(file);
      resolve({ blob: file, width: bitmap.width, height: bitmap.height });
    };
    input.click();
  });
}
