// Papelera: lo borrado se guarda dentro del proyecto (project.trash) para poder recuperarlo.
import type { BibleItem, Character, Project, Scene, TrashEntry } from '../../types'
import { sceneMediaIds, shotMediaIds } from '../coverage/shots'
import { nowIso, uid } from '../../utils'

/** Máximo de cosas en la papelera; las más viejas se van solas. */
export const TRASH_LIMIT = 100

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never
export type NewTrashEntry = DistributiveOmit<TrashEntry, 'id' | 'deletedAt'>

export function addToTrash(project: Project, entry: NewTrashEntry): TrashEntry[] {
  const e = { ...entry, id: uid('tr_'), deletedAt: nowIso() } as TrashEntry
  return [...(project.trash ?? []), e].slice(-TRASH_LIMIT)
}

const KIND_LABEL: Record<TrashEntry['kind'], string> = {
  scene: 'Escena',
  characters: 'Personaje',
  locations: 'Locación',
  props: 'Objeto',
  wardrobe: 'Vestuario',
  relation: 'Relación',
  version: 'Video',
  shot: 'Plano',
}
export const trashKindLabel = (e: TrashEntry) => KIND_LABEL[e.kind]

/** Nombre corto para mostrar en la lista. */
export function trashLabel(e: TrashEntry, project: Project, scenes: Record<string, Scene>): string {
  if (e.kind === 'scene') return e.scene.title || 'Escena sin título'
  if (e.kind === 'relation') {
    const name = (id: string) => project.characters?.find((c) => c.id === id)?.name ?? '¿?'
    return `${name(e.relation.a)} ↔ ${name(e.relation.b)}${e.relation.label ? ' · ' + e.relation.label : ''}`
  }
  if (e.kind === 'version') return `De la escena «${scenes[e.sceneId]?.title ?? 'que ya no existe'}»`
  if (e.kind === 'shot') return `${e.shot.name || 'Plano sin nombre'} · escena «${scenes[e.sceneId]?.title ?? 'que ya no existe'}»`
  return e.item.name || 'Sin nombre'
}

/** Imagen para la miniatura (si tiene). */
export function trashImage(e: TrashEntry): string | undefined {
  if (e.kind === 'scene') return e.scene.startImageId ?? e.scene.storyboardFrames[0]?.mediaId
  if (e.kind === 'version') return e.version.previewMediaId
  if (e.kind === 'shot') return e.shot.startImageId ?? e.shot.references?.[0]?.mediaId
  if (e.kind === 'relation') return undefined
  return e.item.imageId ?? e.item.tries?.[0]?.mediaId
}

function versionMedia(v: Scene['videoVersions'][number]): string[] {
  const ids = [v.mediaId]
  if (v.previewMediaId) ids.push(v.previewMediaId)
  v.clips?.forEach((c) => {
    ids.push(c.mediaId)
    if (c.previewMediaId) ids.push(c.previewMediaId)
  })
  return ids
}

/** Archivos que usa la papelera (la limpieza automática no los debe borrar). */
export function trashMediaIds(project: Project): string[] {
  const ids: string[] = []
  for (const e of project.trash ?? []) {
    if (e.kind === 'scene') ids.push(...sceneMediaIds(e.scene))
    else if (e.kind === 'shot') ids.push(...shotMediaIds(e.shot))
    else if (e.kind === 'version') ids.push(...versionMedia(e.version))
    else if (e.kind !== 'relation') {
      if (e.item.imageId) ids.push(e.item.imageId)
      e.item.tries?.forEach((t) => ids.push(t.mediaId))
    }
  }
  return ids
}

/** Saca algo de la papelera y lo regresa a su lugar. Si no se puede, dice por qué. */
export function restoreFromTrash(project: Project, scenes: Record<string, Scene>, entryId: string): { project: Project; scenes: Record<string, Scene> } | { error: string } {
  const e = project.trash?.find((x) => x.id === entryId)
  if (!e) return { error: 'Ya no está en la papelera.' }
  const trash = project.trash!.filter((x) => x.id !== entryId)
  const p: Project = { ...project, trash }

  if (e.kind === 'scene') {
    if (scenes[e.scene.id]) return { error: 'Esa escena ya está en el proyecto.' }
    const sceneIds = [...p.sceneIds]
    sceneIds.splice(Math.min(e.index, sceneIds.length), 0, e.scene.id)
    return { project: { ...p, sceneIds }, scenes: { ...scenes, [e.scene.id]: e.scene } }
  }
  if (e.kind === 'version') {
    const sc = scenes[e.sceneId]
    if (!sc) return { error: 'La escena de ese video ya no existe. Recupera primero la escena.' }
    if (sc.videoVersions.some((v) => v.id === e.version.id)) return { error: 'Ese video ya está en la escena.' }
    return { project: p, scenes: { ...scenes, [sc.id]: { ...sc, videoVersions: [...sc.videoVersions, e.version], activeVideoVersionId: sc.activeVideoVersionId ?? e.version.id } } }
  }
  if (e.kind === 'shot') {
    const sc = scenes[e.sceneId]
    if (!sc) return { error: 'La escena de ese plano ya no existe. Recupera primero la escena.' }
    const shots = sc.shots ?? []
    if (shots.some((s) => s.id === e.shot.id)) return { error: 'Ese plano ya está en la escena.' }
    const list = [...shots].sort((a, b) => a.order - b.order)
    list.splice(Math.min(e.index, list.length), 0, e.shot)
    return { project: p, scenes: { ...scenes, [sc.id]: { ...sc, shots: list.map((s, i) => ({ ...s, order: i })), updatedAt: nowIso() } } }
  }
  if (e.kind === 'relation') {
    const has = (id: string) => p.characters?.some((c) => c.id === id)
    if (!has(e.relation.a) || !has(e.relation.b)) return { error: 'Uno de los personajes de esa relación ya no existe. Recupéralo primero.' }
    return { project: { ...p, relations: [...(p.relations ?? []), e.relation] }, scenes }
  }
  const list = (p[e.kind] ?? []) as (BibleItem | Character)[]
  if (list.some((x) => x.id === e.item.id)) return { error: 'Ya está en el proyecto.' }
  const next = { ...p, [e.kind]: [...list, e.item] } as Project
  // Al regresar un personaje vuelven sus relaciones (si el otro personaje sigue ahí).
  const back = (e.relations ?? []).filter((r) => [r.a, r.b].every((id) => next.characters?.some((c) => c.id === id)))
  if (back.length) next.relations = [...(next.relations ?? []), ...back]
  return { project: next, scenes }
}
