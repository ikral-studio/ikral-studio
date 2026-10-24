# Plan maestro · IKRAL Studio como estudio de producción

Fecha: 2026-10-23. Estado: **arquitectura aprobada con 5 correcciones (revisión con ChatGPT, 2026-10-23). Autorizado solo: Fase 1, paso 1.**
Programador principal: Claude. Codex en pausa. La carpeta `ikral-studio-codex` y su rama **no se tocan**.

## Resumen sencillo

| Fase | Qué se logra | Depende de |
|---|---|---|
| 1. Continuidad narrativa | Etapas (ANTES / DESPUÉS), decisiones del director y un auditor sin IA que avisa contradicciones. | Nada |
| 2. Cobertura cinematográfica | Varios planos dentro de cada escena. Formato JSON v2. | Fase 1 (cada plano hereda la etapa de su escena) |
| 3. ChatGPT integrado | Botón «Consultar GPT» en cada apartado. Propone; el director aprueba. | Fases 1 y 2 (GPT necesita etapas, decisiones y planos) |
| 4. Biblia de Producción PDF | Un PDF completo con todo el proyecto. | Fases 1, 2 y 3 (para incluir todo) |

Cada fase se entrega sola y probada. **No se publica ni se empieza la siguiente sin tu autorización expresa.**

## Correcciones aprobadas (revisión con ChatGPT)

1. Ninguna fase se publica sin autorización expresa del director.
2. Las decisiones del Canon solo las aprueba el director. Se guarda por separado **quién propone** y **quién aprueba**.
3. Exportar a JSON v1 avisa cuando se pierde estructura o información de los planos.
4. GPT trabaja con **conversaciones con historial** por apartado, no solo consultas sueltas.
5. Se protegen los cambios al mismo tiempo de Claude y la app, también **plano por plano**.

---

## Reglas de protección (valen para TODAS las fases)

1. **Nada se convierte solo.** Un proyecto viejo abre igual que hoy. Solo cambia si tú tocas un botón.
2. **Todos los campos nuevos son opcionales.** Si no existen, la app se porta como hoy.
3. **JSON v1 se sigue aceptando siempre**, para importar y para exportar.
4. **Antes de cualquier conversión** (por ejemplo, «Pasar a cobertura») se hace un respaldo automático y se puede **Deshacer**.
5. **Ninguna IA escribe en `proyecto.json` directo.** Claude y GPT proponen; la app aplica con las acciones de siempre (deshacer + respaldo).
6. **Se conservan todas las funciones actuales:** guion, Biblia, Canon, Preproducción, Edición, línea de tiempo, música, papelera, respaldos, chat con Claude, portafolio PDF, exportar a editores (NLE), web y app de Mac.
7. **Pruebas en cada fase:** las 58 unitarias y las 33 de Playwright actuales deben seguir pasando, más las nuevas.
8. **Proyectos reales:** no se tocan en desarrollo. Se prueba con proyectos de ejemplo. «Sin cebolla» queda igual hasta que tú decidas.
9. **Publicar:** solo con **autorización expresa** del director para esa fase. Con respaldo antes en `/Volumes/c/respaldos/ikral-studio/` y prueba en https://ikral.com/studio/.
10. **Solo el director aprueba.** Claude y GPT pueden proponer decisiones, Canon o cambios; nada cuenta como aprobado sin el director.
11. **Cambios al mismo tiempo:** cada dato que Claude o la app puedan editar a la vez lleva su propio `updatedAt` y se une por pieza (escena, plano, etapa, decisión), no por proyecto entero.

## Cómo se entrega cada fase (siempre igual)

1. Tipos y funciones puras, con sus pruebas.
2. Store (acciones con deshacer y guardado).
3. Interfaz.
4. Documentación para Claude (`docs/carpeta-del-proyecto.md`).
5. Revisión: `npm test`, `npm run build`, `oxlint`.
6. Instalar la app de Mac.
7. **Pedir autorización expresa para publicar.** Con el «sí»: respaldo y subir la página.
8. Playwright en la página publicada.
9. Commit y bitácora.

---

## Fase 1 · Continuidad narrativa

Detalle completo en `docs/alcance-fase1-continuidad.md`. Aquí va el resumen.

### Funciones

