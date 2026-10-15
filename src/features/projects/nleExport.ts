// Exportar la edición para editores profesionales:
// - FCP7 XML (xmeml v4): Premiere Pro y DaVinci Resolve.
// - FCPXML 1.10: Final Cut Pro (y DaVinci Resolve).
// Se entrega un .zip con los archivos reales en media/ y rutas relativas a esa carpeta.
import JSZip from 'jszip'
import type { MediaRecord, Project, Scene } from '../../types'
import { getMediaBlob } from '../media-library/media'
import { buildSegments, storyboardMediaIds, videoRange } from '../script-sync/derive'
import { extFromMime, safeFilename } from '../../utils'

export const FPS = 30

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const fr = (sec: number) => Math.max(0, Math.round(sec * FPS))
const rt = (frames: number) => `${frames}/${FPS}s`

interface FileRef {
  id: string
  rec: MediaRecord
  path: string
  frames: number
  kind: 'video' | 'image' | 'audio'
}

interface VItem {
  name: string
  file: FileRef
  start: number // fotogramas en el timeline
  len: number
  srcIn: number
  hasAudio: boolean
}

interface AItem {
  name: string
  file: FileRef
  start: number
  len: number
  srcIn: number
  track: number // 1 = audio del video, 2-3 = música
}

export interface NleTimeline {
  width: number
  height: number
  duration: number
  files: FileRef[]
  video: VItem[]
  audio: AItem[]
}

/** Arma la edición a partir del estado (solo versiones activas, con sus recortes). */
export async function buildNleTimeline(project: Project, scenes: Scene[]): Promise<NleTimeline> {
  const [width, height] = project.aspectRatio === '16:9' ? [1920, 1080] : [1080, 1920]
  const files = new Map<string, FileRef>()
  const fileFor = async (mediaId: string, kind: FileRef['kind'], seconds: number) => {
    const have = files.get(mediaId)
    if (have) return have
    const rec = await getMediaBlob(mediaId)
    if (!rec) return null
    const n = files.size + 1
    const ref: FileRef = {
      id: `file-${n}`,
      rec,
      path: `media/${String(n).padStart(3, '0')}-${safeFilename(rec.name.replace(/\.[^.]+$/, ''))}.${extFromMime(rec.mimeType)}`,
      frames: kind === 'image' ? 0 : fr(seconds),
      kind,
    }
    files.set(mediaId, ref)
    return ref
  }

  const video: VItem[] = []
  const audio: AItem[] = []
  const segments = buildSegments(scenes)
  for (const seg of segments) {
    const start = fr(seg.start)
    const len = fr(seg.end) - start
    const name = `Escena ${seg.index + 1} · ${seg.scene.title}`
    if (seg.video) {
      const range = videoRange(seg.video)
      const file = await fileFor(seg.video.mediaId, 'video', seg.video.duration)
      if (!file) continue
      video.push({ name, file, start, len, srcIn: fr(range.from), hasAudio: true })
      audio.push({ name, file, start, len, srcIn: fr(range.from), track: 1 })
    } else {
      const still = storyboardMediaIds(seg.scene)[0]
      if (!still) continue // hueco
      const file = await fileFor(still, 'image', seg.duration)
      if (file) video.push({ name: `${name} (storyboard)`, file, start, len, srcIn: 0, hasAudio: false })
    }
  }
  const tracks = project.audioTracks ?? []
  for (let i = 0; i < tracks.length; i++) {
    const tr = tracks[i]
    if (tr.muted) continue
    for (const c of tr.clips) {
      const file = await fileFor(c.mediaId, 'audio', c.sourceDuration ?? (c.offset ?? 0) + c.duration)
      if (!file) continue
      audio.push({ name: c.name, file, start: fr(c.start), len: fr(c.duration), srcIn: fr(c.offset ?? 0), track: i + 2 })
    }
  }
  const duration = Math.max(fr(segments.length ? segments[segments.length - 1].end : 0), ...audio.map((a) => a.start + a.len))
  return { width, height, duration, files: [...files.values()], video, audio }
}

// ---------- FCP7 XML (Premiere / DaVinci) ----------

