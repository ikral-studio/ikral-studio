// Cobertura: varios planos dentro de una escena.
// Regla de oro: una escena sin `shots` es UN plano implícito armado con sus campos de hoy.
// Todo el código nuevo lee los planos con `shotsOf(scene)`; los proyectos viejos no se tocan.
import type { Scene, Shot, StoryboardFrame, VideoVersion } from '../../types'
import { mapPrep, prepMediaIds } from '../bible/frames'
import { nowIso, uid } from '../../utils'

/** Id del plano implícito: siempre el mismo para la misma escena. */
export const implicitShotId = (scene: Pick<Scene, 'id'>) => `${scene.id}~1`

/** ¿La escena ya tiene cobertura (planos propios)? */
export const hasCoverage = (scene: Scene) => !!scene.shots?.length

/** Planos de la escena, en orden. Escena sin planos = un plano con sus datos de hoy (sin copiar nada). */
export function shotsOf(scene: Scene): Shot[] {
  if (hasCoverage(scene)) return [...scene.shots!].sort((a, b) => a.order - b.order)
  return [
    {
      id: implicitShotId(scene),
      order: 0,
      name: scene.title,
      duration: scene.plannedDuration,
      action: scene.script.action || undefined,
      sound: scene.script.soundDirection || undefined,
      camera: scene.script.camera,
      cameraDirection: scene.script.cameraDirection || undefined,
      prep: scene.prep,
      startImageId: scene.startImageId,
      endImageId: scene.endImageId,
      generationPrompt: scene.script.generationPrompt || undefined,
      references: scene.storyboardFrames,
      videoVersions: scene.videoVersions,
      activeVideoVersionId: scene.activeVideoVersionId,
      updatedAt: scene.updatedAt,
    },
  ]
}

/** Duración de la escena: la suma de sus planos, o la planeada si no tiene cobertura. */
export function sceneDuration(scene: Scene): number {
  if (!hasCoverage(scene)) return scene.plannedDuration
  return scene.shots!.reduce((sum, s) => sum + (s.duration || 0), 0)
}

/** Vuelve a numerar `order` 0, 1, 2… según el orden actual. Los ids no cambian. */
export function renumberShots(shots: Shot[]): Shot[] {
  return [...shots].sort((a, b) => a.order - b.order).map((s, i) => (s.order === i ? s : { ...s, order: i }))
}

/** Mueve un plano una posición. Solo cambian `order` y `updatedAt` de los planos que se movieron. */
export function moveShot(shots: Shot[], id: string, dir: -1 | 1, at = nowIso()): Shot[] {
  const list = renumberShots(shots)
  const i = list.findIndex((s) => s.id === id)
  const j = i + dir
  if (i < 0 || j < 0 || j >= list.length) return list
  const a = list[i]
  const b = list[j]
  list[i] = { ...b, order: i, updatedAt: at }
  list[j] = { ...a, order: j, updatedAt: at }
  return list
}

function versionMediaIds(v: VideoVersion): string[] {
  const ids = [v.mediaId]
  if (v.previewMediaId) ids.push(v.previewMediaId)
  v.clips?.forEach((c) => {
    ids.push(c.mediaId)
    if (c.previewMediaId) ids.push(c.previewMediaId)
  })
  return ids
}

/** Archivos que usa un plano (imágenes, pruebas, referencias y videos). */
export function shotMediaIds(shot: Shot): string[] {
  const ids: string[] = []
  if (shot.startImageId) ids.push(shot.startImageId)
  if (shot.endImageId) ids.push(shot.endImageId)
  for (const f of [shot.prep?.start, shot.prep?.end]) {
    if (!f) continue
    if (f.approvedId) ids.push(f.approvedId)
    f.tries?.forEach((t) => ids.push(t.mediaId))
  }
  shot.references?.forEach((r) => ids.push(r.mediaId))
  shot.videoVersions?.forEach((v) => ids.push(...versionMediaIds(v)))
  return ids
}

/** Todos los archivos de una escena, incluidos los de sus planos (para respaldos y limpieza). */
export function sceneMediaIds(s: Scene): string[] {
  const ids: string[] = []
  if (s.startImageId) ids.push(s.startImageId)
  if (s.endImageId) ids.push(s.endImageId)
  ids.push(...prepMediaIds(s))
  s.storyboardFrames.forEach((f) => ids.push(f.mediaId))
  s.videoVersions.forEach((v) => ids.push(...versionMediaIds(v)))
  s.shots?.forEach((sh) => ids.push(...shotMediaIds(sh)))
  return ids
}

