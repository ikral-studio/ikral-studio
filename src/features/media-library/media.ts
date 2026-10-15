// Importar archivos, leer metadatos, crear miniaturas y entregar URLs temporales.
import { useEffect, useState } from 'react'
import { getMedia, getMediaAsset, putMedia } from '../../database/db'
import type { MediaAsset, MediaKind, MediaRecord } from '../../types'
import { nowIso, uid } from '../../utils'

export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp']
export const VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime']
export const AUDIO_TYPES = ['audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/ogg', 'audio/webm']

export function kindOf(file: File): MediaKind | null {
  const type = file.type || guessType(file.name)
  if (IMAGE_TYPES.includes(type)) return 'image'
  if (VIDEO_TYPES.includes(type)) return 'video'
  if (AUDIO_TYPES.includes(type)) return 'audio'
  return null
}

function guessType(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase()
  const map: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    mp4: 'video/mp4',
    m4v: 'video/mp4',
    webm: 'video/webm',
    mov: 'video/quicktime',
    mp3: 'audio/mpeg',
    m4a: 'audio/mp4',
    aac: 'audio/aac',
    wav: 'audio/wav',
    ogg: 'audio/ogg',
  }
  return map[ext ?? ''] ?? ''
}

export class MediaError extends Error {}

async function canvasToBlob(source: CanvasImageSource, w: number, h: number, max = 360): Promise<Blob | undefined> {
  if (!w || !h) return undefined
  const scale = Math.min(1, max / Math.max(w, h))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(w * scale))
  canvas.height = Math.max(1, Math.round(h * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) return undefined
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
  return new Promise((res) => canvas.toBlob((b) => res(b ?? undefined), 'image/jpeg', 0.8))
}

