import { describe, expect, it } from 'vitest'
import { chunkForSpeech, cleanForSpeech, createReader, NO_VOICE_TEXT, VOICE_ERROR_TEXT, type SynthLike, type UtteranceLike } from '../features/speech/reader'
import { proposalSpeechText, reviewSummarySpeechText, type GptProposal } from '../features/gpt/proposals'

/** Voz de mentira: guarda lo que se le pide y deja terminar o fallar cada trozo a mano. */
function fakeSynth() {
  const queue: UtteranceLike[] = []
  const spoken: string[] = []
  const calls: string[] = []
  const synth: SynthLike = {
    speak(u) {
      queue.push(u)
      spoken.push(u.text)
    },
    cancel() {
      calls.push('cancel')
      queue.length = 0
    },
    pause: () => calls.push('pause'),
    resume: () => calls.push('resume'),
    getVoices: () => [
      { name: 'Samantha', lang: 'en-US' },
      { name: 'Paulina', lang: 'es-MX' },
    ],
  }
  const finish = () => queue.shift()?.onend?.()
  const fail = (error = 'synthesis-failed') => queue.shift()?.onerror?.({ error })
  const reader = createReader({ synth, makeUtterance: (text) => ({ text, lang: '', voice: null, onend: null, onerror: null }) })
  return { reader, spoken, calls, queue, finish, fail }
}

const proposal = (patch: Partial<GptProposal> = {}): GptProposal => ({
  id: 'p1',
  severity: 'alta',
  problem: 'En la escena 3 aparecen los papelitos y la app a la vez',
  evidence: 'La acción dice «saca los papelitos» y luego «abre la app»',
  correction: 'Dejar solo la app desde la escena 3',
  rule: 'En una escena van los papelitos o la app, nunca los dos',
  status: 'pending',
  ...patch,
})

describe('texto para escuchar un hallazgo', () => {
  it('lee problema, evidencia, corrección y regla, con prioridad y escena', () => {
    const t = proposalSpeechText(proposal(), 3)
    expect(t).toBe(
      'Hallazgo de prioridad alta, escena 03. Problema: En la escena 3 aparecen los papelitos y la app a la vez. Evidencia: La acción dice «saca los papelitos» y luego «abre la app». Corrección: Dejar solo la app desde la escena 3. Regla propuesta: En una escena van los papelitos o la app, nunca los dos.',
    )
  })

  it('omite solo lo que GPT dejó vacío', () => {
    const t = proposalSpeechText(proposal({ evidence: '', rule: undefined, severity: 'baja' }))
    expect(t).toContain('prioridad baja.')
    expect(t).not.toContain('Evidencia')
    expect(t).not.toContain('Regla')
    expect(t).toContain('Corrección:')
  })

  it('el resumen dice cuántos cambios propone GPT', () => {
    expect(reviewSummarySpeechText({ summary: 'Hay dos choques.', proposals: [proposal(), proposal({ id: 'p2' })] })).toBe('Resumen de la revisión de GPT. Hay dos choques. GPT propone 2 cambios.')
    expect(reviewSummarySpeechText({ summary: 'Todo en orden.', proposals: [] })).toContain('GPT no encontró problemas.')
  })

  it('no cambia la propuesta (solo la lee)', () => {
    const p = proposal()
    const before = JSON.stringify(p)
    proposalSpeechText(p, 1)
    expect(JSON.stringify(p)).toBe(before)
  })
})

describe('trozos para la voz', () => {
  it('quita marcas y emojis pero conserva las palabras', () => {
    expect(cleanForSpeech('**Ojo** 🔊 la _abuela_  #1')).toBe('Ojo la abuela 1')
  })

  it('un texto muy largo se parte sin perder ni una palabra', () => {
    const long = Array.from({ length: 80 }, (_, i) => `Frase número ${i} con evidencia larga, corrección y regla`).join('. ') + '. ' + 'palabra '.repeat(120)
    const chunks = chunkForSpeech(long, 240)
    expect(chunks.length).toBeGreaterThan(10)
    expect(chunks.every((c) => c.length <= 240)).toBe(true)
    expect(chunks.join(' ')).toBe(cleanForSpeech(long))
  })

  it('texto vacío: nada que leer', () => {
    expect(chunkForSpeech('  ')).toEqual([])
  })
})