/** Copia de los videos con ids nuevos (y el mapa viejo → nuevo para la versión activa). */
function copyVersions(list: VideoVersion[] | undefined, map: (id: string) => string | undefined = (id) => id) {
  const idMap = new Map<string, string>()
  const versions = (list ?? []).flatMap((v) => {
    const mediaId = map(v.mediaId)
    if (!mediaId) return []
    const id = uid('vv_')
    idMap.set(v.id, id)
    const clips = v.clips?.flatMap((c) => {
      const m = map(c.mediaId)
      return m ? [{ ...c, id: uid('vc_'), mediaId: m, previewMediaId: c.previewMediaId && map(c.previewMediaId) }] : []
    })
    return [{ ...v, id, mediaId, previewMediaId: v.previewMediaId && map(v.previewMediaId), clips: clips?.length ? clips : undefined }]
  })
  return { versions, idMap }
}

function copyFrames(list: StoryboardFrame[] | undefined, map: (id: string) => string | undefined = (id) => id): StoryboardFrame[] {
  return (list ?? []).flatMap((f) => {
    const mediaId = map(f.mediaId)
    return mediaId ? [{ ...f, id: uid('fr_'), mediaId }] : []
  })
}

/**
 * Copia de planos con ids nuevos (al duplicar una escena o importar un respaldo).
 * `map` cambia los ids de archivo; si devuelve undefined, esa referencia se quita.
 */
export function copyShots(shots: Shot[] | undefined, map?: (id?: string) => string | undefined): Shot[] | undefined {
  if (!shots) return undefined
  const m = map ?? ((id?: string) => id)
  return shots.map((s) => {
    const { versions, idMap } = copyVersions(s.videoVersions, (id) => m(id))
    return {
      ...structuredClone(s),
      id: uid('sh_'),
      startImageId: m(s.startImageId),
      endImageId: m(s.endImageId),
      prep: s.prep && mapPrep(s.prep, m),
      references: s.references && copyFrames(s.references, (id) => m(id)),
      videoVersions: s.videoVersions && versions,
      activeVideoVersionId: s.activeVideoVersionId ? idMap.get(s.activeVideoVersionId) : undefined,
    }
  })
}

/**
 * «Pasar a cobertura»: crea el Plano 1 COPIANDO (no moviendo) la cámara, las imágenes,
 * el prompt, los fotogramas y los videos de la escena. La escena conserva todo lo suyo.
 */
export function convertToCoverage(scene: Scene, at = nowIso()): Scene {
  if (hasCoverage(scene)) return scene
  const [implicit] = shotsOf(scene)
  const [shot] = copyShots([structuredClone(implicit)])!
  return { ...scene, shots: [{ ...shot, order: 0, updatedAt: at }], updatedAt: at }
}

/** Datos de texto de un plano (lo que viaja en el JSON v2). */
export type ShotText = Pick<Shot, 'name' | 'duration' | 'action' | 'dialogueLines' | 'sound' | 'continuity' | 'camera' | 'cameraDirection' | 'generationPrompt'>

/** Planos nuevos (ids nuevos) a partir de textos importados. */
export function shotsFromText(list: ShotText[], at = nowIso()): Shot[] {
  return list.map((t, i) => ({ ...t, id: uid('sh_'), order: i, updatedAt: at }))
}

/**
 * Pone textos nuevos en los planos de una escena SIN perder imágenes ni videos:
 * el plano N recibe el texto N (conserva sus archivos); los textos de más se agregan como planos nuevos;
 * los planos de más se quedan como están.
 */
export function applyShotText(current: Shot[] | undefined, list: ShotText[], at = nowIso()): Shot[] {
  const cur = renumberShots(current ?? [])
  const out = cur.map((s, i) => (list[i] ? { ...s, ...TEXT_RESET, ...list[i], updatedAt: at } : s))
  return [...out, ...shotsFromText(list.slice(cur.length), at).map((s, k) => ({ ...s, order: cur.length + k }))]
}
const TEXT_RESET = { action: undefined, dialogueLines: undefined, sound: undefined, continuity: undefined, cameraDirection: undefined, generationPrompt: undefined }

/** Nombres cortos para el aviso de lo que se pierde al exportar como v1. */
const LOST: [keyof Shot, string][] = [
  ['camera', 'la cámara'],
  ['duration', 'la duración'],
  ['continuity', 'las notas de continuidad'],
  ['sound', 'el sonido'],
  ['dialogueLines', 'qué diálogo va en cada plano'],
]

