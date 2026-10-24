// Preproducción: imagen inicial y final de cada escena. Se proponen leyendo la escena,
// se prueban varias, se aprueba una y al final pasan todas juntas a Edición.
import type { FramePlan, Project, Scene, Shot } from '../../types'
import { charactersInScene, stylePrompt } from '../project-style/style'
import { cameraPrompt } from '../camera/camera'
import { sceneStatesPrompt } from './itemStates'

export type FrameSlot = 'start' | 'end'

/** Todos los archivos que usa la preproducción de una escena (para que la limpieza no los borre). */
export function prepMediaIds(s: Scene): string[] {
  const ids: string[] = []
  for (const f of [s.prep?.start, s.prep?.end]) {
    if (!f) continue
    if (f.approvedId) ids.push(f.approvedId)
    f.tries?.forEach((t) => ids.push(t.mediaId))
  }
  return ids
}

/** Cambia los ids de archivo de la preproducción (al restaurar un respaldo). */
export function mapPrep(prep: NonNullable<Scene['prep']>, map: (id?: string) => string | undefined): Scene['prep'] {
  const one = (f?: FramePlan): FramePlan | undefined =>
    f && {
      ...f,
      approvedId: map(f.approvedId),
      tries: f.tries?.flatMap((t) => {
        const mediaId = map(t.mediaId)
        return mediaId ? [{ ...t, mediaId }] : []
      }),
    }
  return { start: one(prep.start), end: one(prep.end) }
}

/** Prompt de la imagen inicial o final: lo que pasa en la escena + personajes + cámara + estilo de la Biblia. */
export function framePrompt(p: Project | null | undefined, scene: Scene, slot: FrameSlot, n: number): string {
  const s = scene.script
  const chars = charactersInScene(p, scene).map((c) => `${c.name.trim()}: ${c.description.trim()}`)
  const ratio = p?.aspectRatio === '9:16' ? 'vertical 9:16' : 'horizontal 16:9'
  return [
    slot === 'start'
      ? `Opening frame (first image) of scene ${n} "${scene.title.trim()}" of a video, ${ratio}. Show the moment when the scene BEGINS.`
      : `Closing frame (last image) of scene ${n} "${scene.title.trim()}" of a video, ${ratio}. Show the moment when the scene ENDS, after the action; same place and characters as the opening frame.`,
    s.action.trim() && `What happens (Spanish): ${s.action.trim()}`,
    s.dialogue.trim() && `Dialogue (Spanish, for expressions only, no text in the image): ${s.dialogue.trim()}`,
    s.generationPrompt.trim(),
    chars.length && `Characters (keep them exactly like this): ${chars.join('; ')}`,
    sceneStatesPrompt(p, scene),
    cameraPrompt(s.camera),
    s.cameraDirection.trim(),
    stylePrompt(p),
    'No text, no subtitles, no watermark.',
  ]
    .filter(Boolean)
    .join('\n')
}

/**
 * Prompt de la imagen inicial o final de un plano de la cobertura: el plano (nombre, acción, cámara,
 * continuidad) dentro del contexto de su escena, con los personajes y el estilo de la Biblia.
 */
export function shotFramePrompt(p: Project | null | undefined, scene: Scene, shot: Shot, slot: FrameSlot, sceneN: number, shotN: number, count?: number): string {
  const s = scene.script
  const shotText = [shot.name, shot.action, shot.cameraDirection, shot.continuity, shot.generationPrompt].filter(Boolean).join(' ')
  const chars = charactersInScene(p, { ...scene, script: { ...s, action: `${s.action} ${shotText}` } }).map((c) => `${c.name.trim()}: ${c.description.trim()}`)
  const ratio = p?.aspectRatio === '9:16' ? 'vertical 9:16' : 'horizontal 16:9'
  const of = count ? ` of ${count}` : ''
  const name = shot.name.trim() ? ` "${shot.name.trim()}"` : ''
  return [
    slot === 'start'
      ? `Opening frame (first image) of shot ${shotN}${of}${name} of scene ${sceneN} "${scene.title.trim()}" of a video, ${ratio}. Show the moment when this shot BEGINS.`
      : `Closing frame (last image) of shot ${shotN}${of}${name} of scene ${sceneN} "${scene.title.trim()}" of a video, ${ratio}. Show the moment when this shot ENDS; same place and characters as its opening frame.`,
    shot.action?.trim() && `What happens in this shot (Spanish): ${shot.action.trim()}`,
    s.action.trim() && `Scene context (Spanish): ${s.action.trim()}`,
    s.dialogue.trim() && `Scene dialogue (Spanish, for expressions only, no text in the image): ${s.dialogue.trim()}`,
    shot.continuity?.trim() && `Continuity (Spanish): ${shot.continuity.trim()}`,
    shot.generationPrompt?.trim(),
    chars.length && `Characters (keep them exactly like this): ${chars.join('; ')}`,
    sceneStatesPrompt(p, scene),
    cameraPrompt(shot.camera),
    shot.cameraDirection?.trim(),
    stylePrompt(p),
    'No text, no subtitles, no watermark.',
  ]
    .filter(Boolean)
    .join('\n')
}

/** Cuántas imágenes (inicial + final) ya están aprobadas, de cuántas. */
export function framesProgress(scenes: Scene[]): { approved: number; total: number } {
  let approved = 0
  for (const s of scenes) approved += (s.prep?.start?.approvedId ? 1 : 0) + (s.prep?.end?.approvedId ? 1 : 0)
  return { approved, total: scenes.length * 2 }
}

export type FrameToApply = { sceneId: string; shotId?: string; slot: FrameSlot; mediaId: string; replaces: boolean }

/**
 * Lo que cambiaría en Edición al pasar las aprobadas: por escena (y por plano, si la escena está en
 * cobertura), qué imagen se pone y si reemplaza otra.
 */
export function framesToApply(scenes: Scene[]): FrameToApply[] {
  const out: FrameToApply[] = []
  for (const s of scenes) {
    for (const slot of ['start', 'end'] as const) {
      const id = s.prep?.[slot]?.approvedId
      const cur = slot === 'start' ? s.startImageId : s.endImageId
      if (id && id !== cur) out.push({ sceneId: s.id, slot, mediaId: id, replaces: !!cur })
    }
    if (!s.shots?.length) continue
    for (const sh of [...s.shots].sort((a, b) => a.order - b.order))
      for (const slot of ['start', 'end'] as const) {
        const id = sh.prep?.[slot]?.approvedId
        const cur = slot === 'start' ? sh.startImageId : sh.endImageId
        if (id && id !== cur) out.push({ sceneId: s.id, shotId: sh.id, slot, mediaId: id, replaces: !!cur })
      }
  }
  return out
}
