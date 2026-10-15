import Dexie, { type Table } from 'dexie'
import type { MediaAsset, MediaRecord, Project, Scene } from '../types'

/** En disco se guarda como ArrayBuffer: Safari falla a veces al guardar Blob/File. */
export interface StoredMedia extends MediaAsset {
  data: ArrayBuffer
  thumbData?: ArrayBuffer
  thumbType?: string
}

class StudioDB extends Dexie {
  projects!: Table<Project, string>
  scenes!: Table<Scene, string>
  media!: Table<StoredMedia, string>
  kv!: Table<{ key: string; value: unknown }, string>

  constructor() {
    super('ikral-studio')
    this.version(1).stores({
      projects: 'id, updatedAt',
      scenes: 'id, projectId',
      media: 'id, projectId',
      kv: 'key',
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
}

/** Borra los archivos del proyecto que ya ninguna escena usa. */
export async function collectGarbage(projectId: string, scenes: Scene[]) {
  const used = new Set<string>()
  for (const s of scenes) {
    if (s.startImageId) used.add(s.startImageId)
    if (s.endImageId) used.add(s.endImageId)
    s.storyboardFrames.forEach((f) => used.add(f.mediaId))
    s.videoVersions.forEach((v) => used.add(v.mediaId))
  }
  const ids = await db.media.where('projectId').equals(projectId).primaryKeys()
  const orphan = ids.filter((id) => !used.has(id))
  if (orphan.length) await db.media.bulkDelete(orphan)
  return orphan.length
}

export async function getKV<T>(key: string): Promise<T | undefined> {
  const row = await db.kv.get(key)
  return row?.value as T | undefined
}

export async function setKV(key: string, value: unknown) {
  await db.kv.put({ key, value })
}
