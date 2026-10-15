// Funciones puras: todo lo que se ve en guion maestro, timeline y reproductor
// se calcula desde las escenas. No hay copias del guion.
import type { Project, Scene, SceneStatus, VideoVersion } from '../../types'
import { formatDuration, pad2 } from '../../utils'

export function orderedScenes(project: Project | null, scenes: Record<string, Scene>): Scene[] {
  if (!project) return []
  return project.sceneIds.map((id) => scenes[id]).filter((s): s is Scene => !!s)
}

export function activeVideo(scene: Scene): VideoVersion | undefined {
  if (!scene.activeVideoVersionId) return undefined
  return scene.videoVersions.find((v) => v.id === scene.activeVideoVersionId)
}

/** Duración que ocupa la escena en timeline y reproducción. */
export function effectiveDuration(scene: Scene): number {
  const v = activeVideo(scene)
  if (v && v.duration > 0) return v.duration
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

export function sceneScriptText(scene: Scene, n: number): string {
  const lines = [sceneHeading(scene, n)]
  for (const [key, label] of SECTIONS) {
    const v = String(scene.script[key] ?? '').trim()
    if (v) lines.push(`${label}: ${v}`)
  }
  return lines.join('\n')
}

export function masterScriptText(project: Project, scenes: Scene[]): string {
  const head = `${project.title}\nGuion completo · ${scenes.length} escenas · ${formatDuration(
    totalDuration(buildSegments(scenes)),
  )}`
  return [head, ...scenes.map((s, i) => sceneScriptText(s, i + 1))].join('\n\n') + '\n'
}

export function masterScriptMarkdown(project: Project, scenes: Scene[]): string {
  const out = [
    `# ${project.title}`,
    '',
    `_Guion completo · ${scenes.length} escenas · ${formatDuration(totalDuration(buildSegments(scenes)))}_`,
  ]
  scenes.forEach((s, i) => {
    out.push('', `## Escena ${pad2(i + 1)} · ${s.title} (${formatDuration(effectiveDuration(s))})`)
    for (const [key, label] of SECTIONS) {
      const v = String(s.script[key] ?? '').trim()
      if (v) out.push('', `**${label}:** ${v}`)
    }
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
export function generationPrompt(scene: Scene): string {
  const s = scene.script
  const parts = [s.generationPrompt, s.action, s.cameraDirection]
    .map((x) => x.trim())
    .filter(Boolean)
  if (s.dialogue.trim()) parts.push(`Diálogo: ${s.dialogue.trim()}`)
  if (s.soundDirection.trim()) parts.push(s.soundDirection.trim())
  return applyPronunciations(parts.join('\n\n'), scene)
}

export function allPromptsText(project: Project, scenes: Scene[]): string {
  return (
    [`${project.title} · Prompts de generación`, ...scenes.map((s, i) => `--- Escena ${pad2(i + 1)} · ${s.title} ---\n${generationPrompt(s)}`)].join(
      '\n\n',
    ) + '\n'
  )
}
