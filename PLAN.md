# Blueprint · IKRAL Studio

> Generado desde `docs/blueprint/ikral-studio.json` con `npm run blueprint`. No editar a mano.
> Fuente oficial: la ficha del proyecto en el Panel de IKRAL. «hecho» solo con evidencia verificable; ✅ = aprobada por el director.

**Avance:** 20 de 32 hechas · 3 en curso · 6 bloqueadas · 3 pendientes · 0 aprobadas por el director.
**Siguiente:** UX1 · «🎬 Planos de cámara» a la vista (adiós «Cobertura» escondida)

Casillas: `[x]` hecho · `[~]` en curso · `[!]` bloqueado · `[ ]` pendiente.

## Fase 1 · Continuidad narrativa

- [x] **1.1 · Tipos, auditor sin IA y pruebas** — Claude · 2026-10-24
  - Criterio: Auditor con 5 reglas; caso «papelitos en DESPUÉS» = aviso alto; «ya no hay comandas» = revisar.
  - Evidencia: commit `cf9dbef` · prueba: src/tests/continuity.test.ts (20 pruebas)
- [x] **1.2 · Etapas y decisiones en el store (Deshacer, unir por id)** — Claude · 2026-10-24
  - Criterio: Quitar una etapa limpia sus referencias y Deshacer las devuelve; una decisión de Claude no se pierde al editar a la vez.
  - Evidencia: commit `cf9dbef` · prueba: src/tests/continuityStore.test.ts (10 pruebas)
  - Depende de: 1.1
- [x] **1.3 · Interfaz «Etapas y decisiones» y «Revisar continuidad»** — Claude · 2026-10-24
  - Criterio: Solo el director aprueba decisiones; proyecto viejo abre igual y sin avisos.
  - Evidencia: commit `cf9dbef` · prueba: tests-e2e/acceptance.spec.ts (prueba «papelitos»)
  - Depende de: 1.2
- [x] **1.4 · Fase 1 publicada y probada en la página real** — Claude · 2026-10-24
  - Criterio: Respaldo verificado antes; Playwright pasa en la página publicada.
  - Evidencia: https://ikral.com/studio/ · prueba: 34/34 Playwright en la página publicada (bitácora 2026-10-24 00:15)
  - Depende de: 1.3

## Fase 2 · Cobertura cinematográfica

- [x] **2a · Planos: datos, shotsOf y JSON v2** — Claude · 2026-10-24
  - Criterio: Escena sin planos = 1 plano implícito; JSON v1 igual que hoy; v2 ida y vuelta; exportar v1 avisa qué se pierde.
  - Evidencia: commit `52c670f` · prueba: src/tests/coverage.test.ts (19 pruebas)
  - Depende de: 1.3
- [x] **2b · Panel «Cobertura de escena» y «Pasar a cobertura»** — Claude · 2026-10-24
  - Criterio: Respaldo automático y Deshacer; ninguna imagen ni video se pierde.
  - Evidencia: commit `ec1abf6`
  - Depende de: 2a
- [x] **2c · Edición, línea de tiempo, reproductor y NLE por plano** — Claude · 2026-10-24
  - Criterio: Duración de la escena = suma de planos; NLE un clip por plano.
  - Evidencia: commit `320a936` · prueba: src/tests/coveragePlayback.test.ts (8) y 1 Playwright
  - Depende de: 2b
- [x] **2d · Imagen inicial y final por plano con Claude (shot-preview)** — Claude · 2026-10-24
  - Criterio: Pedido shot-preview documentado; imágenes ligadas al id del plano.
  - Evidencia: commit `3c2b696` · prueba: src/tests/shotFrames.test.ts (7) y 1 Playwright
  - Depende de: 2c
- [!] **2.pub · Publicar Fase 2 y probar en la página real** — Director
  - Criterio: Autorización expresa del director, respaldo verificado y Playwright en la página publicada.
  - Depende de: 2d
  - Siguiente: Publicar no está autorizado aún. La web publicada tiene solo la Fase 1; las Fases 2–4 se publicarían juntas, con el respaldo C2 antes.
