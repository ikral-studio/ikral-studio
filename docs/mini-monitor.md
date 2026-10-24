# IKRAL Mini Monitor (app de Mac) · V1

Pedido del director: Issue #4 de `ikral-studio/coordinacion`. Interfaz local del monitor que ya existe
(`docs/monitor-multiproyecto.md`): **no es otra base de datos**. La fuente oficial sigue siendo el Panel de IKRAL.

## Cómo funciona
1. En cada vuelta (~45 s) el puente escribe `mini.json` en `~/Library/Application Support/ikral-coord/`,
   junto a `status.json` y `monitor.html` (`tools/mini-monitor-core.mjs`).
2. La app `IKRAL Monitor.app` (`mac/ikral-monitor/IKRALMonitor.swift`) **solo lee ese archivo** cada 5 s.
3. Si el archivo tiene más de 3 min, la app enseña **«Sin señal»** (no finge tiempo real).

## Qué enseña
- Estado: 🟢 Trabajando · 🟡 Esperando · 🔴 Bloqueado · ⚫ Sin señal (icono + texto en la barra de menús y en la ventana).
- «Ahora: …» y «Te necesito: …» (una línea cada uno, ≤200 caracteres), proyecto, última actividad y enlace al Issue.
- Puente y Claude interactivo por separado: última vuelta del puente, si su Claude corre, y cuántas ventanas de Claude
  hay abiertas (abierta ≠ trabajando).
- **Uso de Claude Code** (sesión / semana): solo si `usage.json` trae un dato con fuente verificable y reciente
  (formato `ikral-usage/1`). Hoy nada lo escribe → **«Uso no disponible»** + botón «Ver uso en Claude».
  No se leen credenciales, cookies ni archivos privados. El contexto (150k) no es la cuota.
- ▶ **Escuchar estado**: voz del propio Mac (es-MX), solo al pulsar.

## Ventana y accesos
- Cerrar la ventana no cierra la app: sigue el icono de arriba («Abrir ventana») y el del Dock.
- «Siempre visible» la deja encima de las demás ventanas (opcional).
- En pantalla completa (p. ej. Roblox) macOS puede esconder la barra de menús: acercar el puntero arriba la
  enseña; si el juego no la deja, usar el Dock o el acceso del Escritorio al salir. No se promete sobreponerse.

## Compilar e instalar (sesión interactiva, no el puente)
- `npm run mini-monitor:compilar` → `mac/ikral-monitor/build/IKRAL Monitor.app` (necesita `swiftc`).
- `npm run mini-monitor:instalar` → `/Applications`, acceso «IKRAL Monitor» en el Escritorio y en el Dock,
  sin duplicados. Iniciar al encender la sesión: solo si el director lo pide.
