# Traspaso para la sesión del Panel ikral · ficha «IKRAL Studio»

Preparado por la sesión de IKRAL Studio (puente) el 2026-10-24, siguiendo DS-010. **Esta sesión no toca el
Panel, no inventa esquemas ni corre migraciones.** Todo lo de abajo lo registra la sesión del Panel, con el «sí»
de David.

## 1. Propuesta de integración

- **Fuente oficial:** la ficha del proyecto en el Panel. El repo solo guarda el borrador del Blueprint
  (`docs/blueprint/ikral-studio.json`) y su versión legible (`PLAN.md`).
- **Blueprint:** fases 1, 2, 3, 4 y P (puente). Cada tarea trae estado, responsable, fecha, evidencia,
  dependencias, siguiente paso y la casilla del director. DS-010 usa Fase → Paquete → Unidad. Propuesta de
  equivalencia (la decide el Panel): fase = Fase; subetapa (2a, 3b…) = Paquete; criterios = Unidades.
- **Checklist:** «hecho» solo con evidencia verificable (commit, prueba, URL o decisión del director). La casilla
  ✅ es solo del director y equivale a «✅ aprobada» de DS-010 (bitácora + etiqueta git).
- **Monitor:** el Monitor IKRAL ya enseña por proyecto la tarea actual, el latido, el último avance, los bloqueos y
  «X de Y hechas · siguiente». Cada proyecto del monitor tiene `panelFicha`, el nombre de su ficha en el Panel.
  Hoy todos dicen «sin enlazar todavía». No es un registro paralelo: solo dice dónde leer el estado en vivo.
- **Lectura sugerida:** el Panel puede leer el resumen de `status.json`
  (`~/Library/Application Support/ikral-coord`, campo `blueprint`) o el JSON del Blueprint. Cómo lo guarda el
  Panel es decisión de la sesión del Panel.

## 2. Inventario de la ficha

| Campo | Valor |
|---|---|
| Nombre | IKRAL Studio · Editor de storyboard |
| Carpeta | `~/Documents/editor de storiborad/ikral-studio` |
| Repositorio | https://github.com/ikral-studio/ikral-studio (público; 46+ commits solo locales) |
| Coordinación | https://github.com/ikral-studio/coordinacion/issues/1 |
| Publicado | https://ikral.com/studio/ (última publicación: Fase 1) |
| Plan maestro | `docs/plan-maestro-ikral-studio.md` |
| Bitácora | `../BITACORA.md` |
| Blueprint | `docs/blueprint/ikral-studio.json` → `PLAN.md` |
| Monitor | Monitor IKRAL (puente launchd, cada ~45 s) |

## 3. Estado del Blueprint (2026-10-24)

13 de 23 tareas hechas (`npm run blueprint` da el número del momento). Ninguna tiene la ✅ del director todavía.

- **Hechas:** 1.1–1.4, 2a–2d, 3a–3c, P1, P2 (cada una con su commit).
- **En curso:** P4 (este Blueprint).
- **Pendientes:** 2.pub (publicar Fase 2, decide el director), 3d, 3e, 4 (Biblia PDF), P5 (esta ficha).
- **Bloqueadas:** 3.real y 4.pub (necesitan al director), P3 (acceso en el Escritorio), P6 (push: el repo es público).

## 4. Decisiones pendientes del director

1. Autorizar el push (el repo es público, así que es publicar) o volverlo privado antes. Ver
   `docs/respaldo-y-recuperacion.md`.
2. Aprobar con ✅ las tareas hechas que él revise.
3. Publicar la Fase 2 (2.pub) cuando lo decida.

## 5. Nota lista para NOTAS-ENTRE-SESIONES (NOTA-0048)

Esta sesión no puede escribir fuera de su carpeta. Texto para que se agregue tal cual:

```
NOTA-0048 · ABIERTA · de: IKRAL Studio (puente) · para: Panel ikral · 2026-10-24
Ficha «IKRAL Studio» lista para registrar (DS-010; responde a NOTA-0025).
Traspaso: ikral-studio/docs/panel/traspaso-ikral-studio.md · Blueprint: PLAN.md (13 de 23 hechas).
Pide: registrar ficha + Blueprint con el «sí» de David; poner el nombre de la ficha en
tools/monitor-projects.json (panelFicha) para enlazar el monitor. No hay migraciones preparadas aquí.
```
