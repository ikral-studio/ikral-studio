// Formato de intercambio de guiones con IA (ChatGPT, Claude…): "ikral-studio-script" v1.
// Solo texto narrativo: nunca archivos, rutas ni IDs internos. No es el respaldo .zip.
import { z } from 'zod'
import { cameraIds, cameraIdsForAI } from '../camera/camera'
import type { CameraCategoryId } from '../camera/library'

export const SCRIPT_FORMAT = 'ikral-studio-script'
export const SCRIPT_VERSION = 1
export const LIMITS = { maxChars: 1_000_000, maxScenes: 500, maxText: 5000, maxTitle: 200, maxPronunciations: 50, maxFields: 20, maxFieldName: 40 }

const text = z.string().max(LIMITS.maxText, `máximo ${LIMITS.maxText} caracteres`)

const pronunciation = z
  .object({
    written: z.string().trim().min(1, 'falta «written» (cómo se escribe)').max(LIMITS.maxTitle),
    spoken: z.string().trim().min(1, 'falta «spoken» (cómo se pronuncia)').max(LIMITS.maxTitle),
  })
  .strict()

const camEnum = (cat: CameraCategoryId) => z.enum(cameraIds(cat) as [string, ...string[]], { error: 'no es una toma de la biblioteca' })
const cameraSchema = z
  .object({
    shot: camEnum('shot'),
    angle: camEnum('angle'),
    move: camEnum('move'),
    lens: camEnum('lens'),
    composition: camEnum('composition'),
    light: camEnum('light'),
    time: camEnum('time'),
    transition: camEnum('transition'),
    speed: z.enum(['slow', 'normal', 'fast']),
  })
  .partial()
  .strict()

const sceneScript = z
  .object({
    action: text.default(''),
    dialogue: text.default(''),
    cameraDirection: text.default(''),
    soundDirection: text.default(''),
    generationPrompt: text.default(''),
    pronunciations: z.array(pronunciation).max(LIMITS.maxPronunciations).default([]),
    numbersToWords: z.boolean().default(false),
    /** Campos extra: { "Vestuario": "…" } */
    camera: cameraSchema.optional(),
    extras: z
      .record(z.string().trim().min(1).max(LIMITS.maxFieldName), text)
      .refine((r) => Object.keys(r).length <= LIMITS.maxFields, `máximo ${LIMITS.maxFields} campos extra`)
      .default({}),
  })
  .strict()

const scene = z
  .object({
    title: z.string().trim().min(1, 'la escena necesita título').max(LIMITS.maxTitle),
    plannedDuration: z.number().min(0.5, 'mínimo 0.5 s').max(600, 'máximo 600 s').default(8),
    script: sceneScript,
  })
  .strict()

export const scriptFileSchema = z
  .object({
    format: z.literal(SCRIPT_FORMAT, { error: `«format» debe ser "${SCRIPT_FORMAT}"` }),
    version: z.literal(SCRIPT_VERSION, { error: `«version» debe ser ${SCRIPT_VERSION}` }),
    project: z
      .object({
        title: z.string().trim().min(1, 'falta el título del proyecto').max(LIMITS.maxTitle),
        aspectRatio: z.enum(['16:9', '9:16']).default('16:9'),
        customFields: z.array(z.string().trim().min(1).max(LIMITS.maxFieldName)).max(LIMITS.maxFields).default([]),
      })
      .strict(),
    scenes: z.array(scene).min(1, 'no hay escenas').max(LIMITS.maxScenes, `máximo ${LIMITS.maxScenes} escenas`),
  })
  .strict()

export type ScriptFile = z.infer<typeof scriptFileSchema>
export type ImportedScene = ScriptFile['scenes'][number]

export const EXAMPLE: ScriptFile = {
  format: SCRIPT_FORMAT,
  version: SCRIPT_VERSION,
  project: { title: 'Promocional de TuApp.digital', aspectRatio: '16:9', customFields: ['Vestuario', 'Emoción'] },
  scenes: [
    {
      title: 'El descubrimiento',
      plannedDuration: 7,
      script: {
        action: 'El joven saca su celular y se lo muestra al abuelito. Los demás personajes se acercan curiosos.',
        dialogue: 'Joven: ¡Mire! Con esta aplicación pueden organizar sus 25 pedidos.',
        cameraDirection: 'Joven a la izquierda, abuelito a la derecha. La cámara abre el encuadre gradualmente.',
        soundDirection: 'Español mexicano. Ambiente natural de restaurante. Sin música.',
        generationPrompt: 'Animación 2D cálida, continuidad estricta entre imagen inicial y final, gestos naturales.',
        pronunciations: [{ written: 'TuApp.digital', spoken: 'Tu Ap Dijital' }],
        numbersToWords: true,
        camera: { shot: 'ms', angle: 'eye', move: 'orbit', speed: 'slow', lens: 'normal', light: 'golden' },
        extras: { Vestuario: 'Joven con camisa azul; abuelito con suéter café.', Emoción: 'Sorpresa que se vuelve alegría.' },
      },
    },
  ],
}

