# Prueba piloto «GPT · Guionista» (solo lectura)

- **Fecha:** 2026-10-23, 21:54 (hora del Pacífico).
- **Resultado:** el modelo respondió de verdad. El JSON es válido y encontró las 2 contradicciones que se pusieron a propósito.
- **Qué no se tocó:** no se cambió el código de IKRAL Studio, ningún proyecto, la configuración de Claude ni las credenciales.
- **Evidencia original guardada en:** `/Volumes/c/respaldos/ikral-studio/piloto-gpt-2026-10-23/`. Ahí están `prompt.txt`, `esquema.json`, `respuesta.json`, `codex.log` y las 2 imágenes.

## 1. Comando exacto (sin credenciales)

Se ejecutó dentro de una carpeta temporal de la sesión (no es la carpeta de IKRAL Studio):

```sh
codex exec --sandbox read-only --ephemeral --skip-git-repo-check -C . \
  -i escena1-antes.jpg -i escena8-despues.jpg \
  --output-schema esquema.json -o respuesta.json \
  "$(cat prompt.txt)" < /dev/null > codex.log 2>&1
```

- `--sandbox read-only`: Codex no puede escribir archivos.
- `--ephemeral`: no guarda la sesión.
- `-i`: adjunta las imágenes.
- `--output-schema`: obliga a responder con el formato JSON fijo.
- `-o`: guarda solo la última respuesta.
- `< /dev/null`: evita que Codex se quede esperando entrada.

## 2. Modelo y autenticación usados

**Antes de ejecutar:**

- `codex --version` dio `codex-cli 0.153.4`.
- `codex login status` dio `Logged in using ChatGPT`.

**Cabecera real de `codex.log`:**

```
OpenAI Codex v0.153.4
model: gpt-6-astra
provider: openai
approval: never
sandbox: read-only
reasoning effort: low
reasoning summaries: none
session id: 01a16c42-96d4-7231-aee8-930b7ad6684e
```

- **Modelo:** `gpt-6-astra`, que es el que Codex trae por defecto. No se eligió a mano.
- **Autenticación:** fue la sesión de Codex con la cuenta de ChatGPT de David.
  - **No es** una autorización propia de IKRAL Studio.
  - IKRAL no tuvo, no leyó ni guardó ningún token.
  - El uso cuenta como uso de Codex dentro del plan de ChatGPT.
- **Pendiente:** no se pudo ver qué plan es (Plus o Pro), porque `codex login status` no lo dice. Se puede ver en ChatGPT → Ajustes.

## 3. Imágenes y contexto que se dieron

**Imágenes:**

- Son 2 imágenes **generadas con Codex** para la Biblia. No son fotos reales ni datos privados.
- Se redujeron a **1024×576 JPG**.

| # | Archivo | Escena / etapa | Origen | Qué tiene |
|---|---|---|---|---|
| 1 | `escena1-antes.jpg` (275 KB) | Escena 1 · ANTES | `cocina-food-truck.png` | Cocina con una **pantalla digital «Orders»** |
| 2 | `escena8-despues.jpg` (215 KB) | Escena 8 · DESPUÉS | `pase-food-truck.png` | Pase con **comandas de papel colgadas** y una tablet «LISTO ✓» |

Las dos contradicciones ya estaban en las imágenes: no se editaron para la prueba.

**Prompt (`prompt.txt`, texto completo):**

