# Alcance · Fase 1: Continuidad narrativa y Biblia compartida

Fecha: 2026-10-23. Estado: **propuesta. No se ha tocado código.**

## Resumen sencillo

- Cada proyecto podrá tener **etapas** (por ejemplo ANTES, TRANSICIÓN y DESPUÉS).
- Cada escena dice en qué etapa ocurre.
- Cada objeto o locación puede decir en qué etapas **sí puede aparecer**.
- Habrá una lista de **decisiones aprobadas** (reglas del director) que leen Claude y GPT.
- Un **auditor sin IA** revisa el guion y avisa de contradicciones, por ejemplo «comandas de papel en una escena DESPUÉS».
- **Nada cambia solo:** el auditor solo avisa.
- Los proyectos viejos siguen igual. Los respaldos, el deshacer y Claude no cambian.
- **Sin GPT todavía.**

## Datos nuevos (todos opcionales, así los proyectos viejos abren igual)

En `src/types/index.ts`:

```ts
interface Phase { id: string; name: string; note?: string }      // «ANTES (comandas de papel)»
interface Decision { id; text; proposedBy: 'director'|'claude'|'gpt'; proposedAt; status: 'proposed'|'approved'|'rejected'; approvedBy?: 'director'; approvedAt?; sceneIds?; itemIds?; allowsBackstep?; updatedAt }  // ver plan maestro, corrección 2

Project.phases?: Phase[]          // en orden: ANTES → TRANSICIÓN → DESPUÉS
Project.decisions?: Decision[]    // reglas aprobadas que Claude y GPT deben respetar
Scene.phaseId?: string            // en qué etapa ocurre la escena
BibleItem.onlyIn?: string[]       // etapas donde SÍ puede aparecer (vacío o sin dato = en todas)
BibleItem.aliases?: string[]      // otros nombres para encontrarlo en el guion: «papelitos», «tickets»
```

- **Migración:** no hace falta convertir nada ni cambiar `version: 1`. Si un campo no existe, se trata como «sin etapas».
- Una función `cleanContinuity()` quita las referencias a etapas borradas. Se aplica al cargar y al borrar una etapa, para que el archivo quede siempre coherente.

## Reglas del auditor sin IA

Revisa el texto de cada escena: acción, diálogo, cámara, prompt de generación y prompts de imagen inicial y final. Busca los nombres y alias de cada objeto o locación, sin importar mayúsculas ni acentos.

| # | Regla | Gravedad |
|---|---|---|
| 1 | El objeto o la locación se menciona en una escena cuya etapa **no está** en su `onlyIn` | **alta** |
| 2 | Igual que la regla 1, pero la mención está negada («ya no hay comandas», «sin papelitos») | **revisar** (es ambigua, no un error) |
| 3 | Hay etapas definidas y la escena no tiene etapa | baja |
| 4 | El orden de las escenas retrocede de etapa (DESPUÉS → ANTES) sin una decisión que lo permita (por ejemplo un flashback) | revisar |
| 5 | Un `onlyIn` o un `phaseId` apunta a una etapa que ya no existe | baja (se limpia sola) |

**Cada hallazgo trae:**

- Tipos de datos: `{ id, regla, gravedad, sceneId, itemId?, campo, cita, problema, sugerencia }`.
- `cita` es el pedacito exacto de texto donde aparece.
- Los hallazgos se calculan cada vez que se necesitan y **no se guardan** en el proyecto. Así no se ensucia la fuente de verdad.

## Archivos

### Nuevos

| Archivo | Qué tiene |
|---|---|
| `src/features/continuity/continuity.ts` | Funciones puras: `cleanContinuity`, `phaseOf`, `itemMentions` (nombre y alias, sin acentos, detecta negación cercana) y `auditContinuity(project, scenes)`. |
| `src/features/continuity/examples.ts` | **Casos de ejemplo** correctos, incorrectos y ambiguos, incluido el de los papelitos. Los usan las pruebas de ahora y después la prueba de GPT (Fase 2). |
| `src/components/bible/ContinuitySection.tsx` | Sección nueva en la Biblia, «Etapas y decisiones»: crear, renombrar, ordenar y quitar etapas; lista de decisiones; botón «Revisar continuidad» con los hallazgos (ir a la escena, «Entendido»). |

### Cambiados

| Archivo | Cambio |
|---|---|
| `src/types/index.ts` | Agrega los tipos y campos de arriba. |
| `src/stores/projectStore.ts` | Agrega las acciones `addPhase`, `renamePhase`, `movePhase`, `removePhase` (limpia referencias), `setScenePhase`, `addDecision`, `updateDecision` y `removeDecision`. Todas usan `commit` (deshacer) y el guardado de siempre (respaldos). |
| `src/components/bible/BibleScreen.tsx` | Muestra la sección nueva. |
| `src/components/bible/CharacterSheet.tsx` | En la ficha de locaciones y objetos agrega «Aparece en:», con un botón por etapa, y el campo «Otros nombres» (alias). |
| `src/components/bible/FramesPanel.tsx` | En cada escena agrega un selector de etapa. |

