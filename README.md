# IKRAL Studio

Estudio de preproducción audiovisual: escenas, storyboard, guion sincronizado, videos generados (Higgsfield, Kling, Wan…) y reproducción continua de la película.

## Arrancar

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # versión para subir al servidor (carpeta dist/)
```

## Pruebas

```bash
npm test           # lógica (Vitest)
npm run test:e2e   # las 13 pruebas de aceptación en WebKit/Safari (Playwright)
BASE_URL=https://ikral.com/studio/ npm run test:e2e   # lo mismo, en la página publicada
```

Las pruebas usan videos e imágenes de `tests-e2e/fixtures/` (hechos con ffmpeg).

## Cómo está hecho

- React 19 + TypeScript estricto + Vite + Tailwind 4 + Lucide.
- Estado: Zustand (`src/stores/projectStore.ts`) = **única fuente de verdad**.
- Guion maestro, timeline, estados y duraciones se **derivan** con funciones puras (`src/features/script-sync/derive.ts`). No hay copias del guion.
- Reproducción: un solo `<video>` controlado por `src/features/playback/engine.ts` (tiempo global → escena + segundo interno).
- Persistencia: IndexedDB con Dexie (`src/database/db.ts`). Los archivos se guardan como ArrayBuffer (Safari falla a veces con Blob/File). Las URLs `blob:` solo se usan para mostrar.
- Respaldo: `.zip` con `project.json` + archivos reales (`src/features/projects/backup.ts`).
- Reordenar: dnd-kit (ratón y teclado). Insertar escena entre dos.
- Música: 2 pistas (MP3, M4A, WAV), clips que se mueven en el tiempo, volumen y silencio por pista; suenan sincronizadas en la vista previa.
- Cortar video (parte la escena en 2) y cortar música en el cabezal; orillas para estirar o encoger clips sin dañar el archivo.
- Exportar edición: .zip con media + FCP7 XML (Premiere, DaVinci) + FCPXML (Final Cut). Aún sin probar dentro de esos editores.
- Atajos configurables: A atrás, D adelante (otra vez = 2×, 4×, 8×), C tijera, V selección, W/S zoom, Espacio, flechas, Supr.
- Guion en columna alta: botón del libro (arriba) abre el guion completo de arriba a abajo para leerlo cómodo.
- Biblioteca de cámara (debajo de «Dirección de cámara»): 74 tomas con dibujo (plano, ángulo, movimiento, lente, composición, luz, tiempo, transición), velocidad del movimiento y preset de Higgsfield. Escribe «Cámara: …» en español en el guion y la frase en inglés con lo que la cámara NO debe hacer en el prompt. La IA también la puede llenar al importar.
- Estilo y personajes (arriba de las escenas): un estilo visual para todo el video y personajes con su descripción; entran solos al prompt de las escenas donde aparecen (continuidad).
- Lista de tomas: tabla con plano, ángulo, movimiento, lente, luz y estado; copiar, CSV o Markdown.
- Duración sugerida: según el diálogo (≈2.5 palabras por segundo), las acciones y el movimiento de cámara; botón «Usar».
- Prompt: pronunciación por palabra e interruptor «Números en letras».

## Limitaciones de esta versión

- Todo se guarda **en el navegador** de esa computadora. No hay nube. Usa «Exportar proyecto» para tener copia.
- No existe «Exportar video» (MP4 final). Para terminar, exporta la edición a Premiere, Final Cut o DaVinci.
- No se puede arrastrar un archivo de esta página directo a otra web (límite de los navegadores). Usa Descargar + Copiar prompt.
- shadcn/ui no se usó: los componentes son propios con Tailwind (menos peso).
- Las pruebas automáticas corren en WebKit. Chromium headless no trae el códec H.264.
- Videos muy grandes (cientos de MB) ocupan memoria al guardarse.

## Pruébalo

https://ikral.com/studio/ — funciona en el navegador, sin cuenta. Lo que hagas se queda guardado solo en tu computadora.

## Contribuir

¡Bienvenidas las ideas y mejoras! Abre un *issue* o un *pull request*. Antes de enviar cambios corre `npm test` y `npm run test:e2e`.

## Licencia

[AGPL-3.0-or-later](LICENSE) © 2026 David González.

Puedes usar, copiar, cambiar y compartir IKRAL Studio. Si lo modificas y lo ofreces a otros (también como servicio web), debes compartir tu código con la misma licencia.

## Guion con IA (ChatGPT, Claude…)

1. Panel izquierdo → **Copiar formato para IA**. Pega el texto en ChatGPT o Claude y escribe tu idea al final.
2. La IA responde con JSON en el formato `ikral-studio-script` versión 1 (ver `src/features/script-exchange/schema.ts`).
3. **Importar guion** → pega el JSON o sube el `.json` → **Validar y previsualizar**.
4. Elige **Crear proyecto nuevo** (recomendado) o **Agregar al proyecto actual** (las escenas van al final; no se borra ninguna imagen, video ni música).

Cada escena se crea con todos sus campos: acción, diálogos, cámara, sonido, instrucciones de generación, pronunciaciones, «Números en letras» y **campos extra**.

- **Pegar escena de IA** (📋 en cada escena y en el panel izquierdo): si te faltó una escena, pídele a la IA solo esa y pega el JSON; llena solo sus textos, sin tocar imágenes, videos ni música.
- **Campos extra**: en cualquier escena, «Campos extra → Agregar campo» (ej. Vestuario, Emoción). Aparecen en todas las escenas, en el guion completo y en el prompt; la IA también los llena.
- Validación estricta con Zod: si algo está mal, se dice en qué escena y campo, y **no se cambia nada**.
- El JSON solo lleva texto. No acepta rutas de archivos, IDs ni campos desconocidos; nunca se interpreta como HTML ni código. Límites: 1 MB, 500 escenas, 5000 caracteres por campo, 20 campos extra.
- Este formato **no** es el respaldo `.zip` del proyecto (ese lleva los archivos).
