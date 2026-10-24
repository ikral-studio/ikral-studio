// Funciones puras: todo lo que se ve en guion maestro, timeline y reproductor
// se calcula desde las escenas. No hay copias del guion.
import type { CustomField, Project, Scene, SceneStatus, Shot, VideoClip, VideoVersion } from '../../types'
import { hasCoverage, shotsOf } from '../coverage/shots'
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

/** Todos los videos de una versión, en orden (el primero es la versión misma). */
export function versionClips(v: VideoVersion): VideoClip[] {
  return [{ id: v.id, mediaId: v.mediaId, previewMediaId: v.previewMediaId, duration: v.duration, width: v.width, height: v.height, trimIn: v.trimIn, trimOut: v.trimOut }, ...(v.clips ?? [])]
}

/** Vuelve a armar la versión a partir de su lista de videos. */
export function withClips(v: VideoVersion, clips: VideoClip[]): VideoVersion {
  const [first, ...rest] = clips
  // El id de la versión es del primer video; si otro lo traía (por reordenar), recibe uno nuevo.
  const others = rest.map((c) => (c.id === v.id ? { ...c, id: `vc_${Math.random().toString(36).slice(2, 10)}` } : c))
  return { ...v, mediaId: first.mediaId, previewMediaId: first.previewMediaId, duration: first.duration, width: first.width, height: first.height, trimIn: first.trimIn, trimOut: first.trimOut, clips: others.length ? others : undefined }
}

/** Recorta una orilla de la versión (izquierda = primer video; derecha = último). No daña el archivo. */
export function trimEdge(v: VideoVersion, edge: 'left' | 'right', fileTime: number): VideoVersion {
  const clips = versionClips(v)
  const i = edge === 'left' ? 0 : clips.length - 1
  const c = clips[i]
  const from = c.trimIn ?? 0
  const to = c.trimOut ?? c.duration
  const r = (x: number) => Math.round(x * 100) / 100
  const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))
  clips[i] = edge === 'left' ? { ...c, trimIn: r(clamp(fileTime, 0, to - 0.3)) } : { ...c, trimOut: r(clamp(fileTime, from + 0.3, c.duration)) }
  return withClips(v, clips)
}

export interface PlacedClip {
  clip: VideoClip
  index: number
  /** Dónde empieza dentro de la escena (segundos). */
  start: number
  from: number
  to: number
  length: number
}

/** Cada video con su lugar dentro de la escena. */
export function placedClips(v: VideoVersion): PlacedClip[] {
  let t = 0
  return versionClips(v).map((clip, index) => {
    const r = videoRange(clip)
    const p = { clip, index, start: t, from: r.from, to: r.to, length: r.length }
    t += r.length
    return p
  })
}

/** Qué video y en qué segundo, para un instante dentro de la escena. */
export function clipAt(v: VideoVersion, offset: number): PlacedClip {
  const list = placedClips(v)
  return list.find((p) => offset < p.start + p.length) ?? list[list.length - 1]
}

/** Largo total que usa la versión (todos sus videos, con recortes). */
export function versionLength(v: VideoVersion): number {
  return placedClips(v).reduce((a, p) => a + p.length, 0)
}

/** Tramo del archivo de video que se usa (recorte no destructivo). */
export function videoRange(v: { duration: number; trimIn?: number; trimOut?: number }): { from: number; to: number; length: number } {
  const from = Math.max(0, Math.min(v.trimIn ?? 0, v.duration))
  const to = Math.max(from, Math.min(v.trimOut ?? v.duration, v.duration))
  return { from, to, length: to - from }
}

/** Video activo de un plano. */
export function shotVideo(shot: Pick<Shot, 'videoVersions' | 'activeVideoVersionId'>): VideoVersion | undefined {
  if (!shot.activeVideoVersionId) return undefined
  return shot.videoVersions?.find((v) => v.id === shot.activeVideoVersionId)
}

/** Duración que ocupa un plano: la de su video, o la planeada. */
export function shotLength(shot: Shot): number {
  const v = shotVideo(shot)
  if (v && v.duration > 0) return Math.max(0.1, versionLength(v))
  return Math.max(0.5, shot.duration || 0)
}

/** Un plano con su lugar dentro de la escena (en la línea de tiempo y el reproductor). */
export interface ShotPart {
  shot: Shot
  /** Número del plano dentro de la escena (0, 1, 2…). */
  index: number
  /** Dónde empieza dentro de la escena (segundos). */
  start: number
  duration: number
  video?: VideoVersion
}

/**
 * Los planos de la escena uno tras otro. Escena sin cobertura = un solo tramo
 * con el video y la duración de la escena (igual que siempre).
 */
export function shotParts(scene: Scene): ShotPart[] {
  if (!hasCoverage(scene)) {
    const [shot] = shotsOf(scene)
    const v = activeVideo(scene)
    const duration = v && v.duration > 0 ? Math.max(0.1, versionLength(v)) : Math.max(0.5, scene.plannedDuration)
    return [{ shot, index: 0, start: 0, duration, video: v }]
  }
  let t = 0
  return shotsOf(scene).map((shot, index) => {
    const duration = shotLength(shot)
    const part: ShotPart = { shot, index, start: t, duration, video: shotVideo(shot) }
    t += duration
    return part
  })
}

/** Duración que ocupa la escena en timeline y reproducción (con cobertura: suma de sus planos). */
export function effectiveDuration(scene: Scene): number {
  return shotParts(scene).reduce((a, p) => a + p.duration, 0)
}

/** ¿Qué plano toca en un instante dentro de la escena? */
export function partAt(parts: ShotPart[], offset: number): ShotPart {
  return parts.find((p) => offset < p.start + p.duration) ?? parts[parts.length - 1]
}

/**
 * Qué plano y qué video tocan en un instante dentro de la escena.
 * `placed.start` se cuenta desde el inicio de la ESCENA (no del plano). Sin video: `placed` vacío.
 */
export function placeInScene(seg: Pick<Segment, 'parts'>, offset: number): { part: ShotPart; placed?: PlacedClip } {
  const part = partAt(seg.parts, offset)
  if (!part.video) return { part }
  const p = clipAt(part.video, offset - part.start)
  return { part, placed: { ...p, start: part.start + p.start } }
}

export function deriveStatus(scene: Scene): SceneStatus {
  if (scene.reviewed) return 'reviewed'
  if (hasCoverage(scene) ? scene.shots!.every((s) => shotVideo(s)) : activeVideo(scene)) return 'video-imported'
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
  /** Video de la escena (solo sin cobertura; con planos, cada plano trae el suyo en `parts`). */
  video?: VideoVersion
  /** Planos de la escena con su lugar (siempre al menos uno). */
  parts: ShotPart[]
}

export function buildSegments(scenes: Scene[]): Segment[] {
  let t = 0
  return scenes.map((scene, index) => {
    const parts = shotParts(scene)
    const duration = parts.reduce((a, p) => a + p.duration, 0)
    const seg: Segment = { scene, index, start: t, end: t + duration, duration, video: hasCoverage(scene) ? undefined : activeVideo(scene), parts }
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

/** Imágenes de storyboard de un plano: inicial (o la aprobada), referencias, final. */
export function shotStoryboardIds(shot: Shot): string[] {
  const ids: string[] = []
  const start = shot.startImageId ?? shot.prep?.start?.approvedId
  const end = shot.endImageId ?? shot.prep?.end?.approvedId
  if (start) ids.push(start)
  ;[...(shot.references ?? [])].sort((a, b) => a.order - b.order).forEach((f) => ids.push(f.mediaId))
  if (end) ids.push(end)
  return ids
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