/**
 * Lo que se pierde al exportar como v1 (sin planos). Sin cobertura = lista vacía (no hay aviso).
 * Ej.: «Escena 3 "Cocina": 4 planos se unen en uno; se pierden la cámara, la duración… de cada plano».
 */
export function v1LossReport(scenes: Scene[]): string[] {
  const out: string[] = []
  scenes.forEach((s, i) => {
    if (!hasCoverage(s)) return
    const shots = shotsOf(s)
    const lost = LOST.filter(([k]) => shots.some((sh) => sh[k] !== undefined && sh[k] !== '')).map(([, t]) => t)
    const media = shots.some((sh) => shotMediaIds(sh).length) ? ' Las imágenes y videos de los planos no viajan en el JSON.' : ''
    const what = lost.length ? `; se pierden ${lost.join(', ')} de cada plano` : ''
    out.push(`Escena ${i + 1} «${s.title}»: ${shots.length === 1 ? '1 plano se vuelve' : `${shots.length} planos se unen en`} uno${what}.${media}`)
  })
  return out
}

/** Une los textos de los planos en los campos de la escena (para exportar v1). No se pierde texto. */
export function flattenToV1(scene: Scene): Pick<Scene['script'], 'action' | 'cameraDirection' | 'soundDirection' | 'generationPrompt'> & { plannedDuration: number } {
  const sc = scene.script
  if (!hasCoverage(scene)) return { action: sc.action, cameraDirection: sc.cameraDirection, soundDirection: sc.soundDirection, generationPrompt: sc.generationPrompt, plannedDuration: scene.plannedDuration }
  const shots = shotsOf(scene)
  const join = (head: string, part: (s: Shot, n: number) => string | undefined) => {
    const lines = shots.map((s, i) => part(s, i + 1)).filter((x): x is string => !!x?.trim())
    return [head.trim(), ...lines].filter(Boolean).join('\n')
  }
  const label = (s: Shot, n: number) => `Plano ${n} «${s.name}» (${s.duration} s)`
  return {
    action: join(sc.action, (s, n) => (s.action || s.continuity ? `${label(s, n)}: ${[s.action, s.continuity && `Continuidad: ${s.continuity}`].filter(Boolean).join(' · ')}` : undefined)),
    cameraDirection: join(sc.cameraDirection, (s, n) => (s.cameraDirection ? `${label(s, n)}: ${s.cameraDirection}` : undefined)),
    soundDirection: join(sc.soundDirection, (s, n) => (s.sound ? `${label(s, n)}: ${s.sound}` : undefined)),
    generationPrompt: join(sc.generationPrompt, (s, n) => (s.generationPrompt ? `${label(s, n)}: ${s.generationPrompt}` : undefined)),
    plannedDuration: Math.min(600, Math.max(0.5, sceneDuration(scene))),
  }
}

/**
 * Une los planos de una escena editada en dos lugares a la vez, plano por plano.
 * - Planos distintos cambiados de cada lado: se quedan los dos cambios.
 * - Plano nuevo de cualquier lado: se respeta. Plano borrado por uno: se queda borrado.
 * - El mismo plano cambiado de los dos lados: gana el más reciente; el otro va en `conflicts` (a la papelera).
 */
export function mergeShots(base: Shot[] | undefined, disk: Shot[] | undefined, local: Shot[] | undefined, preferLocal: boolean): { shots: Shot[] | undefined; conflicts: Shot[] } {
  const conflicts: Shot[] = []
  if (!disk && !local) return { shots: undefined, conflicts }
  const b = new Map((base ?? []).map((x) => [x.id, x]))
  const d = new Map((disk ?? []).map((x) => [x.id, x]))
  const l = new Map((local ?? []).map((x) => [x.id, x]))
  const [first, second] = preferLocal ? [local ?? [], disk ?? []] : [disk ?? [], local ?? []]
  const out: Shot[] = []
  for (const x of [...first, ...second.filter((y) => !first.some((f) => f.id === y.id))]) {
    const a = d.get(x.id)
    const c = l.get(x.id)
    const old = b.get(x.id)
    if (old && (!a || !c)) continue
    if (!a || !c) {
      out.push(x)
      continue
    }
    const localNewer = a.updatedAt === c.updatedAt ? preferLocal : (c.updatedAt ?? '') > (a.updatedAt ?? '')
    const [win, lose] = localNewer ? [c, a] : [a, c]
    out.push(win)
    const bothChanged = old && a.updatedAt !== old.updatedAt && c.updatedAt !== old.updatedAt && a.updatedAt !== c.updatedAt
    if (bothChanged) conflicts.push(lose)
  }
  return { shots: renumberShots(out), conflicts }
}