- **Etapas** del proyecto, en orden (ANTES → TRANSICIÓN → DESPUÉS). Crear, renombrar, ordenar y quitar.
- Cada **escena** dice en qué etapa ocurre.
- Cada **locación, objeto o vestuario** dice en qué etapas puede aparecer («Aparece en:») y tiene **otros nombres** (alias: «papelitos», «tickets»).
- **Decisiones**: reglas que Claude (y luego GPT) deben respetar. Cualquiera puede **proponer** (director, Claude, GPT), pero solo el **director aprueba**. Solo las aprobadas cuentan para el auditor y para las IA.
- **Auditor sin IA**: botón «Revisar continuidad». Solo avisa, no cambia nada. 5 reglas (ver el alcance).

### Datos nuevos (opcionales)

`Project.phases?`, `Project.decisions?`, `Scene.phaseId?`, `BibleItem.onlyIn?`, `BibleItem.aliases?`.

```ts
interface Decision {
  id: string
  text: string
  proposedBy: 'director' | 'claude' | 'gpt'
  proposedAt: string
  status: 'proposed' | 'approved' | 'rejected'
  approvedBy?: 'director'      // solo el director puede aprobar
  approvedAt?: string
  sceneIds?: string[]
  itemIds?: string[]
  allowsBackstep?: boolean     // permite volver de etapa (flashback) en esas escenas
  updatedAt: string
}
```

**Cambios al mismo tiempo:** hoy `merge.ts` une por escena, pero los datos del proyecto los gana entero el más reciente. En el paso 2 (store) se unen `phases` y `decisions` **por id** con su `updatedAt`, para que una decisión que agregó Claude no se pierda si tú editas otra cosa.
No cambia `version: 1`. Los hallazgos del auditor **no se guardan**: se calculan cada vez.

### Archivos

- Nuevos: `src/features/continuity/continuity.ts`, `src/features/continuity/examples.ts`, `src/components/bible/ContinuitySection.tsx`, `src/tests/continuity.test.ts`.
- Cambiados: `src/types/index.ts`, `src/stores/projectStore.ts`, `src/components/bible/BibleScreen.tsx`, `src/components/bible/CharacterSheet.tsx`, `src/components/bible/FramesPanel.tsx`, `docs/carpeta-del-proyecto.md`, `src/tests/store.test.ts`, `tests-e2e/acceptance.spec.ts`.
- No se tocan: `tools/claude-chat.mjs`, `src-tauri/`, `ClaudeChat.tsx`, `fsdb.ts`, `merge.ts`, formato de respaldos.

### Dependencias

Ninguna. Es la base de todo lo demás.

### Pruebas

- 11 unitarias del auditor (papelitos, tablet, casos correctos, negación «ya no hay», «servilleta de papel» no cuenta, acentos, escena sin etapa, flashback, proyecto viejo, limpieza).
- 5 del store (etapas, quitar + deshacer, `updatedAt`, decisiones, guardar y recargar).
- 1 completa en la página publicada (crear etapas → objeto solo en ANTES → escena DESPUÉS con «papelitos» → aviso → corregir → desaparece).

### Criterios de aceptación

- [ ] Un proyecto viejo abre igual y el auditor no da avisos ni falla.
- [ ] El caso «papelitos en DESPUÉS» da un aviso **alto** con la cita exacta.
- [ ] «Ya no hay comandas» da **revisar**, no alto.
- [ ] Quitar una etapa limpia sus referencias y **Deshacer** las devuelve.
- [ ] Claude lee las decisiones aprobadas (documentado en `carpeta-del-proyecto.md`).
- [ ] Una decisión propuesta por Claude o GPT no cuenta hasta que el director la aprueba.
- [ ] Si Claude agrega una decisión mientras tú editas, no se pierde.
- [ ] Pasan todas las pruebas viejas y nuevas.

---

## Fase 2 · Cobertura cinematográfica

### Idea

Hoy una escena = una toma: una cámara, una imagen inicial, una final, un prompt de video y videos. Los «Fotogramas intermedios» son solo imágenes sueltas.

Con la cobertura, una escena puede tener **varios planos**. Ejemplo: Doña Chuy cocinando.

