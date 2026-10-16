// Diálogos por línea: «Personaje (emoción): —texto».
// El texto del campo «Diálogos» sigue siendo la única fuente de verdad; esto solo lo lee y lo escribe.

export interface DialogueLine {
  speaker: string
  emotion: string
  text: string
}

export const EMOTIONS: { emoji: string; label: string }[] = [
  { emoji: '😐', label: 'neutral' },
  { emoji: '😄', label: 'feliz' },
  { emoji: '😂', label: 'riéndose' },
  { emoji: '🥰', label: 'cariñoso' },
  { emoji: '😢', label: 'triste' },
  { emoji: '🥺', label: 'suplicando' },
  { emoji: '😮‍💨', label: 'aliviado' },
  { emoji: '😅', label: 'apenado' },
  { emoji: '🤔', label: 'pensativo' },
  { emoji: '🤨', label: 'no entiende' },
  { emoji: '😵‍💫', label: 'confundido' },
  { emoji: '😮', label: 'sorprendido' },
  { emoji: '😬', label: 'nervioso' },
  { emoji: '😱', label: 'asustado' },
  { emoji: '😠', label: 'enojado' },
  { emoji: '🙄', label: 'ignorando' },
  { emoji: '😒', label: 'con desdén' },
  { emoji: '😌', label: 'orgulloso' },
  { emoji: '💅', label: 'presumido' },
  { emoji: '😏', label: 'cómplice' },
]

export const emojiFor = (emotion: string) => EMOTIONS.find((e) => e.label === emotion.trim().toLowerCase())?.emoji

const LINE = /^\s*([^:\n—()]{1,40}?)\s*(?:\(([^)\n]{1,80})\))?\s*:\s*(.*)$/

export function parseDialogue(text: string): DialogueLine[] {
  if (!text.trim()) return []
  return text.split('\n').map((raw) => {
    const m = LINE.exec(raw)
    return m ? { speaker: m[1].trim(), emotion: (m[2] ?? '').trim(), text: m[3] } : { speaker: '', emotion: '', text: raw }
  })
}

export function serializeDialogue(lines: DialogueLine[]): string {
  return lines
    .map((l) => {
      const who = l.speaker.trim()
      if (!who) return l.text
      return `${who}${l.emotion.trim() ? ` (${l.emotion.trim()})` : ''}: ${l.text}`
    })
    .join('\n')
}

/** Segundos aproximados al decir la línea (≈2.5 palabras por segundo). */
export function lineSeconds(text: string): number {
  const words = text.replace(/[—–\-¡!¿?…"«».,;]/g, ' ').split(/\s+/).filter(Boolean).length
  return words ? Math.max(1, Math.round((words / 2.5) * 2) / 2) : 0
}

/** Hasta 3 emociones por línea: inicio → mitad → final. */
export const MOMENTS = ['inicio', 'mitad', 'final'] as const

export function splitEmotions(emotion: string): [string, string, string] {
  const parts = emotion.split(/\s*(?:→|->)\s*/).map((p) => p.trim())
  return [parts[0] ?? '', parts[1] ?? '', parts[2] ?? '']
}

export function joinEmotions(parts: string[]): string {
  const last = parts.reduce((acc, p, i) => (p.trim() ? i : acc), -1)
  return parts
    .slice(0, last + 1)
    .map((p) => p.trim() || 'neutral')
    .join(' → ')
}
