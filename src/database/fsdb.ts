// Motor de guardado de la app de escritorio: todo vive en carpetas de tu Mac.
//
//   Documentos/IKRAL Studio/
//     ajustes.json
//     Proyectos/<Título>-<id>/
//       proyecto.json        ← guion, escenas, orden, música… (lo puede leer y editar Claude)
//       archivos.json        ← lista de imágenes, videos y audios
//       archivos/<id>.mp4    ← los archivos reales
//       miniaturas/<id>.jpg
//       respaldos/<id>.json  ← respaldos automáticos
//
// Sin límite de espacio aparte del disco. Escrituras atómicas (archivo temporal + renombrar).
import { BaseDirectory, exists, mkdir, readDir, readFile, readTextFile, remove, rename, watch, writeFile, writeTextFile } from '@tauri-apps/plugin-fs'
import { convertFileSrc } from '@tauri-apps/api/core'
import { documentDir, join } from '@tauri-apps/api/path'
import type { MediaAsset, MediaRecord, Project, Scene } from '../types'
import { SNAPSHOT_KEEP, mediaIdsOf, type Snapshot } from './idb'
import { mergeProjects } from './merge'
import { extFromMime, safeFilename } from '../utils'

const BASE = { baseDir: BaseDirectory.Document }
export const ROOT = 'IKRAL Studio'
const PROJECTS = `${ROOT}/Proyectos`
const FORMAT = 'ikral-studio-project'

interface ProjectFile {
  format: typeof FORMAT
  version: 1
  project: Project
  scenes: Scene[]
}

// ---- utilidades ----
async function ensureDir(path: string) {
  if (!(await exists(path, BASE))) await mkdir(path, { ...BASE, recursive: true })
}

/** Lo último que escribimos en cada archivo, para distinguir cambios hechos por fuera (Claude). */
const lastWritten = new Map<string, string>()

async function writeJson(path: string, data: unknown) {
  const text = JSON.stringify(data, null, 2)
  const tmp = `${path}.tmp`
  lastWritten.set(path, text)
  await writeTextFile(tmp, text, BASE)
  await rename(tmp, path, { oldPathBaseDir: BaseDirectory.Document, newPathBaseDir: BaseDirectory.Document })
}

async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readTextFile(path, BASE)) as T
  } catch {
    return null
  }
}

// ---- índice de proyectos: id → carpeta ----
const folders = new Map<string, string>()
/** mediaId → carpeta del proyecto + datos */
const mediaIndex = new Map<string, { dir: string; asset: MediaAsset }>()

async function scan() {
  await ensureDir(PROJECTS)
  folders.clear()
  for (const e of await readDir(PROJECTS, BASE)) {
    if (!e.isDirectory) continue
    const dir = `${PROJECTS}/${e.name}`
    const f = await readJson<ProjectFile>(`${dir}/proyecto.json`)
    if (f?.format === FORMAT && f.project?.id) folders.set(f.project.id, dir)
  }
}

async function dirFor(project: Pick<Project, 'id' | 'title'>, create = true): Promise<string> {
  if (!folders.size) await scan()
  let dir = folders.get(project.id)
  if (!dir && create) {
    dir = `${PROJECTS}/${safeFilename(project.title)}-${project.id.slice(-6)}`
    await ensureDir(dir)
    folders.set(project.id, dir)
  }
  if (!dir) throw new Error('Proyecto no encontrado en la carpeta')
  return dir
}

async function loadMediaIndex(dir: string) {
  const list = (await readJson<Record<string, MediaAsset>>(`${dir}/archivos.json`)) ?? {}
  for (const [id, asset] of Object.entries(list)) mediaIndex.set(id, { dir, asset })
  return list
}

const mediaPath = (dir: string, a: MediaAsset) => `${dir}/archivos/${a.id}.${extFromMime(a.mimeType)}`
const thumbPath = (dir: string, id: string) => `${dir}/miniaturas/${id}.jpg`