| # | Plano | Duración |
|---|---|---|
| 1 | Plano general del restaurante | 3 s |
| 2 | Detalle de sus manos | 2 s |
| 3 | Inserto de la carne en la parrilla | 2 s |
| 4 | Primer plano de su rostro al responder | 3 s |

- **Se queda en la escena:** título, guion general (acción), diálogos principales, etapa, campos extra.
- **Va en cada plano:** cámara, duración, acción del plano, sonido, nota de continuidad, imagen inicial y final (con pruebas y aprobada), prompt de video y videos.

### Regla de oro: «escena sin planos = un plano implícito»

- Si una escena **no tiene** `shots`, la app la trata como **un solo plano** armado con sus campos de hoy (`script.camera`, `prep`, `startImageId`, `endImageId`, `videoVersions`…).
- Así **nada se mueve** en proyectos viejos. Todo el código nuevo lee los planos con una sola función: `shotsOf(scene)`.
- Botón **«Pasar a cobertura»** (por escena, solo si tú lo tocas):
  - Respaldo automático antes.
  - Crea el Plano 1 copiando (no moviendo) la cámara, las imágenes, el prompt y los videos de la escena.
  - Los «Fotogramas intermedios» quedan como **referencias** del Plano 1. Ninguna imagen se borra.
  - Se puede **Deshacer**.

### Datos nuevos (opcionales)

```ts
interface Shot {
  id: string
  order: number
  name: string                 // «Detalle de manos»
  duration: number
  action?: string              // qué pasa en este plano
  dialogueLines?: number[]     // qué líneas del diálogo de la escena caen aquí (opcional)
  sound?: string
  continuity?: string          // nota: «la carne ya está volteada»
  camera?: CameraSpec          // el mismo tipo de hoy
  prep?: { start?: FramePlan; end?: FramePlan }
  startImageId?: string
  endImageId?: string
  generationPrompt?: string    // prompt de video propio
  references?: StoryboardFrame[]  // los fotogramas de hoy pasan aquí
  videoVersions?: VideoVersion[]
  activeVideoVersionId?: string
  updatedAt: string            // para unir cambios plano por plano
}
Scene.shots?: Shot[]
```

### JSON v2

- `version: 2` agrega `scenes[].shots[]` con los campos del plano (sin imágenes ni videos, igual que v1).
- **Importar:** acepta v1 y v2. Un v1 entra igual que hoy.
- **Exportar:** por defecto v2 solo si alguna escena tiene planos. Opción «Exportar como v1» siempre disponible: une los planos en un solo texto de cámara y acción.
- **Aviso al exportar v1:** antes de guardar, la app lista lo que se pierde, por ejemplo: «Escena 3: 4 planos se unen en uno; se pierden la cámara y la duración de cada plano y sus notas de continuidad». Hay que tocar «Entendido, exportar v1». Si no hay planos, no sale aviso.
- El texto de ayuda para Claude/GPT (el que explica el formato) se actualiza con v2.

### Cambios al mismo tiempo (Claude y la app)

- Cada plano lleva su propio `updatedAt`.
- `merge.ts` une **plano por plano** dentro de la escena: si Claude cambió el plano 2 y tú el plano 4, se quedan los dos cambios.
- Planos nuevos de cada lado se respetan; uno borrado por cualquiera se va a la papelera (no se pierde).
- Si los dos cambiaron **el mismo plano**, gana el más reciente y el otro se guarda en la papelera como versión, para poder recuperarlo.
- Los textos de la escena (guion, diálogos) siguen la regla de hoy por escena.

### Funciones de la app que cambian

| Parte | Qué cambia |
|---|---|
| Preproducción | «Fotogramas intermedios» → **«Cobertura de escena»**: lista de planos, agregar, ordenar, duplicar, quitar (a la papelera). |
| Imágenes con Claude | Pedido nuevo `shot-preview` (igual a `frame-preview` pero para un plano). |
| Biblioteca de cámara | Se usa por plano. |
| Edición / línea de tiempo | Cada plano es un bloque dentro de su escena. Duración de la escena = suma de sus planos. |
| Reproductor | Toca los videos plano por plano. |
| Exportar a editores (NLE) | Un clip por plano. |
| Papelera | Nuevo tipo `shot`. |
| Auditor (Fase 1) | Revisa también el texto de cada plano. |
| Portafolio PDF | Muestra los planos (cambio pequeño; el grande es la Fase 4). |

