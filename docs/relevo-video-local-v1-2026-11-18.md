# Relevo · IKRAL Studio · Motor gratis en la Mac (v1, 18 nov 2026)

🎯 Meta original: hacer imágenes, videos y música gratis en la Mac de Kyo desde IKRAL Studio (alternativa real a Higgsfield).
🧭 Meta de la fase: Fase V de PLAN.md (V1–V11). ✅ Orden aprobado por Kyo el 18 nov 2026: V4 imágenes → V5 agrandar → V6 fondos → V7 cuadros 48/60 → V8 música → V9 ventana «Crear video».
✅ Avances:
- V1 hecho: botón «Video gratis (Mac)» + selector de calidad por escena (LTX-Video 2B destilado, imagen inicial → final).
- V2 hecho en código: «Hacer todos los videos (Mac)» (calidad + carpeta + caffeinate). Falta prueba real (30 escenas en Alta).
- V3 hecho en código: papelera de archivos `Papelera/` dentro de la biblioteca (commit d51a151). Compilada, FALTA instalar (Kyo debe cerrar la app con ⌘Q; luego ditto a /Applications).
- Rama local `claude/video-local`, worktree ~/Documents/editor de storiborad/ikral-studio-video-local (node_modules = symlink). Falta unir a main.
- ComfyUI: /Volumes/c/laboratorio/comfyui-video, `arrancar-ikral.sh` (127.0.0.1:8188, CORS tauri://localhost, caffeinate). Modelos: ltxv-2b-0.9.8-distilled, t5xxl_fp8_e4m3fn_scaled.
- Tiempos: cargar ~13:40 (disco C USB 54 MB/s + RAM 16 GB); generar 4–6 s ≈ 40 s–1:40.
- Respaldo app: /Volumes/c/respaldos/ikral-studio/app-antes-video-local-2026-11-18. NOTA-0314 al Panel.
🚀 Siguiente paso: instalar build con V3; luego V4 = imágenes desde texto con SDXL base 1.0 + SDXL-Lightning 8step LoRA (ByteDance, OpenRAIL++), en /Volumes/c/laboratorio/comfyui-video/models.
Notas: no usar prettier (el repo no lo usa). Commits como David González <146617979+nahya-bi@users.noreply.github.com>. Un paso a la vez con Kyo.