describe('lector por sección', () => {
  it('lee una sección completa, trozo por trozo, con voz en español, y termina', () => {
    const { reader, spoken, queue, finish } = fakeSynth()
    const text = 'Uno. '.repeat(100)
    reader.speak('a', text)
    expect(reader.getState()).toMatchObject({ sectionId: 'a', status: 'speaking' })
    expect(queue[0].voice?.name).toBe('Paulina')
    expect(queue[0].lang).toBe('es-MX')
    while (queue.length) finish()
    expect(spoken.join(' ')).toBe(cleanForSpeech(text))
    expect(reader.getState()).toMatchObject({ sectionId: null, status: 'idle', error: null })
  })

  it('al empezar otra sección, la anterior se detiene y no se mezclan', () => {
    const { reader, spoken, queue, finish, calls } = fakeSynth()
    const a = 'Sección A primera frase. '.repeat(30)
    reader.speak('a', a)
    const aSpoken = spoken.length
    const oldA = queue[0]
    reader.speak('b', 'Sección B.')
    expect(calls).toContain('cancel')
    expect(reader.getState().sectionId).toBe('b')
    // Un aviso tardío de la sección A no debe seguir leyendo A.
    oldA.onend?.()
    expect(spoken.slice(aSpoken)).toEqual(['Sección B.'])
    finish()
    expect(spoken.slice(aSpoken)).toEqual(['Sección B.'])
    expect(reader.getState().status).toBe('idle')
  })

  it('pausar y reanudar', () => {
    const { reader, calls } = fakeSynth()
    reader.pause() // sin lectura: no hace nada
    expect(calls).not.toContain('pause')
    reader.speak('a', 'Hola.')
    reader.pause()
    expect(reader.getState().status).toBe('paused')
    reader.resume()
    expect(reader.getState().status).toBe('speaking')
    expect(calls).toEqual(['cancel', 'pause', 'resume'])
  })

  it('detener y repetir desde el principio', () => {
    const { reader, spoken, queue, finish } = fakeSynth()
    reader.speak('a', 'Primera. Segunda.')
    finish()
    reader.stop()
    expect(reader.getState()).toMatchObject({ sectionId: null, status: 'idle' })
    queue[0]?.onend?.()
    const n = spoken.length
    reader.repeat('a', 'Primera. Segunda.')
    expect(reader.getState().sectionId).toBe('a')
    expect(spoken[n]).toBe('Primera. Segunda.')
  })

  it('al cerrar la pantalla (stopIf) solo se detiene la sección que suena', () => {
    const { reader } = fakeSynth()
    reader.speak('a', 'Hola.')
    reader.stopIf('b')
    expect(reader.getState().sectionId).toBe('a')
    reader.stopIf('a')
    expect(reader.getState().sectionId).toBe(null)
  })

  it('si la voz falla, avisa y deja de leer (el texto sigue en pantalla)', () => {
    const { reader, fail, spoken } = fakeSynth()
    reader.speak('a', 'Uno. '.repeat(100))
    fail('interrupted') // interrupción normal: no es error
    expect(reader.getState().error).toBe(null)
    reader.speak('a', 'Uno. '.repeat(100))
    const n = spoken.length
    fail()
    expect(reader.getState()).toMatchObject({ sectionId: null, lastSectionId: 'a', status: 'idle', error: VOICE_ERROR_TEXT })
    expect(spoken.length).toBe(n)
  })

  it('sin voz en el equipo: avisa, no truena', () => {
    const reader = createReader({ synth: null, makeUtterance: () => { throw new Error('no') } })
    expect(reader.getState().status).toBe('unavailable')
    reader.speak('a', 'Hola.')
    expect(reader.getState()).toMatchObject({ status: 'unavailable', lastSectionId: 'a', error: NO_VOICE_TEXT })
    reader.pause()
    reader.stop()
    expect(reader.getState().status).toBe('unavailable')
  })

  it('nunca arranca sola', () => {
    const { reader, spoken } = fakeSynth()
    expect(reader.getState().status).toBe('idle')
    expect(spoken).toEqual([])
  })
})
