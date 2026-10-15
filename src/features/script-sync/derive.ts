// Funciones puras: todo lo que se ve en guion maestro, timeline y reproductor
// se calcula desde las escenas. No hay copias del guion.
import type { CustomField, Project, Scene, SceneStatus, VideoVersion } from '../../types'
import { formatDuration, pad2 } from '../../utils'
import { numbersToWordsInText } from '../../utils/numberWords'
import { cameraPrompt, cameraSpanish } from '../camera/camera'
import { charactersPrompt, stylePrompt, styleSpanish } from '../project-style/style'

export function orderedScenes(project: Project | null, scenes: Record<string, Scene>): Scene[] {
  if (!project) return []
  return project.sceneIds.map((id) => scenes[id]).filter((s): s is Scene => !!s)
}

export function activeVideo(scene: Scene): VideoVersion | undefined {
  if (!scene.activeVideoVersionId) return undefined
  return scene.videoVersions.find((v) => v.id === scene.activeVideoVersionId)
}

/** Tramo del archivo de video que se usa (recorte no destructivo). */
export function videoRange(v: VideoVersion): { from: number; to: number; length: number } {
  const from = Math.max(0, Math.min(v.trimIn ?? 0, v.duration))
  const to = Math.max(from, Math.min(v.trimOut ?? v.duration, v.duration))
  return { from, to, length: to - from }
}

/** Duración que ocupa la escena en timeline y reproducción. */
export function effectiveDuration(scene: Scene): number {
  const v = activeVideo(scene)
  if (v && v.duration > 0) return Math.max(0.1, videoRange(v).length)
  return Math.max(0.5, scene.plannedDuration)
}

export function deriveStatus(scene: Scene): SceneStatus {
  if (scene.reviewed) return 'reviewed'
  if (activeVideo(scene)) return 'video-imported'
  const hasImages = !!(scene.startImageId || scene.endImageId || scene.storyboardFrames.length)
  const s = scene.script
  const hasScript = !!(s.action.trim() || s.generationPrompt.trim())
  if (hasImages && hasScript) return 'video-pending'
  if (hasScript) return 'script-ready'
  if (hasImages) return 'storyboard-ready'
  return 'draft'
}

export const STATUS_LABEL: Record<SceneStatus, string> = {
  draft: 'Sin preparar',
  'storyboard-ready': 'Storyboard listo',
  'script-ready': 'Guion listo',
  'video-pending': 'Video pendiente',
  'video-imported': 'Video importado',
  reviewed: 'Revisado',
}

export interface Segment {
  scene: Scene
  index: number
  start: number
  end: number
  duration: number
  video?: VideoVersion
}

export function buildSegments(scenes: Scene[]): Segment[] {
  let t = 0
  return scenes.map((scene, index) => {
    const duration = effectiveDuration(scene)
    const seg: Segment = { scene, index, start: t, end: t + duration, duration, video: activeVideo(scene) }
    t += duration
    return seg
  })
}

export const totalDuration = (segments: Segment[]) =>
  segments.length ? segments[segments.length - 1].end : 0

/** Tiempo global → escena e instante interno. */
export function locateTime(segments: Segment[], t: number): { index: number; offset: number } {
  if (!segments.length) return { index: -1, offset: 0 }
  const total = totalDuration(segments)
  const time = Math.min(Math.max(0, t), total)
  for (const seg of segments) {
    if (time < seg.end) return { index: seg.index, offset: time - seg.start }
  }
  const last = segments[segments.length - 1]
  return { index: last.index, offset: last.duration }
}

/** Imágenes de storyboard en orden: inicial, intermedias, final. */
export function storyboardMediaIds(scene: Scene): string[] {
  const ids: string[] = []
  if (scene.startImageId) ids.push(scene.startImageId)
  ;[...scene.storyboardFrames].sort((a, b) => a.order - b.order).forEach((f) => ids.push(f.mediaId))
  if (scene.endImageId) ids.push(scene.endImageId)
  return ids
}

// ---------- Textos ----------

export function sceneHeading(scene: Scene, n: number): string {
  return `ESCENA ${pad2(n)} · ${scene.title.toUpperCase()} · ${formatDuration(effectiveDuration(scene))}`
}

