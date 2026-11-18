// Botón «Video gratis (Mac)»: arranca ComfyUI si hace falta, hace el video y lo guarda como versión nueva.
import { useProject } from '../../stores/projectStore'
import { getMediaBlob } from '../media-library/media'
import { importFiles } from '../scene-management/actions'
import { isDesktop } from '../../database/db'
import { LOCAL_MODEL, comfyRunning, makeLocalVideo } from './comfy'

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

export async function generateLocalVideo(sceneId: string, onStep: (text: string) => void) {
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
    seconds: scene.plannedDuration,
    name: `${scene.title || 'escena'} (Mac)`,
  })
  onStep('Guardando video…')
  const [asset] = await importFiles([file], 'video')
  if (!asset) return
  addVideoVersion(sceneId, { mediaId: asset.id, duration: asset.duration ?? 0, width: asset.width, height: asset.height, model: LOCAL_MODEL, credits: 0, generationTimeSeconds: seconds })
  return seconds
}
