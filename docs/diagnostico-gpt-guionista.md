# Diagnóstico: «GPT · Guionista» dentro de IKRAL Studio

Fecha: 2026-10-23. Estado: **propuesta para revisar. Todavía no hay código.**

## Resumen sencillo

- **Sí se puede**, pero solo en la **app de escritorio** (Mac). En la versión web (ikral.com/studio) no.
- **No pagas más.** GPT usaría tu plan de ChatGPT, si es **Plus o Pro**. Cuenta dentro de tus límites de siempre.
- **No conviene copiar el DevKit de OpenAI.** Su licencia solo permite usos **no comerciales**.
- **Camino recomendado:** usar **Codex**, que ya está en tu Mac y ya entró con tu cuenta de ChatGPT. Es oficial de OpenAI, tiene licencia libre (Apache 2.0) y ya lo usamos para las imágenes.
- **Claude no cambia.** GPT sería un segundo revisor que lee la misma Biblia. Sus ideas quedan pendientes hasta que tú las apruebes.

## 1. Cómo está hecho IKRAL Studio hoy (revisado en el código)

| Parte | Qué es |
|---|---|
| Interfaz | React 19, TypeScript y Vite. El estado vive en zustand (`src/stores/projectStore.ts`). |
| Escritorio | Tauri 2 (Rust en `src-tauri/src/lib.rs`). Abre la Terminal, Finder y las carpetas. |
| Web | La misma interfaz en https://ikral.com/studio/, con datos en el navegador (`src/database/idb.ts`). |
| Proyectos (Mac) | Carpeta `.ikral` con `proyecto.json` (guion, escenas, Biblia), `archivos.json` y `archivos/`. Hay respaldos y la app recarga sola si alguien edita el archivo (`src/database/fsdb.ts`). |
| Chat con Claude | La app escribe `chat-usuario.json` y Claude contesta en `chat-claude.json`. Claude Code escucha con `tools/claude-chat.mjs`. Los pedidos llevan un tipo (`character-preview`, `item-preview`, `frame-preview`, `item-suggestions`…). |
| Biblia | `project.bible` (estilo, época, lugar), `characters`, `locations`, `props`, `wardrobe`, `relations` y `mainLocationId`. «Canon» quiere decir que el elemento tiene `imageId` aprobado. |
| ANTES / DESPUÉS | **Todavía no existe como dato.** Hoy solo aparece escrito en las descripciones (por ejemplo, «comandas de papel (al inicio) y luego tablet»). |

## 2. Verificaciones que pediste

### 2.1 ¿IKRAL Studio cumple como «código abierto»?

- OpenAI ofrece compartir el plan de ChatGPT con «apps de código abierto y que corren en la máquina del usuario». Las apps «de pago o alojadas en un servidor» tienen que llenar un formulario de interés. **OpenAI no publica una definición formal** de «código abierto» ni pide una licencia en particular.
- IKRAL Studio **sí es código abierto de verdad**, no solo «corre en tu Mac»:
  - El repositorio `github.com/ikral-studio/ikral-studio` es **público**. Lo comprobé con `gh repo view`.
  - Su licencia es **AGPL-3.0**, una licencia de código abierto reconocida por la OSI.
- Hay dos puntos a cuidar:
  - La **versión web** está alojada en un servidor, así que **no califica** sin el formulario.
  - Si algún día IKRAL Studio se **vende** o se ofrece como servicio, entraría en «app de pago» y habría que llenar el formulario.
- Conclusión: la **app de escritorio** cumple con lo publicado. Es una **vista previa** («preview»), así que las reglas pueden cambiar.

### 2.2 Licencia del DevKit (`openai/sign-in-with-chatgpt-devkit`)

- Usa la «Sign-in with ChatGPT DevKit **Noncommercial** License v1.0». Solo permite usarlo con **fines no comerciales**, es decir, aprendizaje o pruebas personales sin uso comercial previsto. Cualquier uso «por o para un negocio» necesita **un acuerdo por escrito con OpenAI**.
- Esa licencia también pide que los cambios se publiquen bajo **esa misma licencia**. Eso choca con la AGPL de IKRAL Studio.
- El DevKit es para **Node/Electron**. IKRAL Studio usa **Tauri/Rust**, así que tampoco encaja directo.
- La licencia aclara que **llamar** al DevKit desde otro programa no convierte a ese programa en obra derivada. Aun así, empaquetarlo dentro de un producto comercial sí sería un problema.
- **Decisión recomendada: no usar código del DevKit.** Solo lo usamos como lectura de referencia.