- [~] **UX1 · «🎬 Planos de cámara» a la vista (adiós «Cobertura» escondida)** — Claude · 2026-10-24
  - Criterio: En Edición y Preproducción: bloque visible con explicación llana, botón destacado «Dividir escena en tomas», luego «Agregar toma», contador y «Ver/editar tomas»; nada cambia hasta el clic; Deshacer y datos intactos. El director lo ve en la app instalada.
  - Evidencia: prueba: tests-e2e/acceptance.spec.ts «planos de cámara a la vista en Edición» (43 de 43 e2e en verde) · prueba: capturas docs/qa/2026-10-24-planos-de-camara/ (antes de dividir y con 2 tomas) · decisión del director: Issue #1, 2026-10-24: «lo modificamos de una vez» (nombre «🎬 Planos de cámara» y botón grande) · prueba: Sesión interactiva 2026-10-24 13:30: npm run app:build OK (commit 47e640f) e instalada en /Applications/IKRAL Studio.app; abre. App anterior respaldada en /Volumes/c/respaldos/ikral-studio/app-anterior-20261024-1330
  - Depende de: 2b
  - Siguiente: Que el director abra IKRAL Studio, entre a Edición y vea «🎬 Planos de cámara».

## Fase 3 · ChatGPT integrado

- [x] **3a · Revisión de continuidad con GPT (texto + imágenes)** — Claude · 2026-10-24
  - Criterio: Codex solo lectura; propuestas no destructivas; en la web avisa «Disponible en la app de Mac».
  - Evidencia: commit `ae80fed` · prueba: src/tests/gpt.test.ts (14 con mocks)
  - Depende de: 2d
- [x] **3b · «Consultar GPT» en guion y diálogos** — Claude · 2026-10-24
  - Criterio: Hilos con historial; propuestas con Aceptar/Editar/Descartar/Pedir a Claude y Deshacer.
  - Evidencia: commit `824587b` · prueba: src/tests/gptScript.test.ts (16 con mocks) y 1 e2e
  - Depende de: 3a
- [x] **3c · «Consultar GPT» en personajes y Biblia** — Claude · 2026-10-24
  - Criterio: Paquete por apartado con solo decisiones aprobadas; reglas de GPT aprobadas por el director.
  - Evidencia: commit `5c55e8d` · prueba: src/tests/gptBible.test.ts (16 con mocks) y 1 e2e
  - Depende de: 3b
- [x] **3d · «Consultar GPT» en cobertura y planos** — Claude · 2026-10-24
  - Criterio: Proponer planos (cámara y duración) y diseñar cámara y prompts por plano; nada cambia sin «Aceptar».
  - Evidencia: commit `a309b3a` · prueba: src/tests/gptCoverage.test.ts (16 con mocks) y 1 e2e · prueba: npm test y npm run build pasaron (comprobación automática 2026-10-24)
  - Depende de: 3c
- [x] **3e · «Consultar GPT» en edición** — Claude · 2026-10-24
  - Criterio: Ritmo, orden y duración como propuestas que decide el director.
  - Evidencia: commit `7da8b8c` · prueba: src/tests/gptEdit.test.ts (16 con mocks) y 1 e2e · prueba: npm test y npm run build pasaron (comprobación automática 2026-10-24)
  - Depende de: 3d
- [!] **3.real · Prueba real con Codex en la app de Mac** — Director
  - Criterio: Los casos de examples.ts dan los hallazgos esperados con GPT de verdad (pocas veces, sin gastar límite).
  - Depende de: 3a
  - Siguiente: 2026-10-24: Codex real responde (1 llamada, sesión de ChatGPT). Arreglado que la app no encontraba Codex en ~/.npm-global/bin. Falta un clic del director en «Consultar GPT» dentro de la app.

## Fase 4 · Biblia de Producción PDF

