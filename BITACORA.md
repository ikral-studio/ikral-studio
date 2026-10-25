2026-10-24 21:23 · IKRAL Studio · Botón GPT | Claude en la barra
- Agregado: [código] src/components/gpt/AssistantSlot.tsx — hueco en la barra de la línea de tiempo.
- Cambiado: [código] GptBridge.tsx y ClaudeQuick.tsx — el botón va junto a «Consultar GPT»; la ventanita de Claude abre arriba a la derecha.
- Arreglado: el botón flotante tapaba las pistas de música.
- Publicado: no.
- Commit: 102a126
- Pendiente: instalar en la Mac.

2026-10-24 20:50 · IKRAL Studio · Instalada en la Mac (Generar con locaciones)
- Cambiado: [código] /Applications/IKRAL Studio.app — Generar también hace locaciones con imagen.
- Publicado: no.
- Commit: 696016e
- Pendiente: nada.

2026-10-24 20:49 · IKRAL Studio · Generar también hace las locaciones
- Cambiado: [código] src/features/chat/requests.ts — Generar (paso 5) pide personajes y locaciones con imagen.
- Agregado: [código] BibleSections.tsx — miniatura en cada locación sugerida.
- Publicado: no.
- Commit: 34263a6
- Pendiente: instalar en la Mac.

2026-10-24 18:52 · IKRAL Studio · Instalada en la Mac (GPT y Claude)
- Cambiado: [código] /Applications/IKRAL Studio.app — versión con ventana de GPT y botón doble GPT | Claude.
- Publicado: no.
- Commit: 15d89e7
- Pendiente: que el director pruebe los dos botones.

2026-10-24 18:43 · IKRAL Studio · Botón doble GPT | Claude
- Agregado: [código] src/components/chat/ClaudeQuick.tsx — ventanita de Claude que se abre en cualquier vista.
- Cambiado: [código] src/components/gpt/GptBridge.tsx — botón doble «GPT | Claude» abajo a la izquierda.
- Publicado: no.
- Commit: 5bb6be4
- Pendiente: instalar en la Mac.

2026-10-24 18:22 · IKRAL Studio · Ventana aparte de GPT
- Agregado: [código] src/components/gpt/GptWindow.tsx — ventana de Mac propia para platicar con GPT.
- Agregado: [código] src/components/gpt/GptBridge.tsx y src/features/gpt/chatWindow.ts — botón «GPT» y puente con la principal.
- Cambiado: [código] src-tauri/src/lib.rs — comando abrir_ventana_gpt (una sola, siempre al frente; se cierra con la app).
- Quitado: [código] src/components/gpt/GptFloat.tsx.
- Publicado: no.
- Commit: 0af90f4
- Pendiente: instalar en la Mac; asistente con cambios Antes→Después; arreglar prompt mixto Escena 03.

2026-10-24 18:18 · IKRAL Studio · Ventanita flotante de GPT
- Agregado: [diseño] src/components/gpt/GptFloat.tsx — ventanita de GPT que se arrastra, se minimiza y queda encima en todas las vistas (estilo del aviso de Claude).
- Agregado: [asistente] src/features/gpt/chat.ts y schemas/chat.json — plática libre: GPT ve guion, Biblia y decisiones aprobadas; no cambia nada.
- Agregado: [código] src/tests/gptChat.test.ts — 7 pruebas (paquete, formato, web, errores, guardado). Total 353/353.
- Cambiado: [documento] carpeta-del-proyecto.md — sección «Ventanita flotante de GPT».
- Publicado: no.
- Commit: 864ff89
- Pendiente: instalar en la Mac cuando Kyo lo pida.

