// Botón «Hacer música»: arranca ACE-Step si hace falta, hace la canción y la guarda en la biblioteca del proyecto.
import { useProject } from '../../stores/projectStore'
import { importFiles } from '../scene-management/actions'
import { isDesktop } from '../../database/db'
import { COMFY_URL, comfyRunning } from '../video-local/comfy'
import { MUSIC_MODEL, aceRunning, makeLocalSong, type SongJob } from './acestep'

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function ensureAce() {
  if (await aceRunning()) return
  const { invoke } = await import('@tauri-apps/api/core')
  await invoke('arrancar_musica_local')
  for (let i = 0; i < 60; i++) {
    await wait(2000)
    if (await aceRunning()) return
  }
  throw new Error('El generador de música no arrancó en 2 minutos')
}

/** Con 16 GB no caben el video y la música a la vez: si ComfyUI está quieto, suelta sus modelos. */
async function freeVideoMemory() {
  if (!(await comfyRunning())) return
  try {
    const q = (await (await fetch(`${COMFY_URL}/queue`)).json()) as { queue_running: unknown[]; queue_pending: unknown[] }
    if (q.queue_running.length || q.queue_pending.length) return
    await fetch(`${COMFY_URL}/free`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ unload_models: true, free_memory: true }) })
  } catch {
    /* si no responde, no pasa nada */
  }
}

/** Título corto a partir del estilo (ej. «Cumbia alegre»). */
export function songTitle(style: string) {
  const first = style.split(/[,.\n]/)[0].trim()
  const t = first.charAt(0).toUpperCase() + first.slice(1)
  return t.slice(0, 40) || 'Canción'
}

export async function generateLocalSong(job: SongJob, onStep: (text: string) => void) {
  const { project, addSong } = useProject.getState()
  if (!project || !isDesktop()) return
  onStep('Arrancando el generador de música…')
  await freeVideoMemory()
  await ensureAce()
  onStep('Haciendo la música en tu Mac… (la primera vez tarda más)')
  const title = job.surprise ? `🎲 ${songTitle(job.style || 'Sorpresa')}` : job.audio?.mode === 'repaint' ? `${job.audio.name.replace(/\.[^.]+$/, '')} (arreglada)` : songTitle(job.style)
  const { file, seconds, style, lyrics } = await makeLocalSong({ ...job, name: title }, (pct, stage) =>
    onStep(`Haciendo la música… ${pct} %${/decod/i.test(stage) ? ' · terminando' : ''}`),
  )
  onStep('Guardando en la biblioteca…')
  const [asset] = await importFiles([file], 'audio')
  if (!asset) return
  // Con el dado, el estilo y la letra los inventó el modelo: se guardan los suyos.
  const made = job.surprise ? { style: style ?? job.style, lyrics: lyrics === '[Instrumental]' ? '' : (lyrics ?? '') } : { style: job.style, lyrics: job.lyrics }
  addSong({ mediaId: asset.id, title, style: made.style.trim(), lyrics: made.lyrics.trim(), duration: asset.duration ?? job.seconds, model: MUSIC_MODEL, generationTimeSeconds: seconds })
  return seconds
}