- [x] **4 · Biblia de Producción PDF** — Claude · 2026-10-24
  - Criterio: El Portafolio actual no cambia; la Biblia incluye todas las secciones con datos; proyectos viejos también la generan.
  - Evidencia: commit `7e64822` · prueba: src/tests/productionBible.test.ts (12) y 1 e2e local que descarga el PDF (cabecera %PDF-) · prueba: npm test y npm run build pasaron (comprobación automática 2026-10-24)
  - Depende de: 3e
- [!] **4.pub · Descargar la Biblia en la página publicada (Playwright)** — Director
  - Criterio: La Biblia descargada en https://ikral.com/studio/ abre bien.
  - Depende de: 4
  - Siguiente: Requiere autorización expresa para publicar.

## Fase C · Cierre y lanzamiento de Studio

- [x] **C0 · QA visual en el Mac: novedades visibles** — Claude · 2026-10-24
  - Criterio: App instalada es la última; cobertura, planos, GPT y Biblia PDF se ven y se alcanzan desde Edición; capturas y demo de 3 pasos.
  - Evidencia: prueba: docs/qa/2026-10-24-qa-visual.md · prueba: docs/qa/2026-10-24-capturas/ (13 capturas) y e2e «cobertura visible en Edición»
  - Depende de: 4
- [!] **C1 · Primer flujo completo de punta a punta con un proyecto de ejemplo** — Director
  - Criterio: En la app de Mac: etapas → guion → cobertura → Consultar GPT real (aceptar y deshacer) → Biblia de Producción PDF que abre y se lee bien. Hoy solo hay e2e por partes en la web, con GPT simulado.
  - Depende de: 4, 3.real
  - Siguiente: Autorizado (2026-10-24, comentario 6388369161). Depende de 3.real, bloqueado por permisos de la sesión automática del puente.
- [ ] **C2 · Respaldo único verificado antes de publicar** — Claude
  - Criterio: Un respaldo completo en /Volumes/c/respaldos/ikral-studio/ que se abre y se restaura; el último es studio-20261024-000702-antes-fase1.tgz (antes de las Fases 2–4).
  - Depende de: 4
  - Siguiente: Hacerlo una sola vez, justo cuando el director autorice publicar.

## Fase P · Puente, monitor y registro en IKRAL

- [x] **P1 · Puente ChatGPT → Claude con cola, reintento y encadenamiento** — Claude · 2026-10-24
  - Criterio: Una tarea por vez, candado con PID, 1 reintento, deduplicación, paro ante fallo.
  - Evidencia: commit `e04b574` · commit `f5c5a0c` · prueba: tools/coord-bridge.test.mjs
- [x] **P2 · Monitor IKRAL multiproyecto (solo lectura)** — Claude · 2026-10-24
  - Criterio: Estados reales, Sin señal por proyecto, No conectado sin puente, origen verificable, sin rutas ni llaves.
  - Evidencia: commit `cf4228d` · commit `da82e93` · prueba: tools/coord-monitor.test.mjs
  - Depende de: P1
- [!] **P3 · Acceso «Monitor IKRAL» en el Escritorio real** — Claude
  - Criterio: Enlace creado en ~/Desktop que abre el monitor real.
  - Evidencia: commit `6286fe0`
  - Depende de: P2
  - Siguiente: Correr una vez `npm run acceso-monitor` desde una sesión con permiso de escribir en el Escritorio.
- [x] **P4 · Blueprint con checklist y validador de evidencia** — Claude · 2026-10-24
  - Criterio: «hecho» solo con evidencia verificable; un comentario o acuse nunca cuenta; resumen en el monitor.
  - Evidencia: prueba: tools/blueprint.test.mjs · commit `f6c7955` · prueba: npm test y npm run build pasaron (comprobación automática 2026-10-24)
  - Depende de: P2
