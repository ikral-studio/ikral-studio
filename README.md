# IKRAL Studio

Estudio de preproducción audiovisual: escenas, storyboard, guion sincronizado, videos generados (Higgsfield, Kling, Wan…) y reproducción continua de la película.

## Arrancar

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # versión para subir al servidor (carpeta dist/)
```

## App de escritorio (Mac)

Guarda todo en carpetas de tu Mac (`Documentos/IKRAL Studio`), sin límite de espacio. Ver [docs/carpeta-del-proyecto.md](docs/carpeta-del-proyecto.md).

```bash
# Requiere Rust (https://rustup.rs)
npm run app:dev     # abrir en modo desarrollo
npm run app:build   # crear IKRAL Studio.app y .dmg en src-tauri/target/release/bundle/
```

Hecha con [Tauri](https://tauri.app). La versión web sigue funcionando igual (guarda en el navegador).

## Pruebas

```bash
npm test           # lógica (Vitest)
npm run test:e2e   # las 26 pruebas de aceptación en WebKit/Safari (Playwright)
BASE_URL=https://ikral.com/studio/ npm run test:e2e   # lo mismo, en la página publicada
```

Los videos y la música de prueba no se guardan en el repositorio: `tests-e2e/global-setup.ts` los crea al momento con ffmpeg (cuadros de color y un pitido). Necesitas [ffmpeg](https://ffmpeg.org) instalado.

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
- Respaldos automáticos cada 15 min (últimos 30) en «Abrir proyecto», con «Restaurar» y «Respaldar ahora».
- Una sola ventana edita: si abres IKRAL Studio en otra ventana, la anterior se pone en pausa (sin perder nada) y puedes retomarla con «Usar esta ventana».
- Varios videos seguidos en una escena: «+ Otro video» en «Video generado» (se reproducen uno tras otro, se ordenan y se exportan como clips seguidos).
- Recortar imagen al formato del proyecto (16:9 o 9:16) desde «Ampliar», con cuadrícula de tercios; guarda una imagen nueva.
- Prompt: pronunciación por palabra e interruptor «Números en letras».
- Subir desde la tarjeta cerrada (arrastrar o clic) y ver varios videos de una escena lado a lado.
- Arrastrar imágenes del proyecto entre fotogramas, imagen inicial e imagen final.
- Diálogos con caritas: cada línea con su personaje, 3 emociones (inicio → mitad → final, 20 caritas) y segundos aproximados. Se guarda como texto («Beto (nervioso → aliviado): —…») y entra solo al prompt.
- Lupita 🔍 en «Guion completo»: busca una palabra o parte de un diálogo (sin importar acentos), brinca con Enter y lleva a la escena.
- App de escritorio: «Guardar como…» al exportar; «Exportar edición» crea una carpeta lista para Final Cut (rutas completas); botón ✋ para arrastrar la imagen fuera de la app como archivo.
- Copia ligera para la vista previa: si un video es muy pesado (por ejemplo 2K), la vista previa usa una copia ligera y al exportar se usa el original.

## Claude dentro de la app de escritorio

Si usas [Claude Code](https://claude.com/claude-code), puede ayudarte desde la app:

- **Chat «CLAUDE»** (panel derecho): escribe o dicta con el micrófono; la bocina lee las respuestas en voz alta. Los mensajes viajan por dos archivos en la carpeta del proyecto (`chat-usuario.json` y `chat-claude.json`).
- En tu terminal, Claude escucha con `node tools/claude-chat.mjs escuchar` y responde con `node tools/claude-chat.mjs responder "…"`.
- Botones **«Generar imágenes»** (por escena o las que falten del proyecto) y **«Volver a generar»** (varita, con una nota de qué salió mal): mandan el pedido a Claude por el chat.
- Si Claude cambia `proyecto.json` mientras la app está abierta, la app une los cambios en vez de pisarlos.

## Limitaciones de esta versión

- Versión web: todo se guarda **en el navegador** de esa computadora. Usa «Exportar proyecto» para tener copia. La app de escritorio guarda en carpetas del disco.
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
