// Música gratis en la Mac: ACE-Step 1.5 (turbo) hace la canción desde un estilo y, si hay, una letra.
// Todo local en http://127.0.0.1:8001, sin créditos. Lo arranca /Volumes/c/AI/ACE-Step/arrancar-ikral-musica.sh.

export const ACE_URL = 'http://127.0.0.1:8001'
export const MUSIC_MODEL = 'ACE-Step 1.5 (Mac)'

/** Duraciones que ofrece la pantalla, en segundos. */
export const DURATIONS = [15, 30, 60, 90, 120, 180] as const

export interface SongJob {
  /** Estilo en palabras: géneros, instrumentos, ánimo (ej. «cumbia alegre, acordeón, sin voz»). */
  style: string
  /** Letra; vacía = instrumental. */
  lyrics: string
  seconds: number
  /** Idioma de la voz (es, en…). */
  language?: string
  seed?: number
  /** Audio de Kyo: «style» copia su estilo; «cover» hace otra versión de esa misma canción. */
  audio?: { blob: Blob; name: string; mode: AudioMode; from?: number; to?: number }
  /** 🎲 Dado: el modelo inventa estilo y letra a partir de una idea (o de nada). */
  surprise?: boolean
}

/** style = copiar su estilo · cover = otra versión · repaint = rehacer solo un pedazo (from–to, en segundos). */
export type AudioMode = 'style' | 'cover' | 'repaint'

/** Qué tanto se parece la otra versión a la original (0 = libre, 1 = igual). */
const COVER_STRENGTH = 0.5

/** Pedido para /release_task. Sin letra va «[Instrumental]», que ACE-Step entiende como sin voz. */
export function buildSongRequest(job: SongJob): Record<string, string | number | boolean> {
  const lyrics = job.lyrics.trim()
  if (job.surprise)
    return {
      sample_mode: true,
      sample_query: job.style.trim() || 'una canción alegre en español',
      thinking: true,
      vocal_language: job.language ?? 'es',
      audio_duration: Math.min(240, Math.max(10, Math.round(job.seconds || 30))),
      audio_format: 'mp3',
      batch_size: 1,
    }
  const a = job.audio
  return {
    prompt: job.style.trim() || 'cinematic background music, instrumental',
    lyrics: lyrics || '[Instrumental]',
    vocal_language: job.language ?? 'es',
    audio_duration: Math.min(240, Math.max(10, Math.round(job.seconds || 30))),
    thinking: false,
    audio_format: 'mp3',
    batch_size: 1,
    ...(a?.mode === 'cover' ? { task_type: 'cover', audio_cover_strength: COVER_STRENGTH } : {}),
    ...(a?.mode === 'repaint' ? { task_type: 'repaint', repainting_start: a.from ?? 0, repainting_end: a.to ?? -1, chunk_mask_mode: 'explicit' } : {}),
    ...(job.seed !== undefined ? { seed: job.seed, use_random_seed: false } : {}),
  }
}

export async function aceRunning(base = ACE_URL) {
  try {
    return (await fetch(`${base}/health`)).ok
  } catch {
    return false
  }
}

interface AceReply<T> {
  data: T
  code: number
  error: string | null
}

/** Con audio va como formulario (archivo + campos); sin audio, como JSON. */
export function songBody(job: SongJob): FormData | object {
  const req = buildSongRequest(job)
  if (!job.audio) return req
  const form = new FormData()
  for (const [k, v] of Object.entries(req)) form.append(k, String(v))
  form.append(job.audio.mode === 'style' ? 'reference_audio' : 'src_audio', job.audio.blob, job.audio.name)
  return form
}

async function post<T>(base: string, path: string, body: unknown): Promise<T> {
  const form = body instanceof FormData
  const r = await fetch(`${base}${path}`, { method: 'POST', headers: form ? undefined : { 'Content-Type': 'application/json' }, body: form ? body : JSON.stringify(body) })
  const j = (await r.json().catch(() => null)) as AceReply<T> | null
  if (!r.ok || !j || j.code !== 200) throw new Error(`El generador de música no aceptó el pedido: ${j?.error ?? r.status}`)
  return j.data
}

/** Lo que trae /query_result en `result` (texto JSON con una lista). */
export function parseResult(result: string): { file: string; status: number; progress?: number; stage?: string; prompt?: string; lyrics?: string }[] {
  try {
    const list = JSON.parse(result)
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Manda el pedido, espera la canción y la devuelve como archivo MP3. */
export async function makeLocalSong(job: SongJob & { name: string }, onProgress?: (pct: number, stage: string) => void, base = ACE_URL): Promise<{ file: File; seconds: number; style?: string; lyrics?: string }> {
  const t0 = Date.now()
  const { task_id } = await post<{ task_id: string }>(base, '/release_task', songBody(job))
  for (;;) {
    await wait(3000)
    const [task] = await post<{ status: number; result: string }[]>(base, '/query_result', { task_id_list: [task_id] })
    if (!task) continue
    const [out] = parseResult(task.result)
    if (task.status === 2) throw new Error('El generador no pudo hacer la música')
    if (task.status !== 1) {
      if (out?.progress !== undefined) onProgress?.(Math.round(out.progress * 100), out.stage ?? '')
      continue
    }
    if (!out?.file) throw new Error('El generador terminó sin archivo')
    const url = out.file.startsWith('/v1/') ? `${base}${out.file}` : `${base}/v1/audio?path=${encodeURIComponent(out.file)}`
    const blob = await (await fetch(url)).blob()
    return { file: new File([blob], `${job.name}.mp3`, { type: 'audio/mpeg' }), seconds: Math.round((Date.now() - t0) / 1000), style: out.prompt, lyrics: out.lyrics }
  }
}
