// Video gratis en la Mac: ComfyUI + LTX-Video (2B destilado) hace el video de la escena
// yendo de la imagen inicial a la final. Todo local en http://127.0.0.1:8188, sin créditos.
import type { AspectRatio } from '../../types'

export const COMFY_URL = 'http://127.0.0.1:8188'
export const LOCAL_MODEL = 'LTX-Video 2B (Mac)'
const FPS = 24

/** Calidades como al exportar en Final Cut: más grande = más lento. Minutos por video, aproximados. */
export const QUALITIES = {
  rapida: { label: 'Rápida', long: 640, short: 352, minutes: 1.5 },
  normal: { label: 'Normal', long: 768, short: 448, minutes: 2.5 },
  alta: { label: 'Alta', long: 960, short: 544, minutes: 4 },
} as const
export type Quality = keyof typeof QUALITIES

/** LTX pide medidas múltiplos de 32 y cuadros 8n+1. */
export function videoSize(aspect: AspectRatio, quality: Quality = 'rapida') {
  const { long, short } = QUALITIES[quality]
  return aspect === '9:16' ? { width: short, height: long } : { width: long, height: short }
}

/** Segundos planeados → cuadros válidos para LTX (de 2 a 8 s). */
export function frameCount(seconds: number) {
  const s = Math.min(8, Math.max(2, seconds || 4))
  return Math.round((s * FPS) / 8) * 8 + 1
}

export interface LocalVideoJob {
  startImage: string
  endImage: string
  prompt: string
  aspect: AspectRatio
  quality?: Quality
  seconds: number
  seed: number
  prefix: string
}

/** Flujo de ComfyUI (formato API): texto + imagen inicial (cuadro 0) + imagen final (último cuadro). */
export function buildWorkflow(job: LocalVideoJob) {
  const { width, height } = videoSize(job.aspect, job.quality)
  const length = frameCount(job.seconds)
  const scale = (image: string) => ({ class_type: 'ImageScale', inputs: { image: [image, 0], upscale_method: 'lanczos', width, height, crop: 'center' } })
  return {
    '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'ltxv-2b-0.9.8-distilled.safetensors' } },
    '2': { class_type: 'CLIPLoader', inputs: { clip_name: 't5xxl_fp8_e4m3fn_scaled.safetensors', type: 'ltxv' } },
    '3': { class_type: 'CLIPTextEncode', inputs: { clip: ['2', 0], text: job.prompt } },
    '4': { class_type: 'CLIPTextEncode', inputs: { clip: ['2', 0], text: 'low quality, worst quality, deformed, distorted, blurry, watermark' } },
    '5': { class_type: 'LTXVConditioning', inputs: { positive: ['3', 0], negative: ['4', 0], frame_rate: FPS } },
    '6': { class_type: 'EmptyLTXVLatentVideo', inputs: { width, height, length, batch_size: 1 } },
    '20': { class_type: 'LoadImage', inputs: { image: job.startImage } },
    '21': { class_type: 'LoadImage', inputs: { image: job.endImage } },
    '25': scale('20'),
    '26': scale('21'),
    '22': { class_type: 'LTXVAddGuide', inputs: { positive: ['5', 0], negative: ['5', 1], vae: ['1', 2], latent: ['6', 0], image: ['25', 0], frame_idx: 0, strength: 1 } },
    '23': { class_type: 'LTXVAddGuide', inputs: { positive: ['22', 0], negative: ['22', 1], vae: ['1', 2], latent: ['22', 2], image: ['26', 0], frame_idx: -1, strength: 1 } },
    '7': { class_type: 'LTXVScheduler', inputs: { steps: 8, max_shift: 2.05, base_shift: 0.95, stretch: true, terminal: 0.1, latent: ['23', 2] } },
    '8': { class_type: 'KSamplerSelect', inputs: { sampler_name: 'euler' } },
    '9': { class_type: 'SamplerCustom', inputs: { model: ['1', 0], add_noise: true, noise_seed: job.seed, cfg: 1, positive: ['23', 0], negative: ['23', 1], sampler: ['8', 0], sigmas: ['7', 0], latent_image: ['23', 2] } },
    '24': { class_type: 'LTXVCropGuides', inputs: { positive: ['23', 0], negative: ['23', 1], latent: ['9', 0] } },
    '10': { class_type: 'VAEDecode', inputs: { samples: ['24', 2], vae: ['1', 2] } },
    '11': { class_type: 'CreateVideo', inputs: { images: ['10', 0], fps: FPS } },
    '12': { class_type: 'SaveVideo', inputs: { video: ['11', 0], filename_prefix: job.prefix, format: 'mp4', codec: 'h264' } },
  }
}

export async function comfyRunning(base = COMFY_URL) {
  try {
    return (await fetch(`${base}/system_stats`)).ok
  } catch {
    return false
  }
}

async function upload(base: string, blob: Blob, name: string) {
  const form = new FormData()
  form.append('image', blob, name)
  form.append('overwrite', 'true')
  const r = await fetch(`${base}/upload/image`, { method: 'POST', body: form })
  if (!r.ok) throw new Error(`No se pudo subir la imagen (${r.status})`)
  return ((await r.json()) as { name: string }).name
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Manda las dos imágenes, espera el video y lo devuelve como archivo MP4. */
export async function makeLocalVideo(
  opts: { start: Blob; end: Blob; prompt: string; aspect: AspectRatio; quality?: Quality; seconds: number; name: string },
  base = COMFY_URL,
): Promise<{ file: File; seconds: number }> {
  const t0 = Date.now()
  const tag = `ikral_${Date.now()}`
  const job: LocalVideoJob = {
    startImage: await upload(base, opts.start, `${tag}_inicio.png`),
    endImage: await upload(base, opts.end, `${tag}_final.png`),
    prompt: opts.prompt,
    aspect: opts.aspect,
    quality: opts.quality,
    seconds: opts.seconds,
    seed: Math.floor(Math.random() * 1e9),
    prefix: tag,
  }
  const r = await fetch(`${base}/prompt`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: buildWorkflow(job) }) })
  if (!r.ok) throw new Error(`ComfyUI no aceptó el pedido (${r.status}): ${(await r.text()).slice(0, 200)}`)
  const { prompt_id } = (await r.json()) as { prompt_id: string }
  for (;;) {
    await wait(3000)
    const h = (await (await fetch(`${base}/history/${prompt_id}`)).json()) as Record<string, { status: { status_str: string }; outputs: Record<string, { images?: { filename: string; subfolder: string; type: string }[] }> }>
    const run = h[prompt_id]
    if (!run) continue
    if (run.status.status_str !== 'success') throw new Error('ComfyUI no pudo hacer el video')
    const out = Object.values(run.outputs).flatMap((o) => o.images ?? [])[0]
    if (!out) throw new Error('ComfyUI terminó sin video')
    const q = new URLSearchParams({ filename: out.filename, subfolder: out.subfolder, type: out.type })
    const blob = await (await fetch(`${base}/view?${q}`)).blob()
    return { file: new File([blob], `${opts.name}.mp4`, { type: 'video/mp4' }), seconds: Math.round((Date.now() - t0) / 1000) }
  }
}
