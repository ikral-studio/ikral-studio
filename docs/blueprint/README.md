# Blueprint con checklist (IKRAL Studio)

La **fuente oficial** del proyecto es su ficha en el Panel de IKRAL. Este Blueprint es el borrador que la
sesión del Panel registra (DS-010). Mientras tanto, vive aquí y se valida con pruebas.

## Archivos

- `docs/blueprint/ikral-studio.json` — el Blueprint (formato `ikral-blueprint/1`). Se edita este.
- `PLAN.md` — la versión para leer (la pide DS-010). Se genera; no se edita a mano.
- `tools/blueprint-core.mjs` — reglas (validar, resumir, actualizar con evidencia, generar PLAN.md).
- `tools/blueprint.mjs` — `npm run blueprint`.

## Cada tarea

`id`, `fase`, `titulo`, `criterio` (cómo se sabe que está hecha), `estado`
(`pendiente` / `en curso` / `bloqueado` / `hecho`), `responsable`, `fecha`, `evidencia`, `dependeDe`,
`siguiente` (el próximo paso o qué la desbloquea) y `director` (casilla manual).

## Reglas

1. **«hecho» solo con evidencia verificable:** un commit que existe en el repo, una prueba, una URL `https://`
   o una decisión con `"por": "director"`.
2. **Un comentario o un acuse nunca cuentan.** El validador los rechaza como evidencia.
3. **La casilla `director`** (`{ "aprobado": true, "fecha": "AAAA-MM-DD" }`) solo la marca el director, y solo en
   tareas hechas. Ningún programa la marca. Es el «✅ aprobada» de DS-010.
4. Una tarea `bloqueado` debe decir en `siguiente` qué la desbloquea.

## Comandos

- `npm run blueprint` — valida (los commits deben existir) y reescribe `PLAN.md`. Con errores, no escribe nada.
- `npm run blueprint -- --aplicar` — busca commits cuyo asunto coincide con `verificar.asunto` de una tarea
  (por ejemplo `^Fase 3d `). Solo si **en ese momento** pasan `npm test` y `npm run build`, la marca «hecho» con
  el commit y la comprobación como evidencia. Si fallan, no cambia nada.

## Monitor

El Monitor IKRAL lee el resumen (hechas de total, fase actual, siguiente, bloqueos) y lo enseña en la tarjeta y
el detalle del proyecto. Ver `docs/monitor-multiproyecto.md`.

## Retomar desde otra cuenta o sesión

1. Leer el Issue #1 de `ikral-studio/coordinacion`, `PLAN.md` y la última entrada de `../BITACORA.md`.
2. `npm run blueprint` para ver el estado real y la siguiente tarea.
3. Al terminar una tarea: commit con el asunto que pide su `verificar.asunto`, y `npm run blueprint -- --aplicar`.
