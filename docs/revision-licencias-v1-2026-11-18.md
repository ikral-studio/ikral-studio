# Revisión de licencias · IKRAL Studio (v1, 18 nov 2026)

No es asesoría legal: es la revisión de las licencias publicadas por cada proyecto.

## Resultado: en regla ✅ (con 3 cuidados)

| Pieza | Licencia | ¿Uso comercial? | Qué pide |
| --- | --- | --- | --- |
| IKRAL Studio | AGPL-3.0-or-later (nuestra) | Sí | — |
| Librerías JS (React, Zustand, dnd kit, jsPDF, Zod, Lucide, JSZip, Tauri) | MIT / ISC / MIT-o-Apache | Sí | Incluir aviso y licencia → THIRD_PARTY_LICENSES.txt (va dentro de la app) |
| Dexie, tauri-plugin-drag | Apache-2.0 | Sí | Incluir licencia y NOTICE → incluido |
| ACE-Step 1.5 (código y modelos turbo, base, LM 0.6B) | MIT | Sí | Dar crédito → «Acerca de» |
| Qwen3-Embedding-0.6B, T5 v1.1 XXL | Apache-2.0 | Sí | Crédito → incluido |
| ComfyUI | GPL-3.0 | Sí | Programa aparte (la app le habla por HTTP, no va dentro) → sin obligación extra |
| LTX-Video 2B 0.9.8 | LTXV Open Weights License 0.X | Sí, si se gana < 10 M USD/año | Ver cuidados 1 y 3 |

## Cuidados
1. **Decir «hecho con IA»** al publicar videos de LTX-Video (Anexo A, inciso e). Recomendación: poner «Hecho con IA» en la descripción o créditos del video.
2. **Audios e imágenes ajenos**: «Copiar su estilo» y «Otra versión» solo con audio propio o con permiso (ACE-Step también lo pide). Nada de imitar voces o caras reales sin permiso (LTX, inciso g).
3. **LTX-Video**: empresas con 10 M USD/año o más necesitan licencia de pago. Kyo/IKRAL hoy no aplica.

## Hecho en la app
- «Acerca de» con créditos + sección «Uso responsable».
- CREDITOS.md y THIRD_PARTY_LICENSES.txt (texto completo + NOTICE de Dexie) dentro de IKRAL Studio.app/Contents/Resources.
- Botón «Escoger un audio (tuyo o con permiso)…».

## Pendiente sugerido
- Marca «Hecho con IA» automática al exportar video (metadatos del MP4 o texto en créditos).
