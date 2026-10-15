// Duración sugerida de una escena según su guion (sin IA, con reglas simples):
// - Diálogo: ~2.5 palabras por segundo en español + 1 s de respiro.
// - Acción: ~1.5 s por cada cosa que pasa (oración), mínimo 2 s.
// - Movimiento de cámara: lo que tarda en verse bien (ej. un orbital 360° lento ≈ 8 s).
// Como diálogo, acción y cámara pasan al mismo tiempo, se toma el mayor.
import type { Scene } from '../../types'
import { cameraItem } from '../camera/camera'

export const WORDS_PER_SECOND = 2.5

const MOVE_SECONDS: Record<string, number> = {
  static: 0, pan: 3, tilt: 3, dollyin: 4, dollyout: 4, truck: 4, follow: 4, crane: 4, zoom: 2.5, crash: 1.5,
  vertigo: 3, orbit: 6, arc: 4, bullet: 4, handheld: 0, whip: 1, drone: 5, fpv: 4, snorri: 3, through: 3, reveal: 3,
}
const SPEED_FACTOR = { slow: 1.35, normal: 1, fast: 0.7 }

export interface Suggestion {
  seconds: number
  reasons: string[]
}

const words = (t: string) => (t.match(/[\p{L}\p{N}]+/gu) ?? []).length

/** Quita «Joven:» al inicio de cada línea para no contar el nombre como palabra dicha. */
function spokenText(dialogue: string) {
  return dialogue
    .split('\n')
    .map((l) => l.replace(/^\s*[\p{L} .]{1,30}:\s*/u, ''))
    .join(' ')
}

export function suggestDuration(scene: Scene): Suggestion | null {
  const s = scene.script
  const reasons: string[] = []
  const candidates: number[] = []

  const w = words(spokenText(s.dialogue))
  if (w) {
    const sec = w / WORDS_PER_SECOND + 1
    candidates.push(sec)
    reasons.push(`diálogo de ${w} palabra${w === 1 ? '' : 's'} ≈ ${Math.ceil(sec)} s`)
  }
  const sentences = s.action.split(/[.!?…;]+/).filter((x) => words(x) >= 3).length
  if (sentences) {
    const sec = Math.max(2, sentences * 1.5)
    candidates.push(sec)
    reasons.push(`${sentences} acción${sentences === 1 ? '' : 'es'} ≈ ${Math.ceil(sec)} s`)
  }
  const move = s.camera?.move
  if (move && MOVE_SECONDS[move]) {
    const sec = MOVE_SECONDS[move] * SPEED_FACTOR[s.camera?.speed ?? 'normal']
    candidates.push(sec)
    reasons.push(`${cameraItem(move)!.row[1].toLowerCase()}${s.camera?.speed === 'slow' ? ' lento' : s.camera?.speed === 'fast' ? ' rápido' : ''} ≈ ${Math.ceil(sec)} s`)
  }
  if (!candidates.length) return null
  let seconds = Math.max(3, Math.ceil(Math.max(...candidates)))
  if (s.camera?.time === 'slowmo') {
    seconds = Math.ceil(seconds * 1.5)
    reasons.push('cámara lenta ×1.5')
  }
  return { seconds: Math.min(60, seconds), reasons }
}