// ---- proyectos ----
export async function listProjects(): Promise<Project[]> {
  await scan()
  const out: Project[] = []
  for (const dir of folders.values()) {
    const f = await readJson<ProjectFile>(`${dir}/proyecto.json`)
    if (f) out.push(f.project)
  }
  return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export async function loadProject(id: string) {
  if (!folders.has(id)) await scan()
  const dir = folders.get(id)
  if (!dir) return null
  const path = `${dir}/proyecto.json`
  const raw = await readTextFile(path, BASE).catch(() => null)
  if (!raw) return null
  let f: ProjectFile
  try {
    f = JSON.parse(raw) as ProjectFile
  } catch {
    return null
  }
  lastWritten.set(path, raw) // punto de partida para unir cambios hechos por fuera
  await loadMediaIndex(dir)
  return { project: f.project, scenes: f.scenes }
}

let mergeListener: (() => void) | null = null
/** Avisa cuando al guardar se unieron cambios hechos por fuera (hay que recargar la vista). */
export function onMerged(cb: () => void) {
  mergeListener = cb
}

export async function saveProject(project: Project, scenes: Scene[]) {
  const dir = await dirFor(project)
  const path = `${dir}/proyecto.json`
  let data = { project, scenes }
  let merged = false
  // ¿Alguien (Claude) cambió el archivo desde que lo leímos? Entonces unir en vez de pisar.
  const disk = await readTextFile(path, BASE).catch(() => null)
  const base = lastWritten.get(path)
  if (disk && base && disk !== base) {
    try {
      data = mergeProjects(JSON.parse(base) as ProjectFile, JSON.parse(disk) as ProjectFile, data)
      merged = true
    } catch {
      /* si algo no se puede leer, se guarda lo local */
    }
  }
  const file: ProjectFile = { format: FORMAT, version: 1, project: data.project, scenes: data.scenes }
  await writeJson(path, file)
  if (merged) {
    await loadMediaIndex(dir)
    mergeListener?.()
  }
}

export async function deleteProject(id: string) {
  const dir = folders.get(id) ?? (await scan(), folders.get(id))
  if (!dir) return
  await remove(dir, { ...BASE, recursive: true })
  folders.delete(id)
}

// ---- archivos ----
export async function putMedia(rec: MediaRecord) {
  const dir = await dirFor({ id: rec.projectId, title: 'Proyecto' })
  await ensureDir(`${dir}/archivos`)
  const { blob, thumb, ...asset } = rec
  await writeFile(mediaPath(dir, asset), new Uint8Array(await blob.arrayBuffer()), BASE)
  if (thumb) {
    await ensureDir(`${dir}/miniaturas`)
    await writeFile(thumbPath(dir, asset.id), new Uint8Array(await thumb.arrayBuffer()), BASE)
  }
  const list = await loadMediaIndex(dir)
  list[asset.id] = asset
  await writeJson(`${dir}/archivos.json`, list)
  mediaIndex.set(asset.id, { dir, asset })
}

async function findMedia(id: string) {
  let m = mediaIndex.get(id)
  if (!m) {
    await scan()
    for (const dir of folders.values()) await loadMediaIndex(dir)
    m = mediaIndex.get(id)
  }
  return m
}

export async function getMediaAsset(id: string): Promise<MediaAsset | undefined> {
  return (await findMedia(id))?.asset
}

export async function getMedia(id: string): Promise<MediaRecord | undefined> {
  const m = await findMedia(id)
  if (!m) return undefined
  try {
    const data = await readFile(mediaPath(m.dir, m.asset), BASE)
    let thumb: Blob | undefined
    if (await exists(thumbPath(m.dir, id), BASE)) thumb = new Blob([await readFile(thumbPath(m.dir, id), BASE)], { type: 'image/jpeg' })
    return { ...m.asset, blob: new Blob([data], { type: m.asset.mimeType }), thumb }
  } catch {
    return undefined
  }
}

export async function bulkGetMedia(ids: string[]): Promise<MediaRecord[]> {
  const out: MediaRecord[] = []
  for (const id of ids) {
    const r = await getMedia(id)
    if (r) out.push(r)
  }
  return out
}

/** URL directa al archivo en disco (sin cargarlo en memoria): ideal para videos grandes. */
export async function mediaFileUrl(id: string, thumb = false): Promise<string | null> {
  const m = await findMedia(id)
  if (!m) return null
  const rel = thumb && (await exists(thumbPath(m.dir, id), BASE)) ? thumbPath(m.dir, id) : mediaPath(m.dir, m.asset)
  return convertFileSrc(await join(await documentDir(), rel))
}

/** Ruta completa del archivo en el disco y de su miniatura (para arrastrarlo fuera de la app). */
export async function mediaDiskPath(id: string): Promise<{ file: string; icon: string } | null> {
  const m = await findMedia(id)
  if (!m) return null
  const docs = await documentDir()
  const file = await join(docs, mediaPath(m.dir, m.asset))
  const icon = (await exists(thumbPath(m.dir, id), BASE)) ? await join(docs, thumbPath(m.dir, id)) : file
  return { file, icon }
}

export async function collectGarbage(projectId: string, scenes: Scene[], extraUsed?: string[]) {
  const dir = folders.get(projectId)
  if (!dir) return 0
  const used = new Set<string>(extraUsed)
  scenes.forEach((s) => mediaIdsOf({ audioTracks: [] } as unknown as Project, [s]).forEach((id) => used.add(id)))
  for (const sn of await listSnapshots(projectId)) mediaIdsOf(sn.project, sn.scenes).forEach((id) => used.add(id))
  const list = await loadMediaIndex(dir)
  let n = 0
  const recent = Date.now() - 60 * 60 * 1000
  for (const [id, asset] of Object.entries(list)) {
    if (used.has(id) || Date.parse(asset.createdAt) > recent) continue
    await remove(mediaPath(dir, asset), BASE).catch(() => {})
    await remove(thumbPath(dir, id), BASE).catch(() => {})
    delete list[id]
    mediaIndex.delete(id)
    n++
  }
  if (n) await writeJson(`${dir}/archivos.json`, list)
  return n
}

// ---- respaldos ----
export async function addSnapshot(project: Project, scenes: Scene[], reason: Snapshot['reason']) {
  const dir = await dirFor(project)
  await ensureDir(`${dir}/respaldos`)
  const snap: Snapshot = {
    id: `sn_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    projectId: project.id,
    createdAt: new Date().toISOString(),
    reason,
    project: structuredClone(project),
    scenes: structuredClone(scenes),
  }
  await writeJson(`${dir}/respaldos/${snap.id}.json`, snap)
  const all = await listSnapshots(project.id)
  for (const old of all.slice(SNAPSHOT_KEEP)) await remove(`${dir}/respaldos/${old.id}.json`, BASE).catch(() => {})
  return snap
}

export async function listSnapshots(projectId: string): Promise<Snapshot[]> {
  const dir = folders.get(projectId)
  if (!dir || !(await exists(`${dir}/respaldos`, BASE))) return []
  const out: Snapshot[] = []
  for (const e of await readDir(`${dir}/respaldos`, BASE)) {
    if (!e.name.endsWith('.json')) continue
    const s = await readJson<Snapshot>(`${dir}/respaldos/${e.name}`)
    if (s) out.push(s)
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export async function getSnapshot(id: string) {
  for (const dir of folders.values()) {
    const s = await readJson<Snapshot>(`${dir}/respaldos/${id}.json`)
    if (s) return s
  }
  return undefined
}

export async function importProjectData(project: Project, scenes: Scene[], records: MediaRecord[]) {
  await dirFor(project)
  for (const r of records) await putMedia(r)
  await saveProject(project, scenes)
}

// ---- ajustes ----
const SETTINGS = `${ROOT}/ajustes.json`
export async function getKV<T>(key: string): Promise<T | undefined> {
  const all = (await readJson<Record<string, unknown>>(SETTINGS)) ?? {}
  return all[key] as T | undefined
}
export async function setKV(key: string, value: unknown) {
  await ensureDir(ROOT)
  const all = (await readJson<Record<string, unknown>>(SETTINGS)) ?? {}
  all[key] = value
  await writeJson(SETTINGS, all)
}

// ---- cambios hechos por fuera (por ejemplo, Claude editando proyecto.json) ----
let unwatch: (() => void) | null = null
export async function watchProject(projectId: string, onChange: () => void) {
  unwatch?.()
  unwatch = null
  const dir = folders.get(projectId)
  if (!dir) return
  const path = `${dir}/proyecto.json`
  // Se vigila la carpeta (no el archivo): al guardar se reemplaza el archivo y su vigilancia se perdería.
  const stop = await watch(
    dir,
    async () => {
      const now = await readTextFile(path, BASE).catch(() => null)
      if (now !== null && now !== lastWritten.get(path)) {
        lastWritten.set(path, now)
        onChange()
      }
      // Chat con Claude: avisar si cambió su archivo.
      const claude = await readTextFile(`${dir}/${CHAT_CLAUDE}`, BASE).catch(() => null)
      if (claude !== null && claude !== lastClaudeChat) {
        lastClaudeChat = claude
        chatListeners.forEach((l) => l())
      }
    },
    { ...BASE, delayMs: 400 },
  )
  unwatch = stop
}

// ---- Chat con Claude ----
// Dos archivos para que nunca se pisen: la app solo escribe el del usuario, Claude solo el suyo.
export const CHAT_USER = 'chat-usuario.json'
export const CHAT_CLAUDE = 'chat-claude.json'
let lastClaudeChat: string | null = null
const chatListeners = new Set<() => void>()
export function onChatChange(cb: () => void) {
  chatListeners.add(cb)
  return () => chatListeners.delete(cb)
}

export interface ChatMessage {
  id: string
  from: 'user' | 'claude'
  text: string
  at: string
  sceneId?: string
  sceneLabel?: string
  /** Pedido hecho con un botón (por ejemplo, generar imágenes). */
  request?: { type: 'generate-images'; sceneIds: string[] } | { type: 'regenerate-image'; sceneIds: string[]; slot: 'start' | 'end'; note?: string } | { type: 'character-preview'; characterId: string; name: string } | { type: 'character-suggestions'; names: string[] }
}
interface ClaudeChatFile {
  messages: ChatMessage[]
  /** Último mensaje del usuario que Claude ya leyó. */
  readUpTo?: string
  /** Claude está escuchando si esto es reciente. */
  lastSeen?: string
  /** Lo que Claude está haciendo ahora (ej. «Escribiendo la escena 3…»). */
  working?: string
}

export async function readChat(projectId: string) {
  const dir = folders.get(projectId)
  if (!dir) return { user: [] as ChatMessage[], claude: { messages: [] } as ClaudeChatFile }
  const user = (await readJson<{ messages: ChatMessage[] }>(`${dir}/${CHAT_USER}`))?.messages ?? []
  const claude = (await readJson<ClaudeChatFile>(`${dir}/${CHAT_CLAUDE}`)) ?? { messages: [] }
  return { user, claude }
}

export async function sendChat(projectId: string, msg: ChatMessage) {
  const dir = await dirFor({ id: projectId, title: 'Proyecto' })
  const cur = (await readJson<{ messages: ChatMessage[] }>(`${dir}/${CHAT_USER}`))?.messages ?? []
  await writeJson(`${dir}/${CHAT_USER}`, { messages: [...cur, msg] })
}

export async function projectFolderPath(projectId: string): Promise<string | null> {
  const dir = folders.get(projectId)
  return dir ? join(await documentDir(), dir) : null
}