2026-10-24 15:38 · IKRAL Studio · Guion vs Biblia: restaurante o food truck
- Agregado: [código] src/features/continuity/setting.ts — detecta «la historia dice X, la Biblia dice Y», vista previa de impacto, aplicar y deshacer.
- Agregado: [diseño] SettingConflictCard — una pregunta con 🔊 y 3 caminos (adaptar, mantener, transformación); no escoge sola.
- Agregado: [código] src/tests/setting.test.ts — 11 pruebas con proyecto inventado: antes/después, guardar/abrir, Deshacer, Cmd+Z, Canon intacto.
- Agregado: [imagen] docs/qa/capturas/16-lugar-guion-vs-biblia.png — captura de la pregunta y la vista previa.
- Cambiado: [asistente] reglas de GPT — papel en unas escenas y app en otras no es mezcla; 3 opciones de lugar sin asumir.
- Cambiado: [documento] diagnóstico GPT, carpeta-del-proyecto.md (settingChange) y Blueprint tarea 1.5.
- Publicado: no.
- Commit: 9be42d5
- Pendiente: recompilar la app de Mac y que el director escoja un camino.

2026-10-24 15:35 · IKRAL Studio · App instalada con estados por escena
- Cambiado: [código] /Applications/IKRAL Studio.app — versión 4a1e9bc (estados por escena, revisión GPT honesta, botón 🔊 Escuchar).
- Seguridad: compilada solo desde commits (sin cambios a medio hacer); respaldo de la app anterior en /Volumes/c/respaldos/ikral-studio/app/.
- Publicado: no.
- Commit: 4a1e9bc
- Pendiente: que el director la pruebe.

2026-10-24 15:26 · IKRAL Studio · Estados por escena y revisión GPT honesta
- Agregado: [código] src/features/bible/itemStates.ts — estados por escena o etapa sobre la ficha fija; prompt «¿Para qué escena?» sin mezclar papel y app.
- Agregado: [código] src/features/gpt/corrections.ts — «Revisar cambios» → «Aplicar corrección» con vista previa, deshacer e historial.
- Agregado: [diseño] GptPanel — «Guardar regla», «Decide tú» (preguntas al director), «Regenerar imagen para Escena N» aparte.
- Agregado: [código] src/tests/gptCorrections.test.ts e itemStates.test.ts — 2 escenas y 1 cocina: sin mezcla, guardar/abrir, deshacer, Canon intacto.
- Agregado: [imagen] docs/qa/capturas/15-ficha-estado-por-escena.png — captura de la ficha con estados.
- Cambiado: [documento] docs/carpeta-del-proyecto.md — fotograma de escena (stateId/sceneId) nunca pone imageId.
- Arreglado: «Aceptar» decía hecho pero solo guardaba la regla; ahora dice qué pasó y qué falta.
- Publicado: no.
- Commit: f836020
- Pendiente: el director decide restaurante con comedor o food truck; compilar app de Mac.

2026-10-24 14:46 · IKRAL Studio · App nueva instalada en el Mac
- Cambiado: [código] /Applications/IKRAL Studio.app — versión con «Revisar guion con GPT» e «Instrucciones para GPT».
- Seguridad: respaldo de la app anterior en /Volumes/c/respaldos/ikral-studio/app/.
- Publicado: no.
- Commit: 3da33a4
- Pendiente: que el director pruebe la revisión de guion.

2026-10-24 15:50 · IKRAL Studio · GPT revisa la coherencia del guion
- Agregado: [código] src/features/gpt/context.ts — reglas de guionista (antes/después sin mezclar, objetos, locaciones, diálogos) y fichas de la Biblia en la revisión.
- Agregado: [diseño] GptPanel — caja «Instrucciones para GPT» (project.bible.reviewNotes); botón «Revisar guion con GPT».
- Agregado: [código] src/tests/gpt.test.ts — prueba de reglas, instrucciones y fichas.
- Cambiado: [documento] docs/carpeta-del-proyecto.md — sección de revisión con GPT.
- Publicado: no.
- Commit: 3da33a4
- Pendiente: compilar e instalar la nueva versión para probarla en la Mac.

2026-10-24 14:40 · IKRAL Studio · GPT en Locaciones ya ve el guion guardado
- Arreglado: «Consultar GPT» en una ficha de la Biblia (locación, objeto, vestuario, personaje, estilo) no recibía ninguna escena; por eso GPT pedía «el guion completo».
- Cambiado: [código] src/features/gpt/bible.ts — el paquete lleva la historia en orden y las escenas donde aparece la ficha (nombre o alias), con su acción y diálogo.
- Cambiado: [código] src/components/gpt/GptBiblePanel.tsx — manda las escenas del proyecto a GPT.
- Agregado: [código] src/tests/gptBible.test.ts — prueba aislada con locación «Cocina» y 3 escenas.
- Publicado: no.
- Commit: 9053a7b
- Pendiente: que el director lo pruebe en la app de Mac (nueva versión sin instalar).

