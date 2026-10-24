# Respaldo y recuperación (IKRAL Studio)

## Commit local ≠ respaldo

- Un **commit local** guarda la historia solo en este Mac. Si el disco falla, se pierde.
- Un **respaldo remoto** existe cuando el `git push` termina bien **y** se comprueba que GitHub tiene el mismo
  commit (`git rev-parse HEAD` igual a `git rev-parse @{u}` después de `git fetch`).
- El respaldo completo verificado en la unidad C (`/Volumes/c/respaldos/ikral-studio/`) se hace al cerrar una
  entrega, antes de publicar (regla 11).

## Estado al 2026-10-24

- `origin` = `github.com/ikral-studio/ikral-studio`, **público**.
- Hay 46+ commits solo locales. Hacer push = **publicar** el código: necesita autorización del director.
- Revisión: `npm run revisar-respaldo` (solo lee). Hoy marca 3 avisos, los tres revisados y sin secreto real:
  - `public/fonts/OFL-Lato.txt`: correo de la licencia de la fuente (es público).
  - `tools/coord-monitor.test.mjs`: token y correo **falsos** de una prueba de privacidad.
- Sin archivos de más de 5 MB. `node_modules`, `dist`, videos de prueba y `src-tauri/target` están en `.gitignore`.

## Antes de proponer un push

1. `npm run revisar-respaldo` y revisar cada aviso (privacidad, archivos sin seguimiento, secretos, pesados).
2. `npm test` y `npm run build` en verde.
3. Confirmar con el director: el repo es público. Otra opción que él puede decidir: volverlo privado antes.
4. Con su «sí»: `git push`, luego `git fetch` y comprobar que `HEAD` y `@{u}` son iguales.

## Receta de recuperación

- **Volver a un commit anterior (sin perder nada):** `git log --oneline`, luego `git switch -c rescate <commit>`.
- **Recuperar un archivo:** `git restore --source <commit> -- <ruta>`.
- **Algo se borró por error:** `git reflog` enseña dónde estaba `HEAD`; `git switch -c rescate <entrada>`.
- **Mac nuevo o disco dañado:** `git clone https://github.com/ikral-studio/ikral-studio.git` (solo trae lo que
  ya tenga push), después `npm ci`, `npm test`, `npm run build`. Lo no subido sale del respaldo en la unidad C.
- **Estado del puente** (`~/Library/Application Support/ikral-coord`): no es código; se vuelve a crear solo.
  El Blueprint y PLAN.md sí están en el repo.
