// Constructor de toma: convierte lo elegido en la biblioteca en texto
// para el guion (español) y para el prompt del generador (inglés).
import type { CameraSpec } from '../../types'
import { CAMERA_CATEGORIES, type CameraCategoryId, type CameraItemRow } from './library'

export const CAMERA_ORDER: CameraCategoryId[] = ['shot', 'angle', 'move', 'lens', 'composition', 'light', 'time', 'transition']

export const SPEEDS = {
  slow: { es: 'lento', en: 'slow, smooth and constant speed, settling into a still hold at the end' },
  normal: { es: 'normal', en: 'moderate steady speed' },
  fast: { es: 'rápido', en: 'fast and snappy, then a sharp settle' },
} as const
export type CameraSpeed = keyof typeof SPEEDS

/** Lo que NO debe hacer la cámara en cada movimiento (evita mezclas raras en la IA). */
export const NEGATIVES: Record<string, string> = {
  static: 'no camera movement, no zoom',
  pan: 'the camera stays in place, no travel, no zoom',
  tilt: 'no camera travel, no zoom',
  dollyin: 'no zoom, the camera physically moves',
  dollyout: 'no zoom, the camera physically moves',
  truck: 'no zoom, no pan drift',
  follow: 'no zoom',
  crane: 'no zoom, stable horizon',
  zoom: 'the camera does not move, only the lens zooms',
  crash: 'the camera does not move',
  orbit: 'no zoom, the subject does not spin in place',
  arc: 'no zoom',
  handheld: 'no intentional zoom',
  whip: 'no camera travel',
}

const byId = new Map<string, { cat: CameraCategoryId; row: CameraItemRow }>()
CAMERA_CATEGORIES.forEach((c) => c.items.forEach((row) => byId.set(row[0], { cat: c.id, row })))

export const cameraItem = (id: string | undefined) => (id ? byId.get(id) : undefined)
export const cameraIds = (cat: CameraCategoryId) => CAMERA_CATEGORIES.find((c) => c.id === cat)!.items.map((r) => r[0])

export function isCameraEmpty(spec?: CameraSpec): boolean {
  return !spec || CAMERA_ORDER.every((k) => !spec[k])
}

/** «Plano medio · Contrapicado · Orbital 360° (lento) · …» */
export function cameraSpanish(spec?: CameraSpec): string {
  if (!spec) return ''
  return CAMERA_ORDER.map((k) => {
    const it = cameraItem(spec[k])
    if (!it) return ''
    return k === 'move' && spec.speed ? `${it.row[1]} (${SPEEDS[spec.speed].es})` : it.row[1]
  })
    .filter(Boolean)
    .join(' · ')
}

/** Frase en inglés para el prompt, con velocidad y lo que la cámara no debe hacer. */
export function cameraPrompt(spec?: CameraSpec): string {
  if (!spec) return ''
  const parts: string[] = []
  for (const k of CAMERA_ORDER) {
    const id = spec[k]
    const it = cameraItem(id)
    if (!it) continue
    let p = it.row[5]
    if (k === 'move') {
      if (spec.speed) p += `, ${SPEEDS[spec.speed].en}`
      if (id && NEGATIVES[id]) p += `; ${NEGATIVES[id]}`
    }
    parts.push(p)
  }
  return parts.length ? `Camera: ${parts.join('. ')}.` : ''
}

/** Lista compacta para el formato de IA: «shot: ews=Gran plano general, …». */
export function cameraIdsForAI(): string {
  return CAMERA_CATEGORIES.map((c) => `    - "${c.id}" (${c.name}): ${c.items.map((r) => `"${r[0]}" = ${r[1]}`).join(', ')}`).join('\n')
}
