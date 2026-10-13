# Sistema de Fotos de Vehículos — Trust Insurance Services

Captura guiada y validación automática de fotos de vehículos para emisión de pólizas.
Proyecto de BritoCRM / Brito Marketing (Fase 1, entrega 26 oct 2026).

## Stack
- Vite + JavaScript vanilla (todo corre en el navegador)
- Validación: OpenCV.js, TensorFlow.js (COCO-SSD), Tesseract.js
- Hosting: Cloudflare Pages + Functions (proxy hacia la API de BritoCRM / GoHighLevel)

## Desarrollo
```bash
npm install
npm run dev
```

## Estructura
- `src/wizard/` — flujo de 6 pasos y cámara
- `src/validation/` — validadores independientes
- `src/api/` — cliente hacia la función proxy
- `functions/api/` — Cloudflare Pages Functions (el token de GHL vive solo aquí)

El token de GHL nunca va en el código del navegador: se guarda como secreto en Cloudflare.