export type ParseResult = { ok: true; data: ScriptFile } | { ok: false; errors: string[] }

const FIELD_NAMES: Record<string, string> = {
  action: 'Acción visual',
  dialogue: 'Diálogos',
  cameraDirection: 'Dirección de cámara',
  soundDirection: 'Sonido y ambiente',
  generationPrompt: 'Instrucciones para generación',
  pronunciations: 'Pronunciación',
  numbersToWords: 'Números en letras',
  plannedDuration: 'Duración',
  title: 'Título',
  aspectRatio: 'Orientación',
  extras: 'Campos extra',
  camera: 'Cámara',
  shot: 'Plano',
  angle: 'Ángulo',
  move: 'Movimiento',
  lens: 'Lente',
  composition: 'Composición',
  light: 'Luz',
  time: 'Tiempo',
  transition: 'Transición',
  speed: 'Velocidad',
  customFields: 'Campos extra del proyecto',
}

function describePath(path: PropertyKey[]): string {
  const parts: string[] = []
  for (let i = 0; i < path.length; i++) {
    const p = path[i]
    if (p === 'scenes' && typeof path[i + 1] === 'number') {
      parts.push(`Escena ${(path[i + 1] as number) + 1}`)
      i++
    } else if (p === 'pronunciations' && typeof path[i + 1] === 'number') {
      parts.push(`Pronunciación ${(path[i + 1] as number) + 1}`)
      i++
    } else if (p === 'project') parts.push('Proyecto')
    else if (p !== 'script') parts.push(`campo «${FIELD_NAMES[String(p)] ?? String(p)}»`)
  }
  return parts.join(' · ') || 'Archivo'
}

/** Analiza el texto pegado (tolera ```json …``` alrededor) y lo valida. Nunca ejecuta nada. */
export function parseScriptText(raw: string): ParseResult {
  if (raw.length > LIMITS.maxChars) return { ok: false, errors: ['El texto es demasiado grande (máximo 1 MB).'] }
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start < 0 || end <= start) return { ok: false, errors: ['No encontré JSON. Pega solo lo que devolvió la IA.'] }
  let json: unknown
  try {
    json = JSON.parse(raw.slice(start, end + 1))
  } catch (e) {
    return { ok: false, errors: [`El JSON está mal escrito: ${e instanceof Error ? e.message : String(e)}`] }
  }
  const r = scriptFileSchema.safeParse(json)
  if (r.success) return { ok: true, data: r.data }
  const errors = r.error.issues.slice(0, 30).map((iss) => {
    let msg = iss.message
    if (iss.code === 'unrecognized_keys') msg = `no se permite: ${iss.keys.map((k) => `«${k}»`).join(', ')}`
    else if (iss.code === 'invalid_type') msg = iss.input === undefined ? 'falta este dato' : `tipo incorrecto (se esperaba ${iss.expected})`
    return `${describePath(iss.path)}: ${msg}`
  })
  return { ok: false, errors }
}

export type SceneParseResult =
  | { ok: true; scene: ImportedScene; customFields: string[]; hasDuration: boolean }
  | { ok: false; errors: string[] }

/**
 * Para «Pegar escena de IA»: acepta el formato completo con UNA escena,
 * o solo el objeto de la escena ({ title, plannedDuration, script }).
 */
