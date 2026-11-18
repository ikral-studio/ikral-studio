# Relevo · IKRAL Studio · Motor gratis en la Mac (v2, 18 nov 2026 ~02:25)

🎯 Meta original: hacer imágenes, videos y música gratis en la Mac de Kyo desde IKRAL Studio (alternativa real a Higgsfield).
🧭 Meta de la fase: Fase V (PLAN.md). Kyo cambió el orden: V8 Música primero, con «todas las funciones» de ACE-Step 1.5, y luego V4 imágenes. Idea nueva de Kyo: botón «Agrandar a 4K» al video ya hecho (anotada en V5).

✅ Avances (rama local `claude/video-local`, worktree ~/Documents/editor de storiborad/ikral-studio-video-local):
- V3 papelera + V8 primera versión INSTALADAS en /Applications (build de f9fff7e). Respaldo verificado: /Volumes/c/respaldos/ikral-studio/app-antes-musica-2026-11-18.
- Inicio con 3er cuadro «🎵 Música» → pantalla src/components/music/MusicScreen.tsx (estilo con botones, letra, duración, lista «Música del proyecto» con ▶, «Poner en Música 1/2», renombrar).
- Canciones en `project.songs` (biblioteca del proyecto); no las limpia la papelera (idb.mediaIdsOf, projectStore GC, backup export/import).
- Commits: f9fff7e (pantalla Música) · 1d38e7a (usar mi audio: copiar estilo / otra versión / rehacer un pedazo + 🎲 Sorpréndeme) · eab6848 (separar voz/instrumento y agregar instrumento, modelo base). Pruebas 387/387, tsc limpio.
- Motor: /Volumes/c/AI/ACE-Step/arrancar-ikral-musica.sh + ikral_musica.py (CORS tauri://localhost sin tocar ACE-Step; 127.0.0.1:8001; ahora con ACESTEP_CONFIG_PATH2=acestep-v15-base). Comando Tauri `arrancar_musica_local`. Antes de música se libera ComfyUI (/free).
- Modelo base bajado (aprobado por Kyo): checkpoints/acestep-v15-base (4.8 GB, MIT).
- Pruebas reales por API: 30 s instrumental 3:25 · 30 s con letra en español 3:17 (Kyo la escuchó y le encantó). Prueba «cumbia → rock» (cover) OK (30 s, prueba-cumbia-rock.mp3); dado y pedazo en fila (MP3 en el scratchpad de la sesión 53151516…).
- PLAN.md actualizado (V5 nota 4K, V8 [~]) SIN commit todavía.

🚀 Siguiente paso:
1. Reiniciar el servidor de música (matar ikral_musica.py y correr arrancar-ikral-musica.sh) para que cargue el slot base; probar por API extract (voz) y lego con /Volumes/c/AI/ACE-Step/ACE-Step-1.5/.cache/acestep/tmp/api_audio/*.mp3; medir tiempos.
2. Compilar (`npx tauri build --bundles app`), respaldo nuevo en /Volumes/c/respaldos/ikral-studio/, pedir a Kyo ⌘Q, instalar con ditto, que pruebe 🎵 Música.
3. Pendiente de la lista de Kyo: «Aprender tu estilo» (LoRA): pesado en 16 GB, explicarle y decidir.
4. Commit PLAN.md + bitácora (BITACORA.md) + ficha IKRAL Studio en el Panel (panel-candado.sh) + nota de memoria project-ikral-studio-motor-local.md → apuntar a este relevo.
5. PEDIDO NUEVO de Kyo (02:25): pantalla «Acerca de / Créditos» en la app (como en apps profesionales) con agradecimientos y licencias de todo lo usado: ACE-Step 1.5 (MIT), ComfyUI (GPL-3.0), LTX-Video 2B (licencia Lightricks), T5-XXL, Tauri, React, etc. Revisar licencias reales de cada uno (package.json, Cargo.toml, modelos) y enlazar.
6. Luego V4 imágenes (SDXL + Lightning).
Notas: sin prettier. Commits como David González <146617979+nahya-bi@users.noreply.github.com>. Un paso a la vez con Kyo; máx. 200 caracteres.