```
Eres «GPT · Guionista», revisor de continuidad de un storyboard. Solo revisas; no edites archivos ni ejecutes comandos.

Contexto de la historia (Biblia):
- Food truck de tacos de Doña Chuy en Los Ángeles, 2026.
- Etapa ANTES (escenas 1–4): los pedidos se escriben en COMANDAS DE PAPEL colgadas en un riel. NO existe ninguna pantalla, tablet ni sistema digital de pedidos.
- Etapa DESPUÉS (escenas 7–10): ya funciona la app TuApp.digital. Los pedidos se ven SOLO en una tablet/pantalla con «LISTO ✓». Ya NO hay comandas de papel.

Imágenes adjuntas (en este orden):
1. Imagen inicial de la Escena 1 (etapa ANTES): cocina del food truck.
2. Imagen inicial de la Escena 8 (etapa DESPUÉS): pase de cocina del food truck.

Tarea: mira con atención cada imagen y encuentra contradicciones de continuidad con las reglas ANTES/DESPUÉS (comandas de papel vs. pantalla/tablet de pedidos). Para cada problema da la evidencia visual concreta (qué se ve y dónde), la gravedad y una corrección sugerida. Si una imagen no tiene problemas, no inventes. Responde en español.
```

**Formato pedido (`esquema.json`):**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["hallazgos", "resumen"],
  "properties": {
    "resumen": { "type": "string" },
    "hallazgos": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["imagen", "escena", "etapa", "problema", "evidencia", "gravedad", "correccion"],
        "properties": {
          "imagen": { "type": "integer", "description": "1 o 2, en el orden en que se adjuntaron" },
          "escena": { "type": "string" },
          "etapa": { "type": "string", "enum": ["ANTES", "DESPUES"] },
          "problema": { "type": "string" },
          "evidencia": { "type": "string", "description": "Qué se ve exactamente en la imagen y dónde" },
          "gravedad": { "type": "string", "enum": ["alta", "media", "baja"] },
          "correccion": { "type": "string" }
        }
      }
    }
  }
}
```

## 4. JSON completo devuelto por GPT (sin cambios)

Es `respuesta.json` tal como llegó. Su SHA-256 es `4c05c199aa1e64274ba4c2a15e79aa32e78ec3955f77be04f58a010a4e99e7a2`.

```json
{
  "resumen": "Ambas imágenes contradicen la continuidad del sistema de pedidos establecido en la Biblia.",
  "hallazgos": [
    {
      "imagen": 1,
      "escena": "Escena 1",
      "etapa": "ANTES",
      "problema": "Aparece una pantalla digital de pedidos y no se ven las comandas de papel requeridas.",
      "evidencia": "En la zona superior central derecha, sobre el fregadero, hay una pantalla negra con el encabezado «Orders», números de pedido, productos y tiempos. No se observan comandas de papel colgadas en un riel.",
      "gravedad": "alta",
      "correccion": "Retirar la pantalla de pedidos y mostrar comandas de papel colgadas en un riel."
    },
    {
      "imagen": 2,
      "escena": "Escena 8",
      "etapa": "DESPUES",
      "problema": "Persisten comandas de papel junto al sistema digital, aunque los pedidos deben mostrarse solo en pantalla.",
      "evidencia": "En la parte superior del pase cuelgan cinco comandas de papel numeradas #12, #14, #15, #16 y #17, con listas de productos. A la derecha, sobre la encimera, también aparece una tablet con «LISTO ✓».",
      "gravedad": "alta",
      "correccion": "Retirar todas las comandas de papel del riel y conservar la tablet con «LISTO ✓» como único soporte de pedidos."
    }
  ]
}
```

## 5. Duración

- **14.8 s** en total, medido con `time` (`14.756 total`).
- Incluye el arranque de Codex, la subida de las 2 imágenes y la respuesta del modelo.

## 6. Validación y resultados

- **El JSON es válido:** `json.load` lo leyó sin errores.
- **Respeta el formato:** cumple el esquema (`--output-schema`). Tiene `resumen` y 2 `hallazgos` con todos los campos.
- **Lo que esperábamos contra lo que encontró:**

| Contradicción puesta a propósito | ¿La encontró? | ¿La evidencia es cierta? |
|---|---|---|
| Pantalla digital de pedidos en ANTES (imagen 1) | Sí, gravedad alta | **Sí.** Claude abrió la imagen y vio la pantalla «Orders» arriba a la derecha, con #104–#107, sobre el fregadero. Tampoco hay comandas. |
| Comandas de papel en DESPUÉS (imagen 2) | Sí, gravedad alta | **Sí.** Se ven 5 comandas numeradas #12, #14, #15, #16 y #17 y la tablet «LISTO ✓» a la derecha. |

- **Falsos positivos:** no hubo ninguno en esta prueba.

## 7. Limitaciones, errores y consumo

- **Consumo:** `codex.log` dice `tokens used: 19.276` (unos 19 mil tokens, contando las 2 imágenes). No se pudo medir qué **porcentaje del plan** se gastó; eso se ve en ChatGPT → Ajustes → Uso.
- **Errores:** no hubo. El código de salida fue 0 y no apareció ningún aviso, salvo la línea normal `Reading additional input from stdin...`.
- **La muestra es pequeña:** 2 imágenes y 2 errores obvios. Falta probar errores sutiles, muchas escenas e imágenes sin ningún problema.
- **Depende de Codex:** tiene que estar instalado y con la sesión abierta en la Mac. No funciona en la versión web.
- **Privacidad:** las imágenes se envían a OpenAI. Para material privado hay que pedir permiso antes.
- **Plan Plus:** si es Plus, el límite de 5 horas se comparte con todo el uso de Codex, incluidas las imágenes.
- **Modelo:** usa el que Codex trae por defecto. Puede cambiar si Codex se actualiza. Se puede fijar con `-m`.
- **Sin memoria:** con `--ephemeral`, cada revisión empieza de cero. Por eso el historial lo guarda IKRAL.

## 8. Recomendación técnica para el panel «GPT · Guionista»

1. **Primera versión con `codex exec`:** una revisión es una sola llamada, con esta misma forma.
   - Un comando en Rust (Tauri) arma la carpeta temporal con el prompt, el esquema y las miniaturas de las escenas pedidas.
   - Ese comando ejecuta `codex exec --sandbox read-only --ephemeral --output-schema … -o …`, con tiempo límite y botón Cancelar.
2. **Los resultados van en `gpt-revisiones.json`** dentro del proyecto, escrito de forma atómica. **Nunca en `proyecto.json`.**
3. **El panel solo muestra los hallazgos** con Aceptar, Descartar o «Pedir a Claude que lo arregle». El Canon no cambia solo.
4. **Antes de construir el panel:** agregar las etapas ANTES/DESPUÉS como dato (`phases`, `phaseId`, `onlyIn`) y `project.decisions`, para que el contexto no dependa de texto libre.
5. **Para ahorrar:** mandar miniaturas de 1024 px y solo las escenas que cambiaron. Mostrar los tokens que se usaron en cada revisión.
6. **Antes de usarlo en serio:** hacer una 2.ª prueba con unas 10 escenas reales y errores sutiles, para medir falsos positivos.

## 9. `codex exec` contra `codex app-server`

| | `codex exec` | `codex app-server` |
|---|---|---|
| Estado | Estable, ya probado aquí | Marcado **[experimental]** en `codex app-server --help` |
| Cómo se usa | Un proceso por revisión: entra un prompt y sale una respuesta | Servidor que sigue vivo y habla por stdio (JSON-RPC), con hilos y mensajes que llegan en vivo |
| Conversación | No, cada llamada empieza de cero | Sí, hilos con historial y respuestas de seguimiento |
| Velocidad | Arranca cada vez (unos segundos extra) | Arranca una vez |
| Complejidad | Baja | Más alta: hay que manejar el proceso, los eventos, la cancelación y la renovación de la sesión |
| Ideal para | **Revisión de continuidad por lotes** (primera versión) | Un **chat interactivo** con GPT dentro del panel (más adelante) |

**Recomendación:** empezar con `codex exec`. Pasar a `app-server` solo si se quiere platicar con GPT en vivo, y cuando deje de ser experimental.