### 2.3 Tu cuenta de ChatGPT: permisos, límites y costos

- Se autoriza por la vía oficial: entras en la página de OpenAI en el navegador y das permiso. No se usan cookies ni contraseñas.
- **Planes que pueden compartirse con otras apps:** ChatGPT **Plus y Pro**. Free, Business y Enterprise no aparecen como elegibles. Hay que confirmar cuál tienes; Codex dice «Logged in using ChatGPT».
- **Costo extra:** ninguno. Según OpenAI, «el uso cuenta dentro de los límites de tu plan; conectar una app no agrega una cuota nueva».
- **Límites:**
  - En **Plus**, el límite de 5 horas se comparte entre todas las apps (Codex incluido).
  - En **Pro** no existe ese límite de 5 horas.
  - En ChatGPT → Ajustes → Uso puedes poner a cada app un tope semanal del 10 % al 100 %, y desconectarla cuando quieras.
- **Lo que sí puede hacer:** leer **texto e imágenes** y devolver texto. Ese texto puede venir en un formato fijo (JSON).
- **Lo que no puede hacer:**
  - No genera imágenes por esta vía; para eso seguimos con Codex como hasta ahora.
  - No acepta audio ni video, ni subir archivos a OpenAI.
  - No guarda conversaciones en OpenAI (`store: false`), así que el historial lo guardamos nosotros.
- **No le da a la app acceso** a tus chats ni a tus memorias de ChatGPT.

### 2.4 Tres caminos posibles

| Camino | Cómo funciona | A favor | En contra |
|---|---|---|---|
| **A. Codex (recomendado)** | La app de escritorio ejecuta `codex exec` en modo **solo lectura**. Le pasa las imágenes (`-i`) y pide la respuesta en un formato fijo (`--output-schema`). | Ya está instalado y autorizado. Es oficial y Apache 2.0. **IKRAL no guarda ninguna llave.** No usa el DevKit. Es lo mismo que ya usamos para imágenes. | Depende de que Codex esté instalado. Es un poco más lento (unos segundos de arranque). |
| B. «Sign in with ChatGPT» propio | Escribimos en Rust el flujo oficial: navegador, `127.0.0.1`, PKCE, tokens en el Llavero y `POST /v1/responses` con streaming. | Es independiente de Codex y se ve integrado en la app. | Es más trabajo y seguridad delicada (tokens). Está en vista previa. Solo vale para escritorio. |
| C. Responses API con llave de pago | Usamos una llave de API en el Llavero, con un tope de gasto por mes. | Funciona también en la web. | **Cuesta dinero aparte.** Solo con tu permiso. |

**Recomendación:** empezar con **A**. Si un día se necesita sin Codex, pasamos a **B**. **C** queda solo como plan de respaldo.

## 3. Arquitectura mínima (camino A)

```
IKRAL Studio (app Mac)
  ├─ Panel «GPT · Guionista» (Biblia y escenas)  ← nuevo, solo muestra y pide
  │        │ botón «Revisar continuidad»
  │        ▼
  ├─ Rust: comando revisar_con_gpt(carpeta)       ← nuevo
  │        1. arma un «paquete» de la Biblia (texto + miniaturas)
  │        2. codex exec --sandbox read-only --ephemeral -i <imágenes> --output-schema <formato>
  │        3. guarda el resultado en gpt-revisiones.json (escritura atómica)
  │
  ├─ proyecto.json  ← MISMA fuente de verdad para Claude y GPT (GPT no la escribe)
  └─ Chat con Claude ← sin cambios
```

- GPT **no escribe** en `proyecto.json`. Solo deja propuestas en `gpt-revisiones.json`. Cuando tú tocas **Aceptar**, la app aplica el cambio con las acciones que ya existen, con deshacer y respaldo.
- Claude puede leer `gpt-revisiones.json` y `project.decisions` para trabajar con lo mismo.

## 4. La misma Biblia para los dos