### Documentos y pruebas

| Archivo | Cambio |
|---|---|
| `docs/carpeta-del-proyecto.md` | Explica `phases`, `phaseId`, `onlyIn`, `aliases` y `decisions` para Claude. Regla para Claude: **leer siempre las decisiones y respetarlas**. |
| `src/tests/continuity.test.ts` (nuevo) | Pruebas del auditor y de la limpieza. |
| `src/tests/store.test.ts` | Pruebas de las acciones nuevas, el deshacer y la persistencia. |
| `tests-e2e/acceptance.spec.ts` | Una prueba completa en la página publicada. |

**No se tocan:**

- `tools/claude-chat.mjs`, `src-tauri/` y `ClaudeChat.tsx`.
- `fsdb.ts`, `merge.ts` y el formato de respaldos. Los campos nuevos viajan solos dentro de `project` y `scenes`.

## Pruebas

### Unitarias del auditor (`continuity.test.ts`)

1. **Papelitos, caso incorrecto:** el objeto «Comandas de papel» (alias «papelitos», «tickets») solo puede estar en ANTES. La escena 8 es DESPUÉS y dice «Beto cuelga los papelitos». Debe salir 1 hallazgo **alto**, con la cita «papelitos».
2. **Tablet, caso incorrecto:** la «Tablet de pedidos» solo puede estar en DESPUÉS. La escena 1 es ANTES y la menciona. Debe salir un hallazgo **alto**.
3. **Caso correcto:** las comandas aparecen en ANTES y la tablet en DESPUÉS. No debe salir ningún hallazgo.
4. **Caso correcto en TRANSICIÓN:** en esa escena se permiten las comandas y la tablet. No debe salir ningún hallazgo.
5. **Caso ambiguo:** la escena DESPUÉS dice «ya no hay comandas de papel». El hallazgo debe ser **revisar**, no alto.
6. **Caso ambiguo:** «papel» suelto en «servilleta de papel» **no** debe contar como «Comandas de papel». Solo cuentan el nombre completo o los alias.
7. Mayúsculas y acentos: «COMANDAS», «Comándas» y «comandas» se detectan igual.
8. Una escena sin etapa, cuando sí hay etapas, da un hallazgo **bajo**.
9. Si se va de DESPUÉS a ANTES, sale **revisar**. Si hay una decisión de flashback para esa escena, no sale nada.
10. Un proyecto viejo, sin `phases`: el auditor no da hallazgos y no falla.
11. Al quitar una etapa, `cleanContinuity` limpia `onlyIn` y `phaseId`.

### Unitarias del store (`store.test.ts`)

12. `addPhase`, `renamePhase` y `movePhase` cambian el orden y los nombres.
13. `removePhase` quita las referencias y **Deshacer** las devuelve todas.
14. `setScenePhase` actualiza el `updatedAt` de la escena, para que la unión con lo que escribe Claude funcione.
15. Las acciones de decisiones (agregar, editar y quitar) se pueden deshacer.
16. Guardar y volver a cargar el proyecto conserva `phases`, `decisions`, `phaseId`, `onlyIn` y `aliases`.

### Completas (Playwright, en https://ikral.com/studio/ después de subir)

17. Pasos:
    - Crear el proyecto y las etapas ANTES y DESPUÉS.
    - Crear el objeto «Comandas de papel» solo en ANTES.
    - Crear una escena en DESPUÉS que diga «papelitos».
    - Tocar «Revisar continuidad».
    - Debe aparecer el aviso.
    - Al corregir el texto, el aviso desaparece.
18. Las 33 pruebas actuales y las 58 unitarias deben seguir pasando.

## Cómo se entrega

1. Se hace en este orden: tipos y funciones puras con sus pruebas, luego el store, luego la interfaz y la documentación.
2. Se revisa con `npm test`, `npm run build` y `oxlint`.
3. Se instala la app.
4. Se sube la página **con respaldo antes**.
5. Se corre Playwright en la página publicada.
6. Se hace el commit y se anota la bitácora.

**Antes de tocar `proyecto.json` real:** no se migra nada. El proyecto «Sin cebolla» seguirá igual hasta que tú le agregues etapas.

## Lo que queda para la Fase 2 (no ahora)

- La revisión con Codex/GPT, usando `examples.ts` y las imágenes.
- El archivo `gpt-revisiones.json` y el panel «GPT · Guionista».
