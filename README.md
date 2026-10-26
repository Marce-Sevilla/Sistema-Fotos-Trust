# Sistema de Fotos de Vehículos — Trust Insurance Services

Captura guiada y validación automática de fotos de vehículos para emisión de pólizas.
Proyecto de BritoCRM / Brito Marketing (Fase 1, entrega 26 oct 2026).

## Qué hace
1. La persona abre un enlace (o QR), deja nombre, correo, teléfono y elige su tipo de vehículo.
2. Toma 6 fotos guiadas (frente, trasera, lateral izquierdo/derecho, VIN y odómetro). Cada una se valida **en el navegador**: resolución, nitidez, exposición, que sea un vehículo en la posición correcta, que todas sean del mismo color, y que el VIN/kilometraje se puedan leer.
3. Las fotos y los datos se entregan **automáticamente a BritoCRM** (GoHighLevel).

## Stack
- Vite + JavaScript vanilla (todo el wizard corre en el navegador)
- Validación: TensorFlow.js (COCO-SSD) y Tesseract.js; nitidez, exposición y color con JavaScript nativo
- Hosting: Cloudflare Workers con assets (`wrangler.jsonc`): sirve el sitio y atiende `/api/*`
- Servidor (`worker/`): único lugar que conoce el token del CRM

## Estructura
- `src/wizard/` — flujo, cámara, siluetas guía
- `src/validation/` — validadores independientes (cada uno devuelve ok / fail / unverified)
- `src/api/submit.js` — envío al servidor, con reintentos que retoman donde quedó
- `worker/` — API: `api.js` (rutas), `ghl.js` (cliente del CRM), `index.js` (entrada)
- `dev/mock-ghl.js` — CRM simulado para probar sin credenciales
- `scripts/check-ghl.mjs` — verifica la conexión con el CRM real
- `tests/` — pruebas automáticas (`npm test`)

## Desarrollo
```bash
npm install
npm run dev      # sitio + /api/* con un CRM simulado (no necesita credenciales)
npm test         # pruebas automáticas
```
Modo de diagnóstico: abrir el sitio con `?debug=1` (o tocar 5 veces el logo) muestra bajo cada foto las medidas de calidad y la versión publicada.

## Conexión con BritoCRM (GoHighLevel)

### Qué se guarda en el CRM
Por cada persona que termina el wizard:
- **Contacto:** el del enlace (`?contact=ID`) o, si no hay, se crea/actualiza por correo y teléfono.
- **Fotos:** las 6 en la **biblioteca de medios** del CRM.
- **Nota en el contacto** con los 6 enlaces, tipo de vehículo, ubicación del VIN, qué fotos quedaron sin verificar y las lecturas del OCR (solo de referencia).
- **Etiqueta** `fotos-vehiculo`, útil para disparar automatizaciones (por ejemplo la Fase 2).
- *(Opcional)* las fotos también en campos personalizados de tipo archivo del contacto.

### Enlace con el contacto
Si Trust envía el enlace desde un workflow del CRM, puede incluir el ID del contacto:
`https://TU-SITIO.workers.dev/?contact={{contact.id}}`
Así las fotos quedan en ese contacto sin crear uno nuevo. Sin el parámetro, se usa el correo/teléfono que escribe la persona.

### Configuración (una sola vez)
1. **Crear el token.** En la subcuenta de Trust: *Ajustes → Integraciones privadas → Crear*. Permisos (scopes): `contacts.readonly`, `contacts.write`, `medias.write`. Copia el token (solo se muestra una vez).
2. **Ubicación.** El `Location ID` es el ID de la subcuenta (aparece en la URL del CRM: `.../location/<ID>/...`).
3. **Probar la conexión** en tu computador: copia `.env.example` a `.dev.vars`, completa `GHL_TOKEN` y `GHL_LOCATION_ID`, y ejecuta:
   ```bash
   npm run check:ghl
   ```
   Crea un contacto de prueba, sube una foto, escribe la nota, pone la etiqueta y borra el contacto. Cada paso dice si funcionó y, si no, la causa probable.
4. **Producción.** En Cloudflare → *Workers & Pages → sistema-de-fotos-tru → Settings → Variables and Secrets*, crea como **Secret**: `GHL_TOKEN` y `GHL_LOCATION_ID`. Los secretos se conservan en cada despliegue. Opcionales (mismos nombres que en `.env.example`): `GHL_API_VERSION`, `GHL_MEDIA_FOLDER_ID`, `GHL_TAGS`, `GHL_PHOTO_FIELD_IDS`.
5. Despliega (cada `push` a `main` lo hace) y haz una prueba real con tu teléfono.

### Probar el sitio y el servidor juntos con el CRM real
```bash
npm run cf:dev   # construye el sitio y levanta el Worker local con los valores de .dev.vars
```

### Seguridad
- El token **nunca** llega al navegador: solo vive en el Worker.
- El servidor valida todo lo que recibe (datos, que cada foto sea JPEG y de tamaño razonable, que los enlaces de la nota sean del almacenamiento del CRM) y solo acepta peticiones del propio sitio.
- Si el CRM falla, al navegador solo llega qué paso falló; el detalle queda en los registros del Worker.
- Límite práctico: cualquiera con el enlace puede enviar fotos. Si hace falta más control, se puede agregar un código firmado al enlace.

## Despliegue
Cloudflare está conectado a este repositorio: cada `push` a `main` ejecuta `npm run build` y `npx wrangler deploy`.