export function toXmeml(tl: NleTimeline, title: string): string {
  const rate = `<rate><timebase>${FPS}</timebase><ntsc>FALSE</ntsc></rate>`
  const written = new Set<string>()
  const fileXml = (f: FileRef) => {
    if (written.has(f.id)) return `<file id="${f.id}"/>`
    written.add(f.id)
    const media =
      f.kind === 'audio'
        ? '<audio><channelcount>2</channelcount></audio>'
        : f.kind === 'image'
          ? `<video><samplecharacteristics><width>${f.rec.width ?? tl.width}</width><height>${f.rec.height ?? tl.height}</height></samplecharacteristics></video>`
          : `<video><samplecharacteristics><width>${f.rec.width ?? tl.width}</width><height>${f.rec.height ?? tl.height}</height></samplecharacteristics></video><audio><channelcount>2</channelcount></audio>`
    return `<file id="${f.id}"><name>${esc(f.path.split('/').pop()!)}</name><pathurl>${esc(f.path)}</pathurl>${rate}<duration>${f.frames}</duration><media>${media}</media></file>`
  }
  let n = 0
  const clip = (name: string, f: FileRef, start: number, len: number, srcIn: number, audioTrack?: number) => {
    n++
    const dur = f.kind === 'image' ? len : f.frames
    const src = audioTrack ? `<sourcetrack><mediatype>audio</mediatype><trackindex>1</trackindex></sourcetrack>` : ''
    return `<clipitem id="clipitem-${n}"><name>${esc(name)}</name><enabled>TRUE</enabled><duration>${dur}</duration>${rate}<start>${start}</start><end>${start + len}</end><in>${srcIn}</in><out>${srcIn + len}</out>${fileXml(f)}${src}</clipitem>`
  }
  const vTrack = `<track>${tl.video.map((v) => clip(v.name, v.file, v.start, v.len, v.srcIn)).join('')}</track>`
  const aTracks = [1, 2, 3]
    .map((t) => tl.audio.filter((a) => a.track === t))
    .filter((items, i) => items.length || i === 0)
    .map((items) => `<track>${items.map((a) => clip(a.name, a.file, a.start, a.len, a.srcIn, a.track)).join('')}</track>`)
    .join('')
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE xmeml>
<xmeml version="4">
<sequence id="sequence-1">
<name>${esc(title)}</name>
<duration>${tl.duration}</duration>
${rate}
<media>
<video><format><samplecharacteristics>${rate}<width>${tl.width}</width><height>${tl.height}</height><pixelaspectratio>square</pixelaspectratio></samplecharacteristics></format>${vTrack}</video>
<audio>${aTracks}</audio>
</media>
</sequence>
</xmeml>
`
}

// ---------- FCPXML (Final Cut Pro) ----------

export function toFcpxml(tl: NleTimeline, title: string): string {
  const assets = tl.files
    .map((f, i) => {
      const id = `r${i + 2}`
      const hasVideo = f.kind !== 'audio' ? '1' : '0'
      const hasAudio = f.kind !== 'image' ? '1' : '0'
      const fmt = f.kind === 'audio' ? '' : ` format="r1"`
      const audio = f.kind !== 'image' ? ` audioSources="1" audioChannels="2" audioRate="48000"` : ''
      return `    <asset id="${id}" name="${esc(f.path.split('/').pop()!)}" start="0s" duration="${rt(f.frames)}" hasVideo="${hasVideo}" hasAudio="${hasAudio}"${fmt}${audio}>
      <media-rep kind="original-media" src="${esc(f.path)}"/>
    </asset>`
    })
    .join('\n')
  const ref = new Map(tl.files.map((f, i) => [f.id, `r${i + 2}`]))

  // Línea principal: videos (o imágenes) seguidos, con huecos donde no hay nada.
  type SpineItem = { offset: number; len: number; xmlOpen: string; xmlClose: string; localStart: number }
  const spine: SpineItem[] = []
  let cursor = 0
  for (const v of tl.video) {
    if (v.start > cursor) spine.push({ offset: cursor, len: v.start - cursor, localStart: 0, xmlOpen: `<gap name="Hueco" offset="${rt(cursor)}" start="0s" duration="${rt(v.start - cursor)}">`, xmlClose: '</gap>' })
    const r = ref.get(v.file.id)!
    if (v.file.kind === 'image')
      spine.push({ offset: v.start, len: v.len, localStart: 0, xmlOpen: `<video ref="${r}" name="${esc(v.name)}" offset="${rt(v.start)}" start="0s" duration="${rt(v.len)}">`, xmlClose: '</video>' })
    else
      spine.push({ offset: v.start, len: v.len, localStart: v.srcIn, xmlOpen: `<asset-clip ref="${r}" name="${esc(v.name)}" offset="${rt(v.start)}" start="${rt(v.srcIn)}" duration="${rt(v.len)}" format="r1" tcFormat="NDF">`, xmlClose: '</asset-clip>' })
    cursor = v.start + v.len
  }
  if (cursor < tl.duration) spine.push({ offset: cursor, len: tl.duration - cursor, localStart: 0, xmlOpen: `<gap name="Hueco" offset="${rt(cursor)}" start="0s" duration="${rt(tl.duration - cursor)}">`, xmlClose: '</gap>' })

  // Música: clips conectados (lane negativo) al elemento de la línea principal donde empiezan.
  const connected = new Map<number, string[]>()
  for (const a of tl.audio.filter((x) => x.track >= 2)) {
    const idx = Math.max(0, spine.findIndex((s) => a.start >= s.offset && a.start < s.offset + s.len))
    const host = spine[idx]
    const offset = host.localStart + (a.start - host.offset)
    const list = connected.get(idx) ?? []
    list.push(`<asset-clip ref="${ref.get(a.file.id)}" lane="-${a.track - 1}" name="${esc(a.name)}" offset="${rt(offset)}" start="${rt(a.srcIn)}" duration="${rt(a.len)}" audioRole="music"/>`)
    connected.set(idx, list)
  }
  const spineXml = spine.map((s, i) => `        ${s.xmlOpen}${(connected.get(i) ?? []).join('')}${s.xmlClose}`).join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE fcpxml>
<fcpxml version="1.10">
  <resources>
    <format id="r1" name="IKRAL ${tl.width}x${tl.height} ${FPS}p" frameDuration="1/${FPS}s" width="${tl.width}" height="${tl.height}"/>
${assets}
  </resources>
  <library>
    <event name="IKRAL Studio">
      <project name="${esc(title)}">
        <sequence format="r1" duration="${rt(tl.duration)}" tcStart="0s" tcFormat="NDF" audioLayout="stereo" audioRate="48k">
          <spine>
${spineXml}
          </spine>
        </sequence>
      </project>
    </event>
  </library>
</fcpxml>
`
}

