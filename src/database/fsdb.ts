// Motor de guardado de la app de escritorio: todo vive en carpetas de tu Mac.
//
//   Documentos/IKRAL Studio/
//     ajustes.json           ← también la lista de bibliotecas guardadas en otros lugares («libraries»)
//     Proyectos/<Título>-<id>.ikral/   ← cada proyecto es una «biblioteca» (paquete con su ícono, como en Final Cut)
//       proyecto.json        ← guion, escenas, orden, música… (lo puede leer y editar Claude)
//       archivos.json        ← lista de imágenes, videos y audios
//       archivos/<id>.mp4    ← los archivos reales
//       miniaturas/<id>.jpg
//       respaldos/<id>.json  ← respaldos automáticos
//
// Una biblioteca se puede guardar en cualquier carpeta o disco («Guardar biblioteca en…») y abrir desde ahí.
// Todas las rutas son completas (absolutas). Sin límite de espacio aparte del disco.
// Escrituras atómicas (archivo temporal + renombrar).
import { copyFile, exists, mkdir, readDir, readFile, readTextFile, remove, rename, watch, writeFile, writeTextFile } from '@tauri-apps/plugin-fs'
import { convertFileSrc } from '@tauri-apps/api/core'
import { documentDir } from '@tauri-apps/api/path'
import type { MediaAsset, MediaRecord, Project, Scene } from '../types'
import { SNAPSHOT_KEEP, mediaIdsOf, type Snapshot } from './idb'
import { mergeProjects } from './merge'
import { extFromMime, safeFilename } from '../utils'

/** Rutas completas: ya no dependen de la carpeta Documentos. */
const BASE = {}
let ROOT = ''
let PROJECTS = ''
/** Extensión de las bibliotecas (el Mac las muestra como un solo archivo con su ícono). */
export const LIBRARY_EXT = '.ikral'
const ready = documentDir().then((d) => {
  ROOT = `${d.replace(/\/$/, '')}/IKRAL Studio`
  PROJECTS = `${ROOT}/Proyectos`
})
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
  await rename(tmp, path)
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
  await ready
  await ensureDir(PROJECTS)
  folders.clear()
  const add = async (dir: string) => {
    const f = await readJson<ProjectFile>(`${dir}/proyecto.json`)
    if (f?.format === FORMAT && f.project?.id && !folders.has(f.project.id)) folders.set(f.project.id, dir)
  }
  for (const e of await readDir(PROJECTS, BASE)) {
    if (!e.isDirectory) continue
    let dir = `${PROJECTS}/${e.name}`
    // Carpetas de antes: se vuelven biblioteca (mismo contenido, solo cambia el nombre).
    if (!e.name.endsWith(LIBRARY_EXT) && (await exists(`${dir}/proyecto.json`, BASE)) && !(await exists(dir + LIBRARY_EXT, BASE))) {
      await rename(dir, dir + LIBRARY_EXT).then(() => (dir += LIBRARY_EXT)).catch(() => {})
    }
    await add(dir)
  }
  // Bibliotecas guardadas en otros lugares (si el disco no está conectado, simplemente no aparecen).
  for (const dir of await libraries()) if (await exists(`${dir}/proyecto.json`, BASE).catch(() => false)) await add(dir)
}

async function libraries(): Promise<string[]> {
  return (await getKV<string[]>('libraries')) ?? []
}
async function setLibraries(list: string[]) {
  await setKV('libraries', [...new Set(list)])
}