- [ ] **P5 · Ficha de IKRAL Studio en el Panel** — Panel ikral
  - Criterio: La sesión del Panel registra la ficha (Blueprint, inventario, bitácora) con el «sí» del director.
  - Depende de: P4
  - Siguiente: Pospuesto por decisión del director (Issue #1, 2026-10-24): primero terminar Studio. Luego, NOTA para «Panel ikral» con docs/panel/traspaso-ikral-studio.md.
- [!] **P6 · Respaldo remoto en GitHub (push verificado)** — Director
  - Criterio: Revisión previa limpia (npm run revisar-respaldo) y push con autorización; el remoto tiene el mismo commit que el local.
  - Siguiente: El repositorio es público: subir los commits locales = publicarlos. Necesita autorización expresa del director.

## Fase M · IKRAL Mini Monitor para Mac (Issue #4)

- [x] **M1 · Datos del Mini Monitor (mini.json) desde el puente** — Claude · 2026-10-24
  - Criterio: «Ahora» y «Te necesito» ≤200, «Sin señal» con datos viejos, cuota solo con fuente verificable; pruebas.
  - Evidencia: prueba: tools/mini-monitor.test.mjs · commit `73ea229` · prueba: npm test y npm run build pasaron (comprobación automática 2026-10-24)
- [~] **M2 · App «IKRAL Monitor.app» (ventana + barra de menús + voz)** — Claude · 2026-10-24
  - Criterio: Compila con swiftc; la ventana se cierra, minimiza y restaura; icono arriba con menú y «Abrir ventana»; ▶ Escuchar estado.
  - Evidencia: prueba: npm run mini-monitor:compilar OK en sesión interactiva; la app abre (proceso IKRAL Monitor activo)
  - Depende de: M1
  - Siguiente: Probar a mano: cerrar, minimizar, restaurar, menú de la barra y ▶ Escuchar estado (M5).
- [~] **M3 · Instalada en /Applications, acceso en Escritorio y en el Dock** — Claude · 2026-10-24
  - Criterio: npm run mini-monitor:instalar sin duplicados; abre y restaura la app desde los tres.
  - Evidencia: prueba: npm run mini-monitor:instalar dos veces: /Applications/IKRAL Monitor.app, 1 acceso en Escritorio, 1 en el Dock (sin duplicados)
  - Depende de: M2
  - Siguiente: Probar a mano que abre y restaura desde Escritorio, Dock y barra de menús (M5).
- [x] **M4 · Cuota de Claude Code (sesión y semana) con fuente autorizada** — Claude · 2026-10-24
  - Criterio: Solo con dato oficial verificable en usage.json (rate_limits de la statusLine de Claude Code); dos barras sesión/semana con reinicio y «última lectura»; si no, lo dice + «Ver uso en Claude».
  - Evidencia: prueba: tools/mini-monitor.test.mjs: statusLine→usage.json (ausencia, JSON malo, lectura antigua, reinicio, cuenta, sesión nueva, privacidad 600, encadenado) en verde; app compila con swiftc · prueba: Sesión interactiva 14:05: conectar-uso (respaldo /Volumes/c/respaldos/ikral-studio/claude-settings-antes-de-M4.json), app recompilada e instalada; mini.json: «Sesión 97% (reinicia 15:10) · Semana 9% (reinicia jue 01:00)», igual que claude.ai/settings/usage
  - Depende de: M1
  - Siguiente: Nada.
- [ ] **M5 · Pruebas de escritorio y capturas** — Claude
  - Criterio: Visible, minimizada y restaurada; sin duplicados; datos viejos → «Sin señal»; voz; pantalla completa oculta la barra.
  - Depende de: M3
  - Siguiente: Tras M3, en la sesión interactiva.

## Enlaces

- repositorio: https://github.com/ikral-studio/ikral-studio
- coordinacion: https://github.com/ikral-studio/coordinacion/issues/1
- plan: docs/plan-maestro-ikral-studio.md
- bitacora: ../BITACORA.md
- publicado: https://ikral.com/studio/