const README = (title: string) => `IKRAL Studio · ${title}
Edición exportada para editores de video.

1. Descomprime este .zip en una carpeta (no muevas la carpeta «media»).
2. Abre el archivo según tu editor:
   - Premiere Pro: Archivo > Importar > Premiere-DaVinci.xml
   - DaVinci Resolve: Archivo > Importar línea de tiempo > Premiere-DaVinci.xml (o FinalCut.fcpxml)
   - Final Cut Pro: Archivo > Importar > XML > FinalCut.fcpxml
3. Si el editor pregunta dónde están los archivos, elige la carpeta «media».

Pistas: V1 = videos (o imagen del storyboard si la escena no tiene video).
A1 = audio de los videos. A2 y A3 = Música 1 y Música 2.
Cuadros por segundo: ${FPS}.
`

export async function exportNleZip(project: Project, scenes: Scene[]): Promise<Blob> {
  const tl = await buildNleTimeline(project, scenes)
  const zip = new JSZip()
  tl.files.forEach((f) => zip.file(f.path, f.rec.blob))
  zip.file('Premiere-DaVinci.xml', toXmeml(tl, project.title))
  zip.file('FinalCut.fcpxml', toFcpxml(tl, project.title))
  zip.file('LEEME.txt', README(project.title))
  return zip.generateAsync({ type: 'blob', compression: 'STORE' })
}