- El **«paquete de contexto»** se arma desde `proyecto.json`:
  - Guion de cada escena en orden.
  - Estilo de la Biblia.
  - Personajes, locaciones, objetos y vestuario, con su descripción.
  - Imágenes Canon e imágenes inicial y final aprobadas, como miniaturas para gastar menos.
  - Locación principal.
  - Decisiones aprobadas.
- Datos nuevos propuestos (pequeños, opcionales y compatibles con proyectos viejos):
  - `project.phases` = `[{ id, name }]`, por ejemplo «ANTES (comandas de papel)» y «DESPUÉS (con la app)».
  - `scene.phaseId`: en qué etapa ocurre cada escena.
  - En objetos y locaciones, `onlyIn?: phaseId[]`. Por ejemplo, «Comandas de papel» va solo en ANTES y «Tablet LISTO ✓» solo en DESPUÉS.
  - `project.decisions` = `[{ id, text, by: 'kyo'|'claude'|'gpt', at, from? }]`: reglas aprobadas que los dos deben respetar. Por ejemplo: «La plancha siempre a la izquierda».
- Se documenta en `docs/carpeta-del-proyecto.md` para que Claude también lo use.

## 5. Revisión de continuidad

1. **Sin IA, en la misma app (gratis e instantáneo):**
   - Avisa si un objeto con `onlyIn` aparece mencionado en el guion de una escena de otra etapa.
   - Avisa si un personaje o una locación del guion no tiene Canon.
2. **Con GPT (imágenes + texto):**
   - Recibe el paquete y las imágenes de cada escena con su etapa.
   - Devuelve hallazgos con un formato fijo: `{ severidad, escena, elemento, imagen, problema, evidencia, sugerencia }`.
   - Ejemplo: «Escena 8 (DESPUÉS): en la imagen inicial se ven comandas de papel colgadas; deberían ser la tablet».
3. **Revisión humana:** cada hallazgo tiene **Aceptar / Descartar / Pedir a Claude que lo arregle**. Nada cambia el Canon solo.

## 6. Dónde se guarda el historial de GPT

- `gpt-revisiones.json` va en la carpeta del proyecto, junto a `chat-claude.json`:
  ```json
  { "revisiones": [ { "id", "at", "modelo", "alcance": "todo|escena", "hallazgos": [ { "id", "severidad", "sceneId?", "itemId?", "mediaId?", "problema", "evidencia", "sugerencia", "estado": "pendiente|aceptado|descartado" } ] } ] }
  ```
- Las decisiones que apruebas pasan a `project.decisions`. Esa es la fuente única que leen Claude y GPT.
- No se guardan tokens ni contraseñas: la sesión la maneja Codex.

## 7. Plan de implementación (cuando lo autorices)

| Paso | Qué se hace | Se puede probar |
|---|---|---|
| 1 | Confirmar tu plan (Plus o Pro) y hacer una prueba de Codex con 2 imágenes y un formato fijo, **sin tocar la app**. | Sí: ¿detecta las comandas? |
| 2 | Datos: `phases`, `phaseId`, `onlyIn` y `decisions`. Tipos y pruebas unitarias. | Sí |
| 3 | Revisión sin IA (reglas ANTES/DESPUÉS) en la Biblia. | Sí |
| 4 | Comando Rust `revisar_con_gpt` (solo lectura, con tiempo límite y cancelación). | Sí |
| 5 | Panel «GPT · Guionista» con hallazgos y Aceptar/Descartar. | Sí |
| 6 | Documentar para Claude y escribir la bitácora. | — |

## Riesgos y cuidados

- Es una **vista previa** de OpenAI: los límites o las reglas pueden cambiar.
- En **Plus**, revisar muchas imágenes puede gastar tu límite de 5 horas, que comparte con Codex. Por eso se mandan miniaturas y solo las escenas necesarias.
- La versión **web** queda sin GPT (a menos que elijamos el camino C).
- **No se toca la conexión con Claude.**

## Fuentes revisadas

- https://developers.openai.com/siwc/quickstart
- https://developers.openai.com/siwc/token-sharing-open-source (y sus páginas «sign-in», «profiles-and-sessions», «models-and-inference», «preview-limitations»)
- https://learn.chatgpt.com/docs/sign-in-with-chatgpt
- https://github.com/openai/sign-in-with-chatgpt-devkit (LICENSE, docs/security.md, packages/local/src)
- https://github.com/openai/codex (LICENSE Apache 2.0) y `codex exec --help`
