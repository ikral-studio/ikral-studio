// Guardado: en la app de escritorio, carpetas de tu Mac (fsdb); en el navegador, IndexedDB (idb).
import * as idb from './idb'
import type { MediaAsset, MediaRecord, Project, Scene } from '../types'

export type { Snapshot } from './idb'
export { SNAPSHOT_KEEP, mediaIdsOf } from './idb'

export const isDesktop = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

type Backend = typeof idb & {
  mediaFileUrl?: (id: string, thumb?: boolean) => Promise<string | null>
  mediaDiskPath?: (id: string) => Promise<{ file: string; icon: string } | null>
  watchProject?: (projectId: string, onChange: () => void) => Promise<void>
  onMerged?: (cb: () => void) => void
  projectFolderPath?: (projectId: string) => Promise<string | null>
  moveLibrary?: (projectId: string, dest: string) => Promise<string>
  openLibrary?: (path: string) => Promise<string>
  readChat?: (projectId: string) => Promise<{ user: ChatMessage[]; claude: { messages: ChatMessage[]; readUpTo?: string; lastSeen?: string; working?: string } }>
  sendChat?: (projectId: string, msg: ChatMessage) => Promise<void>
  onChatChange?: (cb: () => void) => () => void
}

export interface ChatMessage {
  id: string
  from: 'user' | 'claude'
  text: string
  at: string
  sceneId?: string
  sceneLabel?: string
  /** Pedido hecho con un botón (por ejemplo, generar imágenes). */
  request?: { type: 'generate-images'; sceneIds: string[] } | { type: 'regenerate-image'; sceneIds: string[]; slot: 'start' | 'end'; note?: string } | { type: 'character-preview'; characterId: string; name: string; prompt: string } | { type: 'character-suggestions'; names: string[]; idea?: string } | { type: 'item-preview'; kind: 'locations' | 'props' | 'wardrobe'; itemId: string; name: string; prompt: string } | { type: 'frame-preview'; sceneId: string; slot: 'start' | 'end'; prompt: string; characterImageIds?: string[] }
}

let backendPromise: Promise<Backend> | null = null
function backend(): Promise<Backend> {
  if (!backendPromise) backendPromise = isDesktop() ? (import('./fsdb') as unknown as Promise<Backend>) : Promise.resolve(idb as Backend)
  return backendPromise
}

export const listProjects = async (): Promise<Project[]> => (await backend()).listProjects()
export const loadProject = async (id: string) => (await backend()).loadProject(id)
export const saveProject = async (p: Project, s: Scene[]) => (await backend()).saveProject(p, s)
export const deleteProject = async (id: string) => (await backend()).deleteProject(id)
export const collectGarbage = async (pid: string, s: Scene[], extra?: string[]) => (await backend()).collectGarbage(pid, s, extra)
export const putMedia = async (r: MediaRecord) => (await backend()).putMedia(r)
export const getMedia = async (id: string): Promise<MediaRecord | undefined> => (await backend()).getMedia(id)
export const getMediaAsset = async (id: string): Promise<MediaAsset | undefined> => (await backend()).getMediaAsset(id)
export const bulkGetMedia = async (ids: string[]) => (await backend()).bulkGetMedia(ids)
export const addSnapshot = async (p: Project, s: Scene[], r: idb.Snapshot['reason']) => (await backend()).addSnapshot(p, s, r)
export const listSnapshots = async (pid: string) => (await backend()).listSnapshots(pid)
export const getSnapshot = async (id: string) => (await backend()).getSnapshot(id)
export const importProjectData = async (p: Project, s: Scene[], r: MediaRecord[]) => (await backend()).importProjectData(p, s, r)
export const getKV = async <T,>(key: string): Promise<T | undefined> => (await backend()).getKV<T>(key)
export const setKV = async (key: string, value: unknown) => (await backend()).setKV(key, value)

/** Solo escritorio: URL directa al archivo en disco. En el navegador devuelve null. */
export const mediaFileUrl = async (id: string, thumb = false) => (await backend()).mediaFileUrl?.(id, thumb) ?? null
/** Solo escritorio: avisa cuando proyecto.json cambia por fuera (por ejemplo, lo editó Claude). */
export const mediaDiskPath = async (id: string) => (await backend()).mediaDiskPath?.(id) ?? null
export const watchProject = async (pid: string, cb: () => void) => (await backend()).watchProject?.(pid, cb)
export const readChat = async (pid: string) => (await backend()).readChat?.(pid) ?? null
export const sendChat = async (pid: string, msg: ChatMessage) => (await backend()).sendChat?.(pid, msg)
export const onChatChange = async (cb: () => void) => (await backend()).onChatChange?.(cb) ?? (() => {})
export const onMerged = async (cb: () => void) => (await backend()).onMerged?.(cb)
export const projectFolderPath = async (pid: string) => (await backend()).projectFolderPath?.(pid) ?? null
/** Solo escritorio: mueve la biblioteca (.ikral) del proyecto a otra carpeta o disco. */
export const moveLibrary = async (pid: string, dest: string) => {
  const b = await backend()
  if (!b.moveLibrary) throw new Error('Solo en la app de escritorio')
  return b.moveLibrary(pid, dest)
}
/** Solo escritorio: abre una biblioteca .ikral que está en cualquier lugar. Devuelve el id del proyecto. */
export const openLibrary = async (path: string) => {
  const b = await backend()
  if (!b.openLibrary) throw new Error('Solo en la app de escritorio')
  return b.openLibrary(path)
}
