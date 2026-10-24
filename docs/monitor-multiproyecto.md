# Monitor IKRAL multiproyecto

Una sola página (`monitor.html`, la del acceso «Monitor IKRAL») enseña todos los proyectos del registro
`tools/monitor-projects.json`: arriba una tarjeta por proyecto; al elegir una, su detalle.

## Estados

Trabajando · En cola · Pausado (detenido) · Esperando aprobación · Sin tareas · Error · Sin señal · No conectado.

- **No conectado:** el proyecto no tiene puente, o su puente aún no escribió datos. No se finge actividad.
- **Sin señal:** sus datos tienen más de 3 min. Se marca por proyecto y la página lo recalcula cada segundo.
- Etapas, historial y comentarios solo aparecen si el puente del proyecto los manda.

## Panel de IKRAL y Blueprint

- La fuente oficial de cada proyecto es **su ficha en el Panel de IKRAL**. El registro no la reemplaza: solo dice
  dónde leer el estado en vivo. `panelFicha` = nombre de la ficha; `null` → «Ficha en el Panel: sin enlazar todavía».
- Si el proyecto tiene Blueprint con checklist (`docs/blueprint/`), su `status.json` trae el resumen en `blueprint`:
  la tarjeta dice «Blueprint: X de Y hechas · siguiente: …» y el detalle enseña la fase actual y los bloqueos.
  El monitor lo vuelve a validar; un resumen incoherente no se enseña.

## Privacidad y aislamiento

- De cada proyecto se lee **solo** `status.json` de su `statusDir`, y solo si está dentro de
  `~/Library/Application Support`. Nunca se leen archivos de su repo.
- No se siguen enlaces simbólicos; archivos de más de 512 KB no se leen.
- El archivo debe decir su `project` y `source` y coincidir con el registro. Si no, se marca Error y no se muestra.
- Todos los textos se vuelven a limpiar: sin rutas, comandos, llaves, correos ni enlaces.

## Conectar otro proyecto (solo con autorización del director)

1. En `tools/monitor-projects.json`, en su entrada, poner `statusDir` (por ejemplo
   `~/Library/Application Support/plancha-coord`) y su `source` (Issue de coordinación).
2. Su puente, en cada vuelta, escribe ahí `status.json` con `statusPayload(proyecto, vista)` de
   `tools/coord-monitor-core.mjs` (la vista se arma con `buildView`).

Para agregar un proyecto nuevo sin puente basta una entrada con `"statusDir": null`.
