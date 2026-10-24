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
