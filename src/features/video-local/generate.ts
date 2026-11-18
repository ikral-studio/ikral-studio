// Botón «Video gratis (Mac)»: arranca ComfyUI si hace falta, hace el video y lo guarda como versión nueva.
import { useProject } from '../../stores/projectStore'
import { getMediaBlob } from '../media-library/media'
import { importFiles } from '../scene-management/actions'
import { isDesktop } from '../../database/db'
import { LOCAL_MODEL, QUALITIES, comfyRunning, makeLocalVideo, type Quality } from './comfy'
import { pad2 } from '../../utils'

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Texto para el modelo: el prompt de generación de la escena o, si no hay, la acción y el título. */
export function scenePrompt(s: { title: string; script: { generationPrompt: string; action: string } }) {
  return s.script.generationPrompt.trim() || [s.title, s.script.action].map((x) => x.trim()).filter(Boolean).join('. ')
}

async function ensureComfy() {
  if (await comfyRunning()) return
  const { invoke } = await import('@tauri-apps/api/core')
  await invoke('arrancar_video_local')
  for (let i = 0; i < 60; i++) {
    await wait(2000)
    if (await comfyRunning()) return
  }
  throw new Error('ComfyUI no arrancó en 2 minutos')
}

export async function generateLocalVideo(sceneId: string, onStep: (text: string) => void, saveDir?: string, quality: Quality = 'rapida') {
  const { project, scenes, addVideoVersion } = useProject.getState()
  const scene = scenes[sceneId]
  if (!project || !scene || !isDesktop()) return
  if (!scene.startImageId || !scene.endImageId) throw new Error('La escena necesita imagen inicial y final')
  const [start, end] = await Promise.all([getMediaBlob(scene.startImageId), getMediaBlob(scene.endImageId)])
  if (!start || !end) throw new Error('No encontré las imágenes de la escena')
  onStep('Arrancando el generador…')
  await ensureComfy()
  onStep('Haciendo el video en tu Mac… (la primera vez tarda más)')
  const { file, seconds } = await makeLocalVideo({
    start: start.blob,
    end: end.blob,
    prompt: scenePrompt(scene) || 'cinematic shot, smooth motion',
    aspect: project.aspectRatio,
    quality,
    seconds: scene.plannedDuration,
    name: `${scene.title || 'escena'} (Mac)`,
  })
  onStep('Guardando video…')
  if (saveDir) await saveCopy(saveDir, `${pad2(project.sceneIds.indexOf(sceneId) + 1)} - ${scene.title || 'escena'}`, file)
  const [asset] = await importFiles([file], 'video')
  if (!asset) return
  addVideoVersion(sceneId, { mediaId: asset.id, duration: asset.duration ?? 0, width: asset.width, height: asset.height, model: LOCAL_MODEL, credits: 0, generationTimeSeconds: seconds })
  return seconds
}

/** Nombre de archivo sin caracteres que Finder no acepta. */
export const fileSafe = (name: string) => name.replace(/[/\\:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 80)

/** Copia del MP4 en la carpeta que escogió Kyo (por ejemplo en el disco C). */
async function saveCopy(dir: string, name: string, file: File) {
  const [fs, { join }] = await Promise.all([import('@tauri-apps/plugin-fs'), import('@tauri-apps/api/path')])
  await fs.writeFile(await join(dir, `${fileSafe(name)}.mp4`), new Uint8Array(await file.arrayBuffer()))
}

/** Pregunta en qué carpeta guardar los videos. null = canceló. */
export async function pickVideoFolder(): Promise<string | null> {
  const { open } = await import('@tauri-apps/plugin-dialog')
  const dir = await open({ directory: true, recursive: true, defaultPath: '/Volumes', title: '¿Dónde guardo los videos?' })
  return !dir || Array.isArray(dir) ? null : dir
}

/** Escenas listas para video gratis: tienen imagen inicial y final, y todavía no tienen video. */
export function scenesForLocalVideo(): string[] {
  const { project, scenes } = useProject.getState()
  if (!project) return []
  return project.sceneIds.filter((id) => {
    const s = scenes[id]
    return s && s.startImageId && s.endImageId && s.videoVersions.length === 0
  })
}

/** Minutos aproximados: cargar modelos (~12) + lo de cada video según la calidad. */
export const estimateMinutes = (n: number, quality: Quality = 'rapida') => Math.round(12 + n * QUALITIES[quality].minutes)

let stopAll = false
export const stopLocalVideos = () => {
  stopAll = true
}

/** Hace uno tras otro los videos de las escenas; si una falla, sigue con la siguiente. */
export async function generateAllLocalVideos(sceneIds: string[], onStep: (text: string) => void, saveDir?: string, quality: Quality = 'rapida') {
  stopAll = false
  let done = 0
  const failed: string[] = []
  for (const [i, id] of sceneIds.entries()) {
    if (stopAll) break
    const title = useProject.getState().scenes[id]?.title ?? ''
    try {
      await generateLocalVideo(id, (t) => onStep(`Video ${i + 1} de ${sceneIds.length} · ${title} · ${t}`), saveDir, quality)
      done++
    } catch (e) {
      console.error('video local', id, e)
      failed.push(title)
    }
  }
  return { done, failed, stopped: stopAll }
}
