// Lectura en voz alta POR SECCIÓN con la voz del sistema (macOS), sin servicios de pago ni datos fuera del equipo.
// Una sola sección suena a la vez: al empezar otra, la anterior se detiene. Nunca arranca sola.
// Reutilizable en cualquier texto largo (GPT, Biblia, análisis de guion): basta un id de sección y su texto.

export type ReaderStatus = 'idle' | 'speaking' | 'paused' | 'unavailable'

export interface ReaderState {
  sectionId: string | null
  /** Última sección que se pidió leer (para mostrar el aviso de error junto a ella). */
  lastSectionId: string | null
  status: ReaderStatus
  /** Aviso si la voz falló (el texto sigue en pantalla). */
  error: string | null
}

export interface UtteranceLike {
  text: string
  lang: string
  voice: VoiceLike | null
  onend: (() => void) | null
  onerror: ((e: { error?: string }) => void) | null
}

export interface VoiceLike {
  name: string
  lang: string
}

export interface SynthLike {
  speak(u: UtteranceLike): void
  cancel(): void
  pause(): void
  resume(): void
  getVoices(): VoiceLike[]
}

export interface ReaderDeps {
  synth: SynthLike | null
  makeUtterance: (text: string) => UtteranceLike
}

export const NO_VOICE_TEXT = 'Este equipo no tiene voz para leer. El texto sigue aquí.'
export const VOICE_ERROR_TEXT = 'No se pudo leer en voz alta. El texto sigue aquí.'

/** Quita marcas de formato y emojis (no se leen bien); deja todas las palabras. */
export function cleanForSpeech(text: string) {
  return text
    .replace(/[*_`#>]/g, '')
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Parte el texto en trozos cortos (por frases) para que la voz no se corte en textos largos. No pierde palabras. */
export function chunkForSpeech(text: string, max = 240): string[] {
  const clean = cleanForSpeech(text)
  if (!clean) return []
  const pieces: string[] = []
  for (const sentence of clean.split(/(?<=[.!?…:;])\s+/)) {
    if (sentence.length <= max) {
      pieces.push(sentence)
      continue
    }
    let line = ''
    for (const word of sentence.split(' ')) {
      if (line && line.length + 1 + word.length > max) {
        pieces.push(line)
        line = word
      } else line = line ? `${line} ${word}` : word
    }
    if (line) pieces.push(line)
  }
  const chunks: string[] = []
  for (const p of pieces) {
    const last = chunks[chunks.length - 1]
    if (last !== undefined && last.length + 1 + p.length <= max) chunks[chunks.length - 1] = `${last} ${p}`
    else chunks.push(p)
  }
  return chunks
}

/** Voz en español (México si existe). */
export function pickSpanishVoice(voices: VoiceLike[]) {
  return voices.find((v) => v.name.includes('Paulina')) ?? voices.find((v) => v.lang === 'es-MX') ?? voices.find((v) => v.lang.startsWith('es')) ?? null
}

export function createReader(deps: ReaderDeps) {
  let state: ReaderState = { sectionId: null, lastSectionId: null, status: deps.synth ? 'idle' : 'unavailable', error: null }
  let lastText = ''
  /** Cada lectura tiene su número: los avisos de una lectura vieja (ya detenida) se ignoran. */
  let run = 0
  const listeners = new Set<() => void>()

  const set = (patch: Partial<ReaderState>) => {
    state = { ...state, ...patch }
    listeners.forEach((l) => l())
  }

  const speakChunks = (chunks: string[], i: number, mine: number) => {
    const synth = deps.synth!
    if (mine !== run) return
    if (i >= chunks.length) return set({ sectionId: null, status: 'idle' })
    const u = deps.makeUtterance(chunks[i])
    u.voice = pickSpanishVoice(synth.getVoices())
    u.lang = u.voice?.lang ?? 'es-MX'
    u.onend = () => speakChunks(chunks, i + 1, mine)
    u.onerror = (e) => {
      if (mine !== run) return
      if (e.error === 'interrupted' || e.error === 'canceled') return
      run++
      set({ sectionId: null, status: 'idle', error: VOICE_ERROR_TEXT })
    }
    synth.speak(u)
  }

  const stop = () => {
    run++
    deps.synth?.cancel()
    if (state.status !== 'unavailable') set({ sectionId: null, status: 'idle' })
  }

  const api = {
    getState: () => state,
    subscribe(l: () => void) {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    /** Lee una sección completa. Si sonaba otra, la detiene primero. */
    speak(id: string, text: string) {
      if (!deps.synth) return set({ sectionId: null, lastSectionId: id, status: 'unavailable', error: NO_VOICE_TEXT })
      const chunks = chunkForSpeech(text)
      run++
      deps.synth.cancel()
      if (!chunks.length) return set({ sectionId: null, lastSectionId: id, status: 'idle', error: null })
      lastText = text
      set({ sectionId: id, lastSectionId: id, status: 'speaking', error: null })
      try {
        speakChunks(chunks, 0, run)
      } catch {
        run++
        set({ sectionId: null, status: 'idle', error: VOICE_ERROR_TEXT })
      }
    },
    pause() {
      if (state.status !== 'speaking') return
      deps.synth?.pause()
      set({ status: 'paused' })
    },
    resume() {
      if (state.status !== 'paused') return
      deps.synth?.resume()
      set({ status: 'speaking' })
    },
    stop,
    /** Vuelve a leer desde el principio la sección que sonaba. */
    repeat(id: string, text?: string) {
      api.speak(id, text ?? lastText)
    },
    /** Detiene solo si esa sección es la que suena (p. ej. al cerrar la pantalla o cambiar de escena). */
    stopIf(id: string) {
      if (state.sectionId === id) stop()
    },
  }
  return api
}

export type Reader = ReturnType<typeof createReader>

let shared: Reader | null = null

/** El lector de la app (uno solo, para que nunca suenen dos secciones a la vez). */
export function appReader(): Reader {
  if (!shared) {
    const has = typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined'
    shared = createReader({
      synth: has ? (window.speechSynthesis as unknown as SynthLike) : null,
      makeUtterance: (text) => new SpeechSynthesisUtterance(text) as unknown as UtteranceLike,
    })
  }
  return shared
}
