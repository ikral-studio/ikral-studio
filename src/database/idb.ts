import Dexie, { type Table } from 'dexie'
import type { MediaAsset, MediaRecord, Project, Scene } from '../types'

/** En disco se guarda como ArrayBuffer: Safari falla a veces al guardar Blob/File. */
export interface StoredMedia extends MediaAsset {
  data: ArrayBuffer
  thumbData?: ArrayBuffer
  thumbType?: string
}

/** Respaldo automático: copia del proyecto y sus escenas (los archivos se comparten, no se duplican). */
export interface Snapshot {
  id: string
  projectId: string
  createdAt: string
  reason: 'auto' | 'before-restore' | 'before-import'
  project: Project
  scenes: Scene[]
}

class StudioDB extends Dexie {
  projects!: Table<Project, string>
  scenes!: Table<Scene, string>
  media!: Table<StoredMedia, string>
  kv!: Table<{ key: string; value: unknown }, string>
  snapshots!: Table<Snapshot, string>

  constructor() {
    super('ikral-studio')
    this.version(1).stores({
      projects: 'id, updatedAt',
      scenes: 'id, projectId',
      media: 'id, projectId',
      kv: 'key',
    })
    this.version(2).stores({
      snapshots: 'id, projectId, createdAt',
    })
  }
}

export const db = new StudioDB()

export async function putMedia(rec: MediaRecord) {
  const { blob, thumb, ...asset } = rec
  const stored: StoredMedia = {
    ...asset,
    data: await blob.arrayBuffer(),
    thumbData: thumb ? await thumb.arrayBuffer() : undefined,
    thumbType: thumb?.type,
  }
  await db.media.put(stored)
}

function toRecord(s: StoredMedia): MediaRecord {
  const { data, thumbData, thumbType, ...asset } = s
  return {
    ...asset,
    blob: new Blob([data], { type: asset.mimeType }),
    thumb: thumbData ? new Blob([thumbData], { type: thumbType || 'image/jpeg' }) : undefined,
  }
}

export async function getMedia(id: string): Promise<MediaRecord | undefined> {
  const s = await db.media.get(id)
  return s ? toRecord(s) : undefined
}

export async function getMediaAsset(id: string): Promise<MediaAsset | undefined> {
  const s = await db.media.get(id)
  if (!s) return undefined
  const { data, thumbData, thumbType, ...asset } = s
  void data
  void thumbData
  void thumbType
  return asset
}

export async function bulkGetMedia(ids: string[]): Promise<MediaRecord[]> {
  const rows = await db.media.bulkGet(ids)
  return rows.filter((r): r is StoredMedia => !!r).map(toRecord)
}

export async function listProjects(): Promise<Project[]> {
  return db.projects.orderBy('updatedAt').reverse().toArray()
}

export async function loadProject(id: string) {
  const project = await db.projects.get(id)
  if (!project) return null
  const scenes = await db.scenes.where('projectId').equals(id).toArray()
  return { project, scenes }
}

/** Guarda el proyecto y sus escenas; borra escenas que ya no existen. */
export async function saveProject(project: Project, scenes: Scene[]) {
  await db.transaction('rw', db.projects, db.scenes, async () => {
    await db.projects.put(project)
    const keep = new Set(scenes.map((s) => s.id))
    const stored = await db.scenes.where('projectId').equals(project.id).primaryKeys()
    const gone = stored.filter((id) => !keep.has(id))
    if (gone.length) await db.scenes.bulkDelete(gone)
    await db.scenes.bulkPut(scenes)
  })
}

export async function deleteProject(id: string) {
  await db.transaction('rw', db.projects, db.scenes, db.media, async () => {
    await db.projects.delete(id)
    await db.scenes.where('projectId').equals(id).delete()
    await db.media.where('projectId').equals(id).delete()
  })
  await db.snapshots.where('projectId').equals(id).delete()
}

/** Borra los archivos del proyecto que ya ninguna escena usa. */
export async function collectGarbage(projectId: string, scenes: Scene[], extraUsed?: string[]) {
  const used = new Set<string>()
  for (const s of scenes) {
    if (s.startImageId) used.add(s.startImageId)
    if (s.endImageId) used.add(s.endImageId)
    s.storyboardFrames.forEach((f) => used.add(f.mediaId))
    s.videoVersions.forEach((v) => used.add(v.mediaId))
  }
  extraUsed?.forEach((id) => used.add(id))
  // Los respaldos automáticos también cuentan: si se restaura uno, sus archivos deben seguir ahí.
  const snaps = await db.snapshots.where('projectId').equals(projectId).toArray()
  for (const sn of snaps) mediaIdsOf(sn.project, sn.scenes).forEach((id) => used.add(id))
  const ids = await db.media.where('projectId').equals(projectId).primaryKeys()
  const orphan = ids.filter((id) => !used.has(id))
  if (orphan.length) await db.media.bulkDelete(orphan)
  return orphan.length
}

export function mediaIdsOf(project: Project, scenes: Scene[]): string[] {
  const used: string[] = []
  for (const s of scenes) {
    if (s.startImageId) used.push(s.startImageId)
    if (s.endImageId) used.push(s.endImageId)
    s.storyboardFrames.forEach((f) => used.push(f.mediaId))
    s.videoVersions.forEach((v) => used.push(v.mediaId))
  }
  project.audioTracks?.forEach((t) => t.clips.forEach((c) => used.push(c.mediaId)))
  return used
}

export const SNAPSHOT_KEEP = 30

export async function addSnapshot(project: Project, scenes: Scene[], reason: Snapshot['reason']) {
  const snap: Snapshot = {
    id: `sn_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    projectId: project.id,
    createdAt: new Date().toISOString(),
    reason,
    project: structuredClone(project),
    scenes: structuredClone(scenes),
  }
  await db.snapshots.put(snap)
  const all = await db.snapshots.where('projectId').equals(project.id).sortBy('createdAt')
  const extra = all.slice(0, Math.max(0, all.length - SNAPSHOT_KEEP))
  if (extra.length) await db.snapshots.bulkDelete(extra.map((s) => s.id))
  return snap
}

export async function getSnapshot(id: string) {
  return db.snapshots.get(id)
}

/** Importa un proyecto completo (respaldo .zip) de una vez. */
export async function importProjectData(project: Project, scenes: Scene[], records: MediaRecord[]) {
  for (const r of records) await putMedia(r)
  await db.transaction('rw', db.projects, db.scenes, async () => {
    await db.scenes.bulkPut(scenes)
    await db.projects.put(project)
  })
}

export async function listSnapshots(projectId: string): Promise<Snapshot[]> {
  return (await db.snapshots.where('projectId').equals(projectId).sortBy('createdAt')).reverse()
}

export async function getKV<T>(key: string): Promise<T | undefined> {
  const row = await db.kv.get(key)
  return row?.value as T | undefined
}

export async function setKV(key: string, value: unknown) {
  await db.kv.put({ key, value })
}