export function parseSceneText(raw: string): SceneParseResult {
  if (raw.length > LIMITS.maxChars) return { ok: false, errors: ['El texto es demasiado grande (máximo 1 MB).'] }
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start < 0 || end <= start) return { ok: false, errors: ['No encontré JSON. Pega solo lo que devolvió la IA.'] }
  let json: unknown
  try {
    json = JSON.parse(raw.slice(start, end + 1))
  } catch (e) {
    return { ok: false, errors: [`El JSON está mal escrito: ${e instanceof Error ? e.message : String(e)}`] }
  }
  if (json && typeof json === 'object' && 'format' in json) {
    const r = parseScriptText(JSON.stringify(json))
    if (!r.ok) return r
    if (r.data.scenes.length !== 1)
      return { ok: false, errors: [`El JSON trae ${r.data.scenes.length} escenas. Aquí va solo una (para varias usa «Importar guion»).`] }
    const hasDuration = !!(json as { scenes?: { plannedDuration?: unknown }[] }).scenes?.[0]?.plannedDuration
    return { ok: true, scene: r.data.scenes[0], customFields: r.data.project.customFields, hasDuration }
  }
  const r = scene.safeParse(json)
  if (!r.success) {
    const wrapped = parseScriptText(JSON.stringify({ format: SCRIPT_FORMAT, version: SCRIPT_VERSION, project: { title: 'x' }, scenes: [json] }))
    return wrapped.ok ? { ok: false, errors: ['JSON no válido'] } : { ok: false, errors: wrapped.errors }
  }
  return { ok: true, scene: r.data, customFields: [], hasDuration: 'plannedDuration' in (json as object) }
}

/** Instrucciones para pegar en ChatGPT, Claude u otra IA. */
export function buildAIPrompt(project?: { title: string; aspectRatio: string; customFields?: string[] }): string {
  const fields = project?.customFields?.length ? project.customFields : null
  const example: ScriptFile = fields
    ? {
        ...EXAMPLE,
        project: { ...EXAMPLE.project, customFields: fields },
        scenes: EXAMPLE.scenes.map((s) => ({ ...s, script: { ...s.script, extras: Object.fromEntries(fields.map((f) => [f, `(${f} de esta escena)`])) } })),
      }
    : EXAMPLE
  return `Eres guionista y director audiovisual. Escribe el guion técnico de un video para IKRAL Studio.

RESPONDE ÚNICAMENTE CON JSON VÁLIDO. Sin explicaciones, sin texto antes o después y sin bloques de Markdown (\`\`\`).

Reglas del formato:
- "format" debe ser exactamente "${SCRIPT_FORMAT}" y "version" debe ser ${SCRIPT_VERSION}.
- "project": "title" (título del proyecto) y "aspectRatio": "16:9" (horizontal) o "9:16" (vertical).
- "scenes": arreglo ordenado de escenas (máximo ${LIMITS.maxScenes}). Cada escena lleva:
  - "title": título corto de la escena.
  - "plannedDuration": duración en segundos (número entre 0.5 y 600).
  - "script" con estos campos de texto (usa "" si no aplica):
    - "action": acción visual, qué ocurre físicamente.
    - "dialogue": diálogos, quién habla y qué dice (ej. "Joven: ¡Mire!").
    - "cameraDirection": dirección de cámara: encuadre, movimiento, ángulo y continuidad.
    - "soundDirection": sonido y ambiente: voces, ruido ambiental, silencios o música.
    - "generationPrompt": instrucciones específicas para el generador de video con IA (estilo, continuidad, gestos).
    - "pronunciations": lista de {"written": cómo se escribe, "spoken": cómo debe pronunciarse}. Agrégala para marcas, nombres comerciales, siglas o palabras difíciles. Si no hay, usa [].
    - "numbersToWords": true si la escena tiene números que la voz debe decir en palabras; si no, false.
    - "camera" (opcional): la toma, eligiendo SOLO estos códigos (uno por categoría; un solo movimiento por escena):
${cameraIdsForAI()}
      - "speed": "slow", "normal" o "fast" (velocidad del movimiento).
    - "extras": objeto con los campos extra del proyecto, usando exactamente sus nombres como claves.
- "project.customFields": lista de nombres de campos extra (ej. "Vestuario", "Emoción"). ${
    fields ? `Este proyecto usa: ${fields.map((f) => `"${f}"`).join(', ')}. Llénalos en "extras" de CADA escena.` : 'Si no hacen falta, usa [] y "extras": {}.'
  }
- Escribe los nombres comerciales correctamente (por ejemplo "TuApp.digital"); la pronunciación va solo en "pronunciations".
- NO inventes rutas de imágenes, archivos, enlaces, identificadores internos ni referencias a medios. No agregues campos que no estén aquí.
- Si más adelante te pido UNA sola escena (por ejemplo, una que faltó), responde con este mismo formato completo pero con un solo elemento en "scenes".

Ejemplo válido:
${JSON.stringify(example, null, 2)}
${project ? `\nProyecto actual: "${project.title}" (${project.aspectRatio}). Usa este título y orientación salvo que te pida otros.\n` : ''}
Mi idea para el video es:
`
}