### Archivos

- Nuevos: `src/features/coverage/shots.ts` (`shotsOf`, `convertToCoverage`, `flattenToV1`, duración), `src/components/scenes/CoveragePanel.tsx`, `src/components/scenes/ShotCard.tsx`, `src/tests/coverage.test.ts`.
- Cambiados: `src/types/index.ts`, `src/stores/projectStore.ts`, `src/features/script-exchange/schema.ts`, `src/features/script-sync/derive.ts`, `src/features/playback/engine.ts`, `src/components/timeline/Timeline.tsx`, `src/components/scenes/FramesStrip.tsx` (se vuelve la entrada a Cobertura), `src/components/bible/FramesPanel.tsx`, `src/components/scenes/VideoPanel.tsx`, `src/components/scenes/SceneCard.tsx`, `src/features/projects/nleExport.ts`, `src/features/projects/portfolio.ts`, `src/features/trash/trash.ts`, `src/features/continuity/continuity.ts`, `tools/claude-chat.mjs` (pedido `shot-preview`), `docs/carpeta-del-proyecto.md`.
- También: `src/database/merge.ts` (unir plano por plano) y `src/tests/merge.test.ts`.
- Revisar sin cambiar si se puede: `backup.ts`, `library.ts` (los planos viajan dentro de la escena).

### Sub-etapas (para entregar en partes chicas)

- **2a.** Datos + `shotsOf` + JSON v2 + pruebas. Sin interfaz.
- **2b.** Panel «Cobertura de escena» en Preproducción + «Pasar a cobertura».
- **2c.** Edición, línea de tiempo, reproductor y NLE por plano.
- **2d.** Imágenes por plano con Claude (`shot-preview`).

### Dependencias

Fase 1 (los planos heredan la etapa de su escena y el auditor los revisa).

### Pruebas

- `shotsOf` de una escena vieja da 1 plano con los mismos datos.
- «Pasar a cobertura» no pierde ninguna imagen, video ni fotograma; Deshacer deja la escena idéntica.
- Duración de la escena = suma de planos; la línea de tiempo cuadra.
- JSON: importar v1 igual que hoy; importar v2; exportar v2 → importar v2 = mismo contenido; exportar como v1 no pierde texto.
- Papelera: quitar y recuperar un plano.
- Unir cambios: Claude cambia el plano 2 y la app el 4 → quedan los dos; los dos cambian el mismo plano → gana el más reciente y el otro queda en la papelera.
- Exportar v1 con planos muestra el aviso con lo que se pierde; sin planos no sale aviso.
- NLE: un clip por plano, en orden.
- Playwright: proyecto viejo abre igual; crear 4 planos (ejemplo Doña Chuy); reproducir; exportar e importar JSON v2.

### Criterios de aceptación

- [ ] Un proyecto viejo abre, se ve y se reproduce igual que hoy.
- [ ] Ninguna imagen o video se pierde al pasar a cobertura.
- [ ] Cada plano tiene cámara, duración, acción, sonido, continuidad, imagen inicial/final, prompt de video y videos.
- [ ] El guion y los diálogos siguen en la escena.
- [ ] JSON v1 entra y sale como hoy; JSON v2 funciona ida y vuelta.
- [ ] Exportar v1 avisa qué se pierde de los planos.
- [ ] Cambios simultáneos en planos distintos no se pierden.
- [ ] Pasan todas las pruebas.

---

## Fase 3 · ChatGPT integrado (coguionista y asistente de dirección)

### Cómo se conecta

Camino **A** del diagnóstico (`docs/diagnostico-gpt-guionista.md`):
- Solo en la **app de Mac**. La app corre `codex exec` en **solo lectura**, con imágenes (`-i`) y formato fijo (`--output-schema`).
- Usa tu plan de ChatGPT. **IKRAL no guarda llaves.**
- La prueba piloto ya funcionó (`docs/prueba-piloto-gpt-guionista-2026-10-23.md`).
- En la web el botón se ve, pero dice «Disponible en la app de Mac».

### Funciones

- Botón **«Consultar GPT»** en cada apartado:

| Apartado | Para qué |
|---|---|
| Biblia · estilo | Proponer y afinar el estilo. |
| Personajes | Desarrollar personalidad, apariencia, relaciones. |
| Locaciones / objetos / vestuario | Descripciones, etapas, alias. |
| Etapas y decisiones | Proponer reglas de continuidad. |
| Guion de escena | Desarrollar la acción, mejorar diálogos. |
| Cobertura | Proponer planos (lista de planos con cámara y duración). |
| Plano | Diseñar cámara, prompt de imagen y de video. |
| Continuidad | Revisar texto **e imágenes** (lo de la Fase 2 del alcance). |
| Edición | Ritmo, orden, duración. |

- **Conversaciones con historial (no consultas sueltas):**
  - Cada apartado tiene sus **hilos** (por ejemplo «Escena 3 · diálogos»). Se pueden abrir varios, retomar y archivar.
  - Cada mensaje nuevo manda a GPT: el paquete de contexto **actualizado** (Biblia, decisiones aprobadas, etapas, la escena o plano, imágenes Canon en miniatura) + el historial del hilo.
  - Si el historial crece mucho, se manda un **resumen** de lo anterior y los últimos mensajes completos.
  - Si el proyecto cambió desde el último mensaje, GPT recibe «esto cambió desde la última vez».
  - Codex corre `--ephemeral`, así que **el historial lo guarda IKRAL**, no OpenAI.
- **Propuestas con aprobación:** GPT responde con propuestas concretas (por ejemplo: «cambiar el diálogo de la línea 2», «agregar plano detalle de manos»). Cada una tiene **Aceptar / Editar / Descartar / Pedir a Claude**. Solo el director acepta. Al aceptar, la app aplica con las acciones de siempre (deshacer + respaldo). Una regla de GPT se guarda en `decisions` con `proposedBy: 'gpt'` y `approvedBy: 'director'`.
- **Propuesta vieja:** si la escena o el plano cambió después de la propuesta, la app avisa «esto cambió desde que GPT lo propuso» antes de aplicar.
- **Historial:** `gpt-hilos.json` (hilos, mensajes, resúmenes y propuestas con su estado) y `gpt-revisiones.json` en la carpeta del proyecto. Se escriben con escritura atómica. GPT no guarda nada en OpenAI. Claude también los puede leer.

### Archivos

- Nuevos: `src-tauri/src/gpt.rs` (comando `consultar_gpt`: arma el paquete, corre `codex exec`, guarda con escritura atómica), `src/features/gpt/context.ts` (paquete por apartado), `src/features/gpt/proposals.ts` (tipos y cómo aplicar cada propuesta), `src/features/gpt/schemas/*.json` (formato de respuesta por apartado), `src/components/gpt/ConsultGptButton.tsx`, `src/components/gpt/GptPanel.tsx`, `src/tests/gpt.test.ts`.
- Cambiados: `src-tauri/src/lib.rs` (registrar el comando), `src/database/fsdb.ts` (leer y vigilar `gpt-*.json`), cada pantalla donde va el botón, `docs/carpeta-del-proyecto.md`.
- No se toca: el chat con Claude (`tools/claude-chat.mjs`, `ClaudeChat.tsx`).

### Sub-etapas

- **3a.** Revisión de continuidad con GPT (texto + imágenes), usando `examples.ts` de la Fase 1.
- **3b.** «Consultar GPT» en guion y diálogos.
- **3c.** En personajes y Biblia.
- **3d.** En cobertura y planos.
- **3e.** En edición.

### Dependencias

Fase 1 (decisiones, etapas, ejemplos) y Fase 2 (planos). Codex instalado y con sesión iniciada. Confirmar que tu plan es Plus o Pro.

### Pruebas

- Unitarias: el paquete de contexto trae lo correcto y nada de más; el historial y el resumen se arman bien; cada tipo de propuesta se aplica bien y se deshace; una propuesta vieja da aviso; una respuesta con formato malo no rompe nada.
- Con GPT de verdad (manual, pocas veces para no gastar límite): los casos de `examples.ts` dan los hallazgos esperados.
- Prueba sin Codex instalado: aviso claro, la app sigue normal.
- Playwright: en la web el botón muestra «Disponible en la app de Mac».

### Criterios de aceptación

