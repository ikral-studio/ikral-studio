// Respaldo portátil: un .zip con project.json + los archivos reales (no URLs temporales).
import JSZip from 'jszip'
import { bulkGetMedia, importProjectData } from '../../database/db'
import type { MediaAsset, MediaRecord, Project, Scene } from '../../types'
import { extFromMime, nowIso, uid } from '../../utils'
import { mapPrep, prepMediaIds } from '../bible/frames'
import { bibleMediaIds, mapBibleMedia } from '../bible/items'

const FORMAT = 'ikral-studio-backup'

interface Manifest {
  format: typeof FORMAT
  version: 1
  exportedAt: string
  project: Project
  scenes: Scene[]
  media: (MediaAsset & { file: string; thumbFile?: string })[]
}

export async function exportProjectZip(project: Project, scenes: Scene[]): Promise<Blob> {
  const zip = new JSZip()
  const used = new Set<string>()
  scenes.forEach((s) => {
    if (s.startImageId) used.add(s.startImageId)
    if (s.endImageId) used.add(s.endImageId)
    prepMediaIds(s).forEach((id) => used.add(id))
    s.storyboardFrames.forEach((f) => used.add(f.mediaId))
    s.videoVersions.forEach((v) => {
      used.add(v.mediaId)
      if (v.previewMediaId) used.add(v.previewMediaId)
      v.clips?.forEach((c) => {
        used.add(c.mediaId)
        if (c.previewMediaId) used.add(c.previewMediaId)
      })
    })
  })
  project.audioTracks?.forEach((t) => t.clips.forEach((c) => used.add(c.mediaId)))
  bibleMediaIds(project).forEach((id) => used.add(id))
  const records = await bulkGetMedia([...used])
  const media: Manifest['media'] = []
  for (const rec of records) {
    const { blob, thumb, ...asset } = rec
    const file = `media/${rec.id}.${extFromMime(rec.mimeType)}`
    zip.file(file, blob)
    let thumbFile: string | undefined
    if (thumb) {
      thumbFile = `thumbs/${rec.id}.jpg`
      zip.file(thumbFile, thumb)
    }
    media.push({ ...asset, file, thumbFile })
  }
  const manifest: Manifest = { format: FORMAT, version: 1, exportedAt: nowIso(), project, scenes, media }
  zip.file('project.json', JSON.stringify(manifest, null, 2))
  return zip.generateAsync({ type: 'blob', compression: 'STORE' })
}

/** Importa un respaldo como proyecto nuevo (IDs nuevos, relaciones conservadas). */
export async function importProjectZip(file: Blob): Promise<string> {
  let zip: JSZip
  try {
    zip = await JSZip.loadAsync(file)
  } catch {
    throw new Error('El archivo no es un respaldo .zip válido.')
  }
  const raw = await zip.file('project.json')?.async('string')
  if (!raw) throw new Error('El respaldo no tiene project.json.')
  const m = JSON.parse(raw) as Manifest
  if (m.format !== FORMAT) throw new Error('Este archivo no es un respaldo de IKRAL Studio.')

  const projectId = uid('pj_')
  const mediaMap = new Map<string, string>()
  const records: MediaRecord[] = []
  for (const asset of m.media) {
    const entry = zip.file(asset.file)
    if (!entry) continue
    const data = await entry.async('blob')
    const thumbData = asset.thumbFile ? await zip.file(asset.thumbFile)?.async('blob') : undefined
    const id = uid('md_')
    mediaMap.set(asset.id, id)
    const { file: _f, thumbFile: _t, ...meta } = asset
    void _f
    void _t
    records.push({
      ...meta,
      id,
      projectId,
      blob: new Blob([data], { type: asset.mimeType }),
      thumb: thumbData ? new Blob([thumbData], { type: 'image/jpeg' }) : undefined,
    })
  }
  const mapMedia = (id?: string) => (id ? mediaMap.get(id) : undefined)
  const sceneMap = new Map<string, string>()
  const scenes: Scene[] = m.scenes.map((s) => {
    const id = uid('sc_')
    sceneMap.set(s.id, id)
    const vmap = new Map<string, string>()
    const videoVersions = s.videoVersions
      .filter((v) => mediaMap.has(v.mediaId))
      .map((v) => {
        const nid = uid('vv_')
        vmap.set(v.id, nid)
        const clips = v.clips
          ?.filter((c) => mediaMap.has(c.mediaId))
          .map((c) => ({ ...c, id: uid('vc_'), mediaId: mediaMap.get(c.mediaId)!, previewMediaId: mapMedia(c.previewMediaId) }))
        return { ...v, id: nid, mediaId: mediaMap.get(v.mediaId)!, previewMediaId: mapMedia(v.previewMediaId), clips: clips?.length ? clips : undefined }
      })
    return {
      ...s,
      id,
      projectId,
      startImageId: mapMedia(s.startImageId),
      endImageId: mapMedia(s.endImageId),
      prep: s.prep && mapPrep(s.prep, mapMedia),
      storyboardFrames: s.storyboardFrames
        .filter((f) => mediaMap.has(f.mediaId))
        .map((f) => ({ ...f, id: uid('fr_'), mediaId: mediaMap.get(f.mediaId)! })),
      script: { ...s.script, pronunciations: s.script.pronunciations ?? [] },
      videoVersions,
      activeVideoVersionId: s.activeVideoVersionId ? vmap.get(s.activeVideoVersionId) : undefined,
    }
  })
  const project: Project = {
    ...m.project,
    ...mapBibleMedia(m.project, mapMedia),
    id: projectId,
    sceneIds: m.project.sceneIds.map((id) => sceneMap.get(id)).filter((x): x is string => !!x),
    audioTracks: m.project.audioTracks?.map((t) => ({
      ...t,
      id: uid('at_'),
      clips: t.clips.filter((c) => mediaMap.has(c.mediaId)).map((c) => ({ ...c, id: uid('ac_'), mediaId: mediaMap.get(c.mediaId)! })),
    })),
    updatedAt: nowIso(),
  }
  await importProjectData(project, scenes, records)
  return projectId
}
