# Blueprint · IKRAL Studio

> Generado desde `docs/blueprint/ikral-studio.json` con `npm run blueprint`. No editar a mano.
> Fuente oficial: la ficha del proyecto en el Panel de IKRAL. «hecho» solo con evidencia verificable; ✅ = aprobada por el director.

**Avance:** 14 de 23 hechas · 0 en curso · 4 bloqueadas · 5 pendientes · 0 aprobadas por el director.
**Siguiente:** 2.pub · Publicar Fase 2 y probar en la página real

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
- [ ] **2.pub · Publicar Fase 2 y probar en la página real** — Director
  - Criterio: Autorización expresa del director, respaldo verificado y Playwright en la página publicada.
  - Depende de: 2d
  - Siguiente: Esperar autorización del director para publicar.

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
- [ ] **3d · «Consultar GPT» en cobertura y planos** — Claude
  - Criterio: Proponer planos (cámara y duración) y diseñar cámara y prompts por plano; nada cambia sin «Aceptar».
  - Depende de: 3c
  - Siguiente: Siguiente etapa del encadenamiento 3a → 4 (la toma el puente).
- [ ] **3e · «Consultar GPT» en edición** — Claude
  - Criterio: Ritmo, orden y duración como propuestas que decide el director.
  - Depende de: 3d
- [!] **3.real · Prueba real con Codex en la app de Mac** — Director
  - Criterio: Los casos de examples.ts dan los hallazgos esperados con GPT de verdad (pocas veces, sin gastar límite).
  - Depende de: 3a
  - Siguiente: Requiere instalar la app de Mac y una sesión con Codex: autorización del director.

## Fase 4 · Biblia de Producción PDF

- [ ] **4 · Biblia de Producción PDF** — Claude
  - Criterio: El Portafolio actual no cambia; la Biblia incluye todas las secciones con datos; proyectos viejos también la generan.
  - Depende de: 3e
- [!] **4.pub · Descargar la Biblia en la página publicada (Playwright)** — Director
  - Criterio: La Biblia descargada en https://ikral.com/studio/ abre bien.
  - Depende de: 4
  - Siguiente: Requiere autorización expresa para publicar.

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
  - Siguiente: Dejar NOTA para «Panel ikral» con docs/panel/traspaso-ikral-studio.md.
- [!] **P6 · Respaldo remoto en GitHub (push verificado)** — Director
  - Criterio: Revisión previa limpia (npm run revisar-respaldo) y push con autorización; el remoto tiene el mismo commit que el local.
  - Siguiente: El repositorio es público: subir los commits locales = publicarlos. Necesita autorización expresa del director.

## Enlaces

- repositorio: https://github.com/ikral-studio/ikral-studio
- coordinacion: https://github.com/ikral-studio/coordinacion/issues/1
- plan: docs/plan-maestro-ikral-studio.md
- bitacora: ../BITACORA.md
- publicado: https://ikral.com/studio/
