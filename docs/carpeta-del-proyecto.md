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
      gpt-revisiones.json ← revisiones de continuidad con GPT (solo propuestas)
      gpt-hilos.json      ← conversaciones con GPT sobre guion, diálogos, Biblia y cobertura (historial y propuestas)
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
- Imagen inicial y final de un plano (Cobertura de escena): cada plano de `scenes[].shots[]` puede tener su propio `prep` igual al de la escena. Pedido `shot-preview` (trae `sceneId`, `shotId`, `slot`, `prompt` y `characterImageIds`) → busca el plano por `shotId` (no por su número: el orden puede cambiar), genera la imagen, agrégala a `shots[].prep[slot].tries` como `{ id, mediaId, prompt, at }`, pon `approvedId` solo si no tenía, quita `generating` y actualiza `updatedAt` del plano y de la escena. Nunca cambies ids de planos ni crees planos; si el plano ya no existe (o está en la papelera), avisa en el chat. «Pasar a Edición» copia la aprobada a `startImageId` / `endImageId` del plano (pide confirmar si reemplaza otra).
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

## Revisión de continuidad con GPT

En la Biblia → «Etapas y decisiones», el botón «Revisar con GPT» (solo en la app de Mac) corre `codex exec` en modo solo lectura con la sesión de ChatGPT ya iniciada en la Mac. Manda texto (etapas, decisiones aprobadas, elementos con sus etapas, escenas y planos, avisos locales) y hasta 12 miniaturas de imágenes inicial/final. No manda prompts de generación, intentos, chat ni videos.

- GPT responde con el esquema `src/features/gpt/schemas/continuity.json`; si el formato no sirve, se descarta sin cambiar nada.
- Las propuestas se guardan en `gpt-revisiones.json` (las 20 revisiones más nuevas). La escribe solo la app: Claude y otros asistentes no la editan.
- Nada cambia hasta que el director pulsa Aceptar. Aceptar una propuesta con regla crea una decisión de GPT aprobada por el director; Deshacer la quita.
- Si no hay Codex, no hay sesión, se acabó la cuota o tarda más de 4 min, la app lo dice con calma y no cambia nada.

## Consultar GPT en guion y diálogos

En cada escena (Edición → «Guion y dirección»), el botón «Consultar GPT» abre una conversación con GPT sobre la acción visual y los diálogos de esa escena (solo en la app de Mac; en la web avisa «Disponible en la app de Mac.»).

- Conversaciones (hilos) por escena: se pueden abrir varias, retomar y archivar. Codex corre `--ephemeral`: el historial lo guarda IKRAL en `gpt-hilos.json` (escritura atómica). La escribe solo la app.
- Cada consulta manda: proyecto, estilo, etapas, decisiones APROBADAS, personajes, la escena con sus diálogos numerados, la acción de las escenas vecinas, «esto cambió desde la última vez» y el historial. Si el historial crece, va el resumen de lo viejo (lo escribe GPT en cada respuesta) y los últimos 6 mensajes completos. No manda decisiones propuestas o rechazadas, prompts de generación, chat con Claude ni imágenes.
- GPT responde con el esquema `src/features/gpt/schemas/script.json`: cambiar la acción, cambiar, agregar o quitar una línea de diálogo (máximo 8 propuestas). Si el formato no sirve, se descarta sin cambiar nada.
- Cada propuesta: Aceptar · Editar · Descartar · Pedir a Claude, y Deshacer. Al Aceptar, la app cambia la escena con sus acciones de siempre (⌘Z y guardado); ningún asistente escribe `proyecto.json` directo.
- Si la línea o la acción cambió desde que GPT la vio, avisa «Esto cambió desde que GPT lo propuso» y pide confirmar. Si la línea solo se movió, se sigue. Deshacer no pisa lo que editaste después.

## Consultar GPT en personajes y Biblia

En la Biblia (Preproducción), «Consultar GPT» está en «Estilo y tono visual», en «Etapas y decisiones» (proponer reglas) y en la ficha de cada personaje, locación, objeto y vestuario (solo en la app de Mac; en la web avisa «Disponible en la app de Mac.»).

- Hilos por apartado (`style`, `rules`, `characters:<id>`, `locations:<id>`…), en el mismo `gpt-hilos.json` con `section: 'bible'`. Al guardar, la app vuelve a leer el archivo y solo cambia los hilos de su apartado (guion y Biblia no se pisan).
- Cada consulta manda: proyecto, etapas, decisiones APROBADAS, el apartado completo, el resto de la Biblia en corto, la miniatura de la imagen Canon de la ficha (si tiene), «esto cambió desde la última vez» y el historial (resumen + últimos 6). No manda decisiones propuestas o rechazadas, prompts de generación, intentos de imagen ni chat con Claude.
- GPT responde con el esquema `src/features/gpt/schemas/bible.json` (máximo 8 propuestas). Según el apartado: estilo → notas de estilo, época, lugar, cómo se ve, colores; personaje → cómo se ve, papel, relación con otro personaje; locación/objeto/vestuario → cómo se ve, nota corta, alias, etapas; etapas y decisiones → solo reglas. En todos, «regla». Los tipos que no valen en ese apartado se ignoran.
- Aceptar aplica el cambio con las acciones de siempre (⌘Z y guardado). Una regla entra como decisión de GPT (`proposedBy: 'gpt'`) aprobada por el director. Deshacer la quita (o regresa el campo, salvo que lo hayas editado después). También: Editar, Descartar y Pedir a Claude.
- Si el campo cambió desde que GPT lo vio, avisa «Esto cambió desde que GPT lo propuso» y pide confirmar. Nunca cambia imágenes: el Canon (imagen aprobada) se queda igual.

## Consultar GPT en cobertura y planos

En Preproducción → «Cobertura de escena», «Consultar GPT» propone planos (lista con nombre, cámara, duración, acción y sonido); dentro de cada plano, diseña cámara, prompt de imagen inicial/final y prompt de video (solo en la app de Mac; en la web avisa «Disponible en la app de Mac.»).

- Hilos en el mismo `gpt-hilos.json` con `section: 'coverage'`. Clave: el id de la escena (cobertura) o `escena#plano` (un plano). Guion, Biblia y cobertura no se pisan.
- Cada consulta manda: proyecto, estilo, etapas, decisiones APROBADAS, personajes, la escena (acción, diálogos, sonido, duración) con sus planos numerados, «esto cambió desde la última vez» y el historial (resumen + últimos 6). Solo al diseñar un plano manda sus prompts de imagen y de video de hoy. Sin imágenes ni chat con Claude.
- GPT responde con el esquema `src/features/gpt/schemas/coverage.json` (máximo 10 propuestas): agregar un plano en un lugar, o cambiar un campo de un plano. Lo que no vale en ese apartado, planos que no existen o duraciones malas se ignoran.
- Si la escena aún es un solo plano, Aceptar pregunta si pasarla a cobertura (con respaldo antes). Un plano agregado se puede Deshacer (va a la Papelera). Deshacer no pisa lo que editaste después. También: Editar, Descartar y Pedir a Claude.
- Si el plano o la lista de planos cambió desde que GPT la vio, avisa «Esto cambió desde que GPT lo propuso» y pide confirmar. Nunca genera imágenes ni videos.