async function dirFor(project: Pick<Project, 'id' | 'title'>, create = true): Promise<string> {
  if (!folders.size) await scan()
  let dir = folders.get(project.id)
  if (!dir && create) {
    dir = `${PROJECTS}/${safeFilename(project.title)}-${project.id.slice(-6)}${LIBRARY_EXT}`
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
  await setLibraries((await libraries()).filter((d) => d !== dir))
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
  return convertFileSrc(rel)
}

/** Ruta completa del archivo en el disco y de su miniatura (para arrastrarlo fuera de la app). */
export async function mediaDiskPath(id: string): Promise<{ file: string; icon: string } | null> {
  const m = await findMedia(id)
  if (!m) return null
  const file = mediaPath(m.dir, m.asset)
  const icon = (await exists(thumbPath(m.dir, id), BASE)) ? thumbPath(m.dir, id) : file
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
const settingsPath = async () => (await ready, `${ROOT}/ajustes.json`)
export async function getKV<T>(key: string): Promise<T | undefined> {
  const all = (await readJson<Record<string, unknown>>(await settingsPath())) ?? {}
  return all[key] as T | undefined
}
export async function setKV(key: string, value: unknown) {
  const path = await settingsPath()
  await ensureDir(ROOT)
  const all = (await readJson<Record<string, unknown>>(path)) ?? {}
  all[key] = value
  await writeJson(path, all)
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
  request?: { type: 'generate-images'; sceneIds: string[] } | { type: 'regenerate-image'; sceneIds: string[]; slot: 'start' | 'end'; note?: string } | { type: 'character-preview'; characterId: string; name: string; prompt: string } | { type: 'character-suggestions'; names: string[]; idea?: string } | { type: 'item-suggestions'; kind: 'locations' | 'props' | 'wardrobe' } | { type: 'item-preview'; kind: 'locations' | 'props' | 'wardrobe'; itemId: string; name: string; prompt: string } | { type: 'frame-preview'; sceneId: string; slot: 'start' | 'end'; prompt: string; characterImageIds?: string[] } | { type: 'shot-preview'; sceneId: string; shotId: string; slot: 'start' | 'end'; prompt: string; characterImageIds?: string[] }
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

// ---- Revisiones con GPT ----
// Archivo aparte: las propuestas de GPT no tocan proyecto.json hasta que el director acepta una.
export const GPT_REVIEWS = 'gpt-revisiones.json'

export async function readGptReviews<T>(projectId: string): Promise<T | null> {
  if (!folders.has(projectId)) await scan()
  const dir = folders.get(projectId)
  return dir ? readJson<T>(`${dir}/${GPT_REVIEWS}`) : null
}

export async function saveGptReviews(projectId: string, data: unknown) {
  const dir = await dirFor({ id: projectId, title: 'Proyecto' })
  await writeJson(`${dir}/${GPT_REVIEWS}`, data)
}

// ---- Conversaciones con GPT (hilos con historial) ----
// Codex corre sin memoria (--ephemeral): el historial lo guarda IKRAL aquí, no OpenAI.
export const GPT_THREADS = 'gpt-hilos.json'

export async function readGptThreads<T>(projectId: string): Promise<T | null> {
  if (!folders.has(projectId)) await scan()
  const dir = folders.get(projectId)
  return dir ? readJson<T>(`${dir}/${GPT_THREADS}`) : null
}

export async function saveGptThreads(projectId: string, data: unknown) {
  const dir = await dirFor({ id: projectId, title: 'Proyecto' })
  await writeJson(`${dir}/${GPT_THREADS}`, data)
}

export async function projectFolderPath(projectId: string): Promise<string | null> {
  if (!folders.has(projectId)) await scan()
  return folders.get(projectId) ?? null
}

// ---- bibliotecas (como en Final Cut) ----
/** Copia una carpeta completa (con subcarpetas). */
async function copyDir(from: string, to: string) {
  await mkdir(to, { recursive: true })
  for (const e of await readDir(from, BASE)) {
    if (e.name.endsWith('.tmp')) continue
    if (e.isDirectory) await copyDir(`${from}/${e.name}`, `${to}/${e.name}`)
    else await copyFile(`${from}/${e.name}`, `${to}/${e.name}`)
  }
}
async function countFiles(dir: string): Promise<number> {
  let n = 0
  for (const e of await readDir(dir, BASE)) {
    if (e.name.endsWith('.tmp')) continue
    n += e.isDirectory ? await countFiles(`${dir}/${e.name}`) : 1
  }
  return n
}

/** Mueve la biblioteca del proyecto a otra ruta (por ejemplo, otro disco). Devuelve la ruta nueva. */
export async function moveLibrary(projectId: string, dest: string): Promise<string> {
  if (!folders.has(projectId)) await scan()
  const from = folders.get(projectId)
  if (!from) throw new Error('No encontré la biblioteca del proyecto')
  // Sin «.ikral» queda como carpeta normal (se puede abrir en Finder y meter cosas); con «.ikral», como biblioteca.
  const to = dest.replace(/\/+$/, '')
  if (to === from) return from
  if (await exists(to, BASE)) throw new Error('Ya hay algo con ese nombre ahí. Elige otro nombre.')
  unwatch?.()
  unwatch = null
  try {
    await rename(from, to) // mismo disco: instantáneo
  } catch {
    // Otro disco: copiar todo, revisar que llegó completo y luego quitar el de antes.
    await copyDir(from, to)
    if ((await countFiles(to)) < (await countFiles(from)) || !(await readJson<ProjectFile>(`${to}/proyecto.json`))) {
      await remove(to, { recursive: true }).catch(() => {})
      throw new Error('La copia no quedó completa. No se movió nada.')
    }
    await remove(from, { recursive: true })
  }
  folders.set(projectId, to)
  for (const [id, m] of mediaIndex) if (m.dir === from) mediaIndex.set(id, { ...m, dir: to })
  for (const [k, v] of [...lastWritten]) if (k.startsWith(from + '/')) lastWritten.set(to + k.slice(from.length), v)
  const inDefault = to.startsWith(PROJECTS + '/')
  await setLibraries([...(await libraries()).filter((d) => d !== from && d !== to), ...(inDefault ? [] : [to])])
  return to
}

/** Abre una biblioteca .ikral que está en cualquier lugar. Devuelve el id de su proyecto. */
export async function openLibrary(path: string): Promise<string> {
  const dir = path.replace(/\/+$/, '')
  const f = await readJson<ProjectFile>(`${dir}/proyecto.json`)
  if (f?.format !== FORMAT || !f.project?.id) throw new Error('Eso no es una biblioteca de IKRAL Studio')
  const other = folders.get(f.project.id)
  if (other && other !== dir && (await exists(`${other}/proyecto.json`, BASE).catch(() => false))) {
    throw new Error('Ya tienes abierta otra copia de este proyecto. Ciérrala o muévela antes.')
  }
  folders.set(f.project.id, dir)
  await ready
  if (!dir.startsWith(PROJECTS + '/')) await setLibraries([...(await libraries()), dir])
  return f.project.id
}

/**
 * Copia las imágenes del proyecto a la carpeta «Imágenes» del proyecto con nombres claros,
 * para usarlas en otras apps. No borra nada de lo que ya haya ahí. Devuelve la carpeta.
 */
export async function exportImagesFolder(projectId: string, entries: { id: string; path: string }[]): Promise<string> {
  if (!folders.has(projectId)) await scan()
  const dir = folders.get(projectId)
  if (!dir) throw new Error('No encontré la carpeta del proyecto')
  // Dentro de la carpeta del proyecto, para que todo quede junto donde lo guardaste.
  const dest = `${dir}/Imágenes`
  for (const { id, path } of entries) {
    const m = await findMedia(id)
    if (!m || m.asset.kind !== 'image' || !(await exists(mediaPath(m.dir, m.asset), BASE))) continue
    const file = `${dest}/${path}.${extFromMime(m.asset.mimeType)}`
    await ensureDir(file.slice(0, file.lastIndexOf('/')))
    await copyFile(mediaPath(m.dir, m.asset), file)
  }
  await ensureDir(dest)
  return dest
}
