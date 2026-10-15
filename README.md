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
```

Las pruebas usan videos e imágenes de `tests-e2e/fixtures/` (hechos con ffmpeg).

## Cómo está hecho

- React 19 + TypeScript estricto + Vite + Tailwind 4 + Lucide.
- Estado: Zustand (`src/stores/projectStore.ts`) = **única fuente de verdad**.
- Guion maestro, timeline, estados y duraciones se **derivan** con funciones puras (`src/features/script-sync/derive.ts`). No hay copias del guion.
- Reproducción: un solo `<video>` controlado por `src/features/playback/engine.ts` (tiempo global → escena + segundo interno).
- Persistencia: IndexedDB con Dexie (`src/database/db.ts`). Los archivos se guardan como ArrayBuffer (Safari falla a veces con Blob/File). Las URLs `blob:` solo se usan para mostrar.
- Respaldo: `.zip` con `project.json` + archivos reales (`src/features/projects/backup.ts`).
- Reordenar: dnd-kit (ratón y teclado).

## Limitaciones de esta versión

- Todo se guarda **en el navegador** de esa computadora. No hay nube. Usa «Exportar proyecto» para tener copia.
- No existe «Exportar video» (no hay renderizador). La película se ve completa en la Vista previa.
- No se puede arrastrar un archivo de esta página directo a otra web (límite de los navegadores). Usa Descargar + Copiar prompt.
- shadcn/ui no se usó: los componentes son propios con Tailwind (menos peso).
- Las pruebas automáticas corren en WebKit. Chromium headless no trae el códec H.264.
- Videos muy grandes (cientos de MB) ocupan memoria al guardarse.