2026-10-24 14:00 · IKRAL Studio · «Deshacer» al quitar una locación
- Agregado: [código] src/stores/uiStore.ts — avisos con botón (10 s); «Locación «X» eliminada · Deshacer».
- Cambiado: [código] src/features/trash/trash.ts — la ficha regresa a su mismo lugar, con imagen Canon, pruebas y notas.
- Cambiado: [diseño] CharacterSheet — el aviso de confirmación dice que se quita la ficha completa, no solo la imagen.
- Publicado: no.
- Commit: 9630d44
- Pendiente: la cocina perdida de SIN CEBOLLA: solo si el director da permiso y hay respaldo; puede estar en su Papelera.

2026-10-24 13:35 · IKRAL Studio · UX1 y Mini Monitor instalados en el Mac
- Agregado: [código] /Applications/IKRAL Monitor.app — Mini Monitor, con acceso en Escritorio y Dock.
- Cambiado: [código] /Applications/IKRAL Studio.app — nueva versión con «🎬 Planos de cámara».
- Publicado: no.
- Commit: a2fe04f
- Pendiente: M5, probar a mano ventana, menú y voz del Mini Monitor.

2026-10-24 14:07 · IKRAL Studio · Barras de uso en el Mini Monitor
- Cambiado: [código] /Applications/IKRAL Monitor.app — recompilada con barras de sesión y semana.
- Cambiado: [código] ~/.claude/settings.json — la barra de estado también guarda el uso (respaldo en C).
- Publicado: no.
- Commit: ver «Blueprint: M4 hecha».
- Pendiente: M5, probar a mano ventana, menú y voz.

2026-10-24 14:12 · IKRAL Studio · Barras de uso en la barra de menús
- Agregado: [código] mac/ikral-monitor/IKRALMonitor.swift — opción «Barras de uso arriba»: sesión y semana sin texto en vez del círculo.
- Publicado: no.
- Commit: ver «Mini Monitor: barras de uso arriba».
- Pendiente: M5, probar a mano ventana, menú y voz.

2026-10-24 15:45 · IKRAL Studio · «Aceptada» honesta en GPT
- Agregado: [código] src/features/gpt/done.ts — texto que dice lo que de verdad cambió.
- Cambiado: [código] paneles GPT de Biblia, guion, cobertura y edición — si no cambió nada, lo dicen.
- Arreglado: propuestas viejas «Aceptada» sin cambios ya no parecen corregidas.
- Publicado: no.
- Commit: efe5f54
- Pendiente: el director escoge restaurante o food truck; recompilar app de Mac.

2026-10-25 07:13 · IKRAL Studio · Aviso de referencias faltantes al generar
- Agregado: [código] src/features/chat/missingRefs.ts — revisa personajes, lugares, objetos y pantallas (celular, tablet, monitor, QR) sin imagen.
- Cambiado: [código] requests.ts — «Generar» avisa qué falta y deja cancelar o generar de todos modos.
- Agregado: [código] src/tests/missingRefs.test.ts — 2 pruebas (357 pasan).
- Publicado: no.
- Commit: c729c6e
- Pendiente: instalar en la Mac (con «si» de Kyo).

2026-10-25 07:15 · IKRAL Studio · Instalado (aviso de referencias faltantes)
- Cambiado: [código] /Applications/IKRAL Studio.app — instalada versión con el aviso y el botón GPT | Claude en la barra (respaldo verificado en /Volumes/c/respaldos/ikral-studio/app/).
- Publicado: no.
- Commit: c729c6e
- Pendiente: nada.

2026-10-25 11:12 · IKRAL Studio · Permiso de Documentos en la app
- Arreglado: la app instalada no podía abrir proyectos en Documentos («Operation not permitted») porque macOS no tenía texto para pedir permiso.
- Agregado: [código] src-tauri/Info.plist — NSDocumentsFolderUsageDescription.
- Publicado: no.
- Commit: (este)
- Pendiente: nada.