async function readImage(file: Blob): Promise<{ width: number; height: number; thumb?: Blob }> {
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    const thumb = await canvasToBlob(img, img.naturalWidth, img.naturalHeight)
    return { width: img.naturalWidth, height: img.naturalHeight, thumb }
  } catch {
    throw new MediaError('No se pudo leer la imagen. ¿Está dañada?')
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function readVideo(file: Blob): Promise<{ width: number; height: number; duration: number; thumb?: Blob }> {
  const url = URL.createObjectURL(file)
  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.preload = 'auto'
  video.src = url
  try {
    await new Promise<void>((res, rej) => {
      video.onloadedmetadata = () => res()
      video.onerror = () => rej(new MediaError('El navegador no puede abrir este video (formato o códec no compatible).'))
      setTimeout(() => rej(new MediaError('El video tardó demasiado en abrir.')), 20000)
    })
    const duration = Number.isFinite(video.duration) ? video.duration : 0
    const width = video.videoWidth
    const height = video.videoHeight
    let thumb: Blob | undefined
    try {
      if (video.readyState < 2)
        await new Promise<void>((res) => {
          video.onloadeddata = () => res()
          setTimeout(res, 4000)
        })
      video.currentTime = Math.min(0.5, duration / 3 || 0)
      await new Promise<void>((res) => {
        video.onseeked = () => res()
        setTimeout(res, 4000)
      })
      // Safari necesita un par de cuadros para tener la imagen lista en el canvas.
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      thumb = await canvasToBlob(video, width, height)
    } catch {
      thumb = undefined
    }
    return { width, height, duration, thumb }
  } finally {
    video.removeAttribute('src')
    video.load()
    URL.revokeObjectURL(url)
  }
}

async function readAudio(file: Blob): Promise<{ duration: number }> {
  const url = URL.createObjectURL(file)
  const audio = document.createElement('audio')
  audio.preload = 'metadata'
  audio.src = url
  try {
    await new Promise<void>((res, rej) => {
      audio.onloadedmetadata = () => res()
      audio.onerror = () => rej(new MediaError('El navegador no puede abrir este audio (usa MP3, M4A o WAV).'))
      setTimeout(() => rej(new MediaError('El audio tardó demasiado en abrir.')), 20000)
    })
    return { duration: Number.isFinite(audio.duration) ? audio.duration : 0 }
  } finally {
    audio.removeAttribute('src')
    URL.revokeObjectURL(url)
  }
}

/** Valida, lee metadatos y guarda el archivo en IndexedDB antes de devolverlo. */
export async function importFile(file: File, projectId: string, expect?: MediaKind): Promise<MediaAsset> {
  const kind = kindOf(file)
  if (!kind) throw new MediaError(`«${file.name}» no es un formato aceptado (PNG, JPG, WebP, MP4, WebM, MP3, M4A, WAV).`)
  if (expect && kind !== expect)
    throw new MediaError(
      expect === 'image' ? 'Aquí va una imagen (PNG, JPG o WebP).' : expect === 'video' ? 'Aquí va un video (MP4 o WebM).' : 'Aquí va música (MP3, M4A o WAV).',
    )
  const meta: { width?: number; height?: number; duration?: number; thumb?: Blob } =
    kind === 'image' ? await readImage(file) : kind === 'video' ? await readVideo(file) : await readAudio(file)
  const record: MediaRecord = {
    id: uid('md_'),
    projectId,
    name: file.name,
    mimeType: file.type || guessType(file.name),
    size: file.size,
    kind,
    width: meta.width || undefined,
    height: meta.height || undefined,
    duration: meta.duration,
    createdAt: nowIso(),
    blob: file,
    thumb: meta.thumb,
  }
  try {
    await putMedia(record)
  } catch (e) {
    console.error('IndexedDB put failed', e)
    const quota = e instanceof Error && /quota/i.test(e.name + e.message)
    throw new MediaError(quota ? 'No hay espacio suficiente en el navegador para guardar el archivo.' : 'No se pudo guardar el archivo.')
  }
  requestPersistentStorage()
  notify(record.id)
  const { blob, thumb, ...asset } = record
  return asset
}

let persistAsked = false
export function requestPersistentStorage() {
  if (persistAsked || !navigator.storage?.persist) return
  persistAsked = true
  navigator.storage.persist().catch(() => {})
}

// ---------- Caché de URLs temporales ----------
// Las object URLs no son almacenamiento: se crean desde el Blob guardado y se reutilizan.
const urlCache = new Map<string, Promise<string | null>>()
const metaCache = new Map<string, Promise<MediaAsset | null>>()
const listeners = new Set<(id: string) => void>()
function notify(id: string) {
  listeners.forEach((l) => l(id))
}

export function getMediaUrl(id: string, thumb = false): Promise<string | null> {
  const key = (thumb ? 't:' : 'f:') + id
  let p = urlCache.get(key)
  if (!p) {
    p = getMedia(id).then((rec) => {
      if (!rec) return null
      const blob = thumb ? (rec.thumb ?? rec.blob) : rec.blob
      return URL.createObjectURL(blob)
    })
    urlCache.set(key, p)
    p.then((u) => u === null && urlCache.delete(key))
  }
  return p
}

export function getMediaMeta(id: string): Promise<MediaAsset | null> {
  let p = metaCache.get(id)
  if (!p) {
    p = getMediaAsset(id).then((a) => a ?? null)
    metaCache.set(id, p)
    p.then((m) => m === null && metaCache.delete(id))
  }
  return p
}

export async function getMediaBlob(id: string): Promise<MediaRecord | undefined> {
  return getMedia(id)
}

/** Libera las URLs de un proyecto anterior. */
export function releaseAllUrls() {
  urlCache.forEach((p) => p.then((u) => u && URL.revokeObjectURL(u)))
  urlCache.clear()
  metaCache.clear()
}

export function useMediaUrl(id: string | undefined, thumb = false): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    if (!id) {
      setUrl(null)
      return
    }
    const load = () => getMediaUrl(id, thumb).then((u) => alive && setUrl(u))
    load()
    const l = (changed: string) => changed === id && load()
    listeners.add(l)
    return () => {
      alive = false
      listeners.delete(l)
    }
  }, [id, thumb])
  return id ? url : null
}

export function useMediaMeta(id: string | undefined): MediaAsset | null {
  const [meta, setMeta] = useState<MediaAsset | null>(null)
  useEffect(() => {
    let alive = true
    if (!id) {
      setMeta(null)
      return
    }
    getMediaMeta(id).then((m) => alive && setMeta(m))
    return () => {
      alive = false
    }
  }, [id])
  return id ? meta : null
}