const SECTIONS: [keyof Scene['script'], string][] = [
  ['action', 'Acción'],
  ['dialogue', 'Diálogo'],
  ['cameraDirection', 'Dirección'],
  ['soundDirection', 'Sonido'],
]

/** Campos extra con texto, en el orden del proyecto. */
export function extraEntries(scene: Scene, fields: CustomField[] = []): [string, string][] {
  const ex = scene.script.extras ?? {}
  return fields.map((f): [string, string] => [f.name, (ex[f.id] ?? '').trim()]).filter(([, v]) => v)
}

export function sceneScriptText(scene: Scene, n: number, fields: CustomField[] = []): string {
  const lines = [sceneHeading(scene, n)]
  for (const [key, label] of SECTIONS) {
    const v = String(scene.script[key] ?? '').trim()
    if (v) lines.push(`${label}: ${v}`)
  }
  const cam = cameraSpanish(scene.script.camera)
  if (cam) lines.push(`Cámara: ${cam}`)
  for (const [name, v] of extraEntries(scene, fields)) lines.push(`${name}: ${v}`)
  return lines.join('\n')
}

export function masterScriptText(project: Project, scenes: Scene[]): string {
  const style = styleSpanish(project)
  const head = `${project.title}\nGuion completo · ${scenes.length} escenas · ${formatDuration(
    totalDuration(buildSegments(scenes)),
  )}${style ? `\nEstilo: ${style}` : ''}`
  return [head, ...scenes.map((s, i) => sceneScriptText(s, i + 1, project.customFields))].join('\n\n') + '\n'
}

export function masterScriptMarkdown(project: Project, scenes: Scene[]): string {
  const out = [
    `# ${project.title}`,
    '',
    `_Guion completo · ${scenes.length} escenas · ${formatDuration(totalDuration(buildSegments(scenes)))}_`,
  ]
  if (styleSpanish(project)) out.push('', `**Estilo:** ${styleSpanish(project)}`)
  const chars = (project.characters ?? []).filter((c) => c.name.trim())
  if (chars.length) out.push('', '**Personajes:**', ...chars.map((c) => `- ${c.name}: ${c.description}`))
  scenes.forEach((s, i) => {
    out.push('', `## Escena ${pad2(i + 1)} · ${s.title} (${formatDuration(effectiveDuration(s))})`)
    for (const [key, label] of SECTIONS) {
      const v = String(s.script[key] ?? '').trim()
      if (v) out.push('', `**${label}:** ${v}`)
    }
    const cam = cameraSpanish(s.script.camera)
    if (cam) out.push('', `**Cámara:** ${cam}`)
    for (const [name, v] of extraEntries(s, project.customFields)) out.push('', `**${name}:** ${v}`)
  })
  return out.join('\n') + '\n'
}

/** Aplica solo las pronunciaciones que el usuario definió en esa escena. */
export function applyPronunciations(text: string, scene: Scene): string {
  let out = text
  for (const p of scene.script.pronunciations) {
    const w = p.written.trim()
    if (!w || !p.spoken.trim()) continue
    out = out.split(w).join(p.spoken.trim())
  }
  return out
}

/** Texto limpio para pegar en Higgsfield, Kling, Wan… */
export function generationPrompt(scene: Scene, fields: CustomField[] = [], project?: Project | null): string {
  const s = scene.script
  const parts = [stylePrompt(project), s.generationPrompt, s.action, charactersPrompt(project, scene), s.cameraDirection, cameraPrompt(s.camera)]
    .map((x) => x.trim())
    .filter(Boolean)
  for (const [name, v] of extraEntries(scene, fields)) parts.push(`${name}: ${v}`)
  if (s.dialogue.trim()) parts.push(`Diálogo: ${s.dialogue.trim()}`)
  if (s.soundDirection.trim()) parts.push(s.soundDirection.trim())
  const text = applyPronunciations(parts.join('\n\n'), scene)
  return s.numbersToWords ? numbersToWordsInText(text) : text
}

export function allPromptsText(project: Project, scenes: Scene[]): string {
  return (
    [`${project.title} · Prompts de generación`, ...scenes.map((s, i) => `--- Escena ${pad2(i + 1)} · ${s.title} ---\n${generationPrompt(s, project.customFields, project)}`)].join(
      '\n\n',
    ) + '\n'
  )
}
