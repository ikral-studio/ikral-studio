# Carpeta del proyecto (app de escritorio)

La app de escritorio guarda todo en `Documentos/IKRAL Studio/`:

```
IKRAL Studio/
  ajustes.json
  Proyectos/
    <Título>-<id>.ikral/   ← «biblioteca»: el Mac la muestra como un solo archivo con su ícono
      proyecto.json      ← guion, escenas, orden, cámara, música, estilo, personajes
      archivos.json      ← índice de imágenes, videos y audios (id → nombre, tipo, medidas, duración)
      archivos/<id>.mp4  ← los archivos reales (también .png, .jpg, .webp, .mp3…)
      miniaturas/<id>.jpg
      respaldos/<id>.json
```

## Bibliotecas (.ikral), como en Final Cut

- Cada proyecto es una carpeta-paquete `Nombre.ikral`. En Finder se ve como un archivo con el ícono de IKRAL; por dentro es la misma carpeta de siempre (Terminal y Claude entran normal).
- En la app: botón **«Guardar como»** (arriba, junto a «Ver en Finder» y «Papelera»): eliges dónde y con qué nombre; el proyecto pasa a esa **carpeta normal** (se abre en Finder y se pueden meter cosas) y la app sigue trabajando ahí. En otro disco se copia, se revisa y luego se quita la de antes. **«Ver en Finder»** copia las imágenes con nombres claros a `<carpeta del proyecto>/Imágenes/` y la abre. En Proyectos, **«Abrir carpeta de proyecto…»** abre uno de cualquier lugar; las `.ikral` también con doble clic en Finder.
- Las bibliotecas fuera de `Proyectos/` se anotan en `ajustes.json` → `libraries` (rutas completas). Si el disco no está conectado, no aparecen hasta que se conecte.
- Las carpetas viejas (sin `.ikral`) se renombran solas a `.ikral` al abrir la app.

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
- Sugerir del guion (botón en Locaciones): pedido `item-suggestions` (trae `kind`) → lee todas las escenas y escribe `project.itemSuggestions[kind]` = `[{ name, note?, description }]` (description en español, con el estilo de `project.bible`; sin repetir las que ya están en la lista). Al terminar quita `kind` de `project.bible.suggestingItems`. La persona las acepta en la app y pasan a la lista.
- Sugerencia (paso 5 de la Biblia): pedido `character-suggestions` del chat → escribe `project.suggestion` = `[{ name, description, imageId? }]` (description en español, con el estilo de `project.bible` y la idea `project.bible.castIdea`). Al terminar quita `project.bible.suggesting`. La persona la acepta en la app y pasa sola a las fichas.
- Continuidad (sección «Etapas y decisiones» de la Biblia; todo opcional, un proyecto sin estos campos funciona igual):
  - `project.phases` = `[{ id, name, note? }]` en orden (ej.: ANTES → TRANSICIÓN → DESPUÉS). `scenes[].phaseId` = etapa donde ocurre la escena.
  - En locaciones, objetos y vestuario: `onlyIn?` = ids de etapas donde SÍ puede aparecer (vacío = en todas) y `aliases?` = otros nombres con que sale en el guion (ej.: «papelitos»).
  - `project.decisions` = `[{ id, text, proposedBy: 'director'|'claude'|'gpt', proposedAt, status: 'proposed'|'approved'|'rejected', approvedBy?: 'director', approvedAt?, sceneIds?, itemIds?, allowsBackstep?, updatedAt }]`.
  - **Regla para Claude: lee siempre las decisiones con `status: 'approved'` y respétalas** en guion, prompts e imágenes. No escribas en escenas de una etapa un objeto cuyo `onlyIn` no la incluya.
  - **Claude nunca aprueba.** Si propones una regla, agrégala con `proposedBy: 'claude'`, `status: 'proposed'`, sin `approvedBy`, y con `updatedAt`. Solo el director la aprueba en la app.
  - Si cambias una escena, actualiza su `updatedAt`; si cambias una decisión, el `updatedAt` de esa decisión (así la app une bien los cambios hechos al mismo tiempo).
- Cobertura (planos dentro de una escena; opcional, una escena sin `shots` es UN plano con sus campos de siempre):
  - `scenes[].shots` = `[{ id, order, name, duration, action?, dialogueLines?, sound?, continuity?, camera?, cameraDirection?, prep?, startImageId?, endImageId?, generationPrompt?, references?, videoVersions?, activeVideoVersionId?, updatedAt }]`. `references` = fotogramas `{ id, mediaId, order }`; `prep`, `videoVersions` y `camera` igual que en la escena.
  - El guion (`script.action`, `script.dialogue`), la etapa y los campos extra se quedan en la escena; cada plano lleva sus datos técnicos. Duración de la escena = suma de `duration` de sus planos.
  - No conviertas escenas tú solo: «Pasar a cobertura» lo decide el director en la app. Si una escena ya tiene `shots`, puedes cambiar sus planos: usa ids nuevos `sh_…` para planos nuevos, no cambies ids existentes y actualiza el `updatedAt` del plano y de la escena (la app une los cambios plano por plano).
  - Para quitar un plano, mándalo a la papelera (`kind: 'shot'`, `sceneId`, `shot`, `index`) en vez de borrarlo.
  - En la app: Preproducción → abre la escena → «Cobertura de escena» (agregar, ordenar, duplicar y quitar planos). «Pasar a cobertura» hace un respaldo antes y se puede Deshacer.
  - Si tú y la app cambian el mismo plano (o uno lo borra y el otro lo cambia), la versión que pierde queda en la papelera con `conflict: true`; al recuperarla aparece junto a la otra como «(otra versión)».
  - El auditor de continuidad también revisa el texto de cada plano (acción, cámara, sonido, continuidad y prompts).
- JSON de guion para IA (`ikral-studio-script`): `version: 1` sin planos (igual que siempre) o `version: 2` con `scenes[].shots[]` (`name`, `duration` y opcionales `action`, `sound`, `continuity`, `cameraDirection`, `generationPrompt`, `camera`, `dialogueLines`). Nunca lleva archivos ni ids.
- Papelera: `project.trash` = `[{ id, deletedAt, kind, … }]` (kind `scene` con `scene` e `index`; `characters`/`locations`/`props`/`wardrobe` con `item` y `relations?`; `relation`; `version` con `sceneId` y `version`; `shot` con `sceneId`, `shot` e `index`). Si borras algo, mándalo ahí en vez de perderlo; sus archivos no se limpian.

## Chat con Claude

La app escribe `chat-usuario.json`; Claude solo escribe `chat-claude.json`. El botón «Empezar a escuchar» abre la Terminal con `claude` en la carpeta del código y le pide seguir este ciclo:

1. `node tools/claude-chat.mjs escuchar` en segundo plano (escucha todos los proyectos, también las bibliotecas guardadas en otros discos). Mientras corre, renueva `lastSeen` cada 20 s: eso prende el foquito 🟢 en la app (se apaga si pasan 90 s sin señal, o 10 min si hay `working`).
2. Al llegar un mensaje, el comando lo imprime (con su `carpeta`) y termina. Avisa con `node tools/claude-chat.mjs trabajando "Haciendo…" <carpeta>`.
3. Atiende el pedido (ver arriba: antes de editar `proyecto.json`, haz copia de respaldo y escribe de forma atómica).
4. Contesta con `node tools/claude-chat.mjs responder "texto" <carpeta>` y vuelve al paso 1.
