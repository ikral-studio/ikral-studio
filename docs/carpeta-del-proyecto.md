# Carpeta del proyecto (app de escritorio)

La app de escritorio guarda todo en `Documentos/IKRAL Studio/`:

```
IKRAL Studio/
  ajustes.json
  Proyectos/
    <Título>-<id>/
      proyecto.json      ← guion, escenas, orden, cámara, música, estilo, personajes
      archivos.json      ← índice de imágenes, videos y audios (id → nombre, tipo, medidas, duración)
      archivos/<id>.mp4  ← los archivos reales (también .png, .jpg, .webp, .mp3…)
      miniaturas/<id>.jpg
      respaldos/<id>.json
```

## Para asistentes de IA (Claude, etc.)

Puedes editar `proyecto.json` mientras la app está abierta: la app detecta el cambio y recarga sola.

- Formato: `{ "format": "ikral-studio-project", "version": 1, "project": {…}, "scenes": [ … ] }`.
- El orden de las escenas es `project.sceneIds`. Cada escena tiene `id`, `title`, `plannedDuration` y `script` (`action`, `dialogue`, `cameraDirection`, `soundDirection`, `generationPrompt`, `pronunciations`, `numbersToWords`, `camera`, `extras`). Los tipos exactos están en `src/types/index.ts`.
- Para agregar un archivo: cópialo a `archivos/<id>.<ext>`, agrégalo a `archivos.json` con `{ id, projectId, name, mimeType, size, kind, width?, height?, duration?, createdAt }` y referencia su `id` en la escena (`startImageId`, `endImageId`, o en `videoVersions` con `{ id, mediaId, duration, createdAt }` y `activeVideoVersionId`). Si una escena lleva varios videos seguidos, van en `clips` de la versión (`{ id, mediaId, duration, trimIn?, trimOut? }`).
- Escribe el JSON completo y válido de una vez (la app escribe con archivo temporal + renombrar; haz lo mismo).
- No borres archivos: la app limpia sola los que ya nadie usa (y respeta los que usan los respaldos).
- Personajes: `project.characters` = `[{ id, name, description, imageId? }]`. Pedido `character-preview` del chat → genera la imagen y pon su id en `imageId` de ese personaje.
- Sugerencia (paso 5 de la Biblia): pedido `character-suggestions` del chat → escribe `project.suggestion` = `[{ name, description, imageId? }]` (description en español, con el estilo de `project.bible` y la idea `project.bible.castIdea`). La persona la acepta en la app y pasa sola a las fichas.