- [ ] Ninguna propuesta cambia el proyecto sin «Aceptar» del director.
- [ ] Un hilo se puede retomar otro día y GPT recuerda lo platicado.
- [ ] Todo lo aceptado se puede deshacer.
- [ ] GPT respeta las decisiones aprobadas (los casos de prueba lo confirman).
- [ ] No se guarda ninguna llave ni contraseña.
- [ ] El chat con Claude sigue igual.

---

## Fase 4 · Biblia de Producción PDF

### Funciones

El botón actual «Portafolio PDF» ofrece dos opciones:
1. **Portafolio** (el de hoy, sin cambios).
2. **Biblia de Producción completa**:

| Sección | Contenido |
|---|---|
| Portada | Título, locación principal, fecha, formato. |
| Estilo | Biblia de estilo (look, época, lugar, ánimo, público). |
| Personajes | Ficha, imagen Canon, relaciones, vestuario. |
| Canon | Locaciones, objetos y vestuario con su imagen aprobada. |
| Etapas narrativas | Cada etapa y qué elementos van en cada una. |
| Decisiones aprobadas | Lista con quién y cuándo. |
| Guion | Escena por escena, con etapa y diálogos (con caritas). |
| Cobertura | Plano por plano: cámara, duración, acción, sonido, continuidad, imágenes inicial/final. |
| Prompts | Prompts de imagen y de video de cada plano (anexo). |
| Sonido y música | Indicaciones de sonido y pistas de música. |
| Videos | Versión activa de cada plano: miniatura, duración, modelo. |
| Continuidad | Resultado del auditor al momento de exportar. |
| Lista de tomas | Tabla de planos (la de hoy, ampliada). |

- Se puede escoger qué secciones incluir.
- Los proyectos sin etapas ni planos también salen (las secciones vacías no aparecen).

### Archivos

- Nuevos: `src/features/projects/productionBible.ts` (reusa fuentes, colores y funciones de `portfolio.ts`), `src/tests/productionBible.test.ts`.
- Cambiados: `src/features/projects/portfolio.ts` (sacar las piezas comunes a funciones compartidas, sin cambiar su resultado), el botón de exportar.

### Dependencias

Fases 1, 2 y 3 (para que tenga etapas, decisiones, planos y lo aprobado con GPT). Se puede adelantar una versión sin planos si hace falta.

### Pruebas

- El Portafolio de hoy sale igual (misma cantidad de páginas con el proyecto de ejemplo).
- Biblia con proyecto viejo: sale sin secciones vacías y sin errores.
- Biblia con el ejemplo Doña Chuy (etapas + 4 planos): aparecen todas las secciones.
- Textos con acentos y emojis no rompen el PDF.
- Playwright: descargar la Biblia en la página publicada y revisar que abre.

### Criterios de aceptación

- [ ] El Portafolio actual no cambia.
- [ ] La Biblia incluye todas las secciones de la tabla cuando hay datos.
- [ ] Proyectos viejos también la generan.
- [ ] Pasan todas las pruebas.

---

## Riesgos y cómo se cuidan

| Riesgo | Cómo se cuida |
|---|---|
| Perder imágenes o videos al pasar a planos | Plano implícito, copia (no mover), respaldo antes, Deshacer, prueba específica. |
| Romper la línea de tiempo | Sub-etapa 2c aparte, con pruebas de duración y reproducción. |
| Claude escribe `proyecto.json` mientras la app edita | Ya existe la unión por escena (`merge.ts`). Se amplía: etapas y decisiones por id (Fase 1) y planos uno por uno (Fase 2), cada uno con su `updatedAt`. |
| Una IA aprueba algo sola | Solo el director aprueba; `approvedBy` solo puede ser `'director'`. |
| GPT cambia el plan de ChatGPT o sus reglas (es «preview») | Camino A con Codex; si cambia, pasar a B. Nada depende de GPT para funcionar. |
| Gastar el límite de ChatGPT | Consultas solo al tocar el botón; miniaturas en vez de imágenes grandes. |
| Archivos JSON v2 en una versión vieja de la app | «Exportar como v1» siempre disponible. |

## Siguiente paso

**Autorizado (2026-10-23): Fase 1, paso 1** — tipos, funciones puras del auditor y pruebas unitarias. Sin interfaz, sin convertir proyectos reales, sin publicar, sin tocar `ikral-studio-codex`.
