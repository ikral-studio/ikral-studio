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
- Personajes: `project.characters` = `[{ id, name, description, imageId?, prompt?, tries?, generating? }]`. Pedido `character-preview` (trae `prompt`) → genera la imagen, agrégala a `tries` como `{ id, mediaId, prompt, at }`, pon `imageId` solo si no tenía, y quita `generating`.
- Biblia: `project.locations`, `project.props` (objetos) y `project.wardrobe` (vestuario, con `characterId`) = `[{ id, name, note?, description, imageId?, prompt?, tries?, generating? }]`; `project.relations` = `[{ id, a, b, label }]` (ids de personajes). Estados: sin `imageId` ni pruebas = Sin preparar; con pruebas o descripción = En pruebas; con `imageId` = Canon (aprobado oficialmente). Pedido `item-preview` (trae `kind`, `itemId`, `prompt`) → igual que `character-preview` pero en esa lista. Personajes también pueden tener `role` (papel corto).
- Imagen inicial y final (panel «Escenas del proyecto» en Preproducción): cada escena puede tener `prep` = `{ start?, end? }`, cada uno `{ prompt?, tries?, approvedId?, generating? }`. Pedido `frame-preview` (trae `sceneId`, `slot`, `prompt` y `characterImageIds` de referencia) → genera la imagen, agrégala a `scenes[].prep[slot].tries` como `{ id, mediaId, prompt, at }`, pon `approvedId` solo si no tenía, quita `generating` y actualiza `updatedAt` de la escena. La persona la aprueba y con «Pasar a Edición» se copia a `startImageId` / `endImageId`.
- Sugerencia (paso 5 de la Biblia): pedido `character-suggestions` del chat → escribe `project.suggestion` = `[{ name, description, imageId? }]` (description en español, con el estilo de `project.bible` y la idea `project.bible.castIdea`). Al terminar quita `project.bible.suggesting`. La persona la acepta en la app y pasa sola a las fichas.
- Papelera: `project.trash` = `[{ id, deletedAt, kind, … }]` (kind `scene` con `scene` e `index`; `characters`/`locations`/`props`/`wardrobe` con `item` y `relations?`; `relation`; `version` con `sceneId` y `version`). Si borras algo, mándalo ahí en vez de perderlo; sus archivos no se limpian.

## Chat con Claude

La app escribe `chat-usuario.json`; Claude solo escribe `chat-claude.json`. El botón «Empezar a escuchar» abre la Terminal con `claude` en la carpeta del código y le pide seguir este ciclo:

1. `node tools/claude-chat.mjs escuchar` en segundo plano (escucha todos los proyectos). Mientras corre, renueva `lastSeen` cada 20 s: eso prende el foquito 🟢 en la app (se apaga si pasan 90 s sin señal, o 10 min si hay `working`).
2. Al llegar un mensaje, el comando lo imprime (con su `carpeta`) y termina. Avisa con `node tools/claude-chat.mjs trabajando "Haciendo…" <carpeta>`.
3. Atiende el pedido (ver arriba: antes de editar `proyecto.json`, haz copia de respaldo y escribe de forma atómica).
4. Contesta con `node tools/claude-chat.mjs responder "texto" <carpeta>` y vuelve al paso 1.
