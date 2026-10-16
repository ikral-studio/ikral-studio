import { describe, expect, it } from 'vitest'
import { emojiFor, joinEmotions, lineSeconds, parseDialogue, serializeDialogue, splitEmotions } from '../features/dialogue/lines'

describe('diálogos por línea', () => {
  it('lee personaje, emoción y texto', () => {
    const lines = parseDialogue('Beto (confundido): —Sí, sí… ¿o eran cinco?\nDon Pepe: —Toma, apúntale.')
    expect(lines[0]).toEqual({ speaker: 'Beto', emotion: 'confundido', text: '—Sí, sí… ¿o eran cinco?' })
    expect(lines[1]).toEqual({ speaker: 'Don Pepe', emotion: '', text: '—Toma, apúntale.' })
  })
  it('una línea sin «Nombre:» se queda como texto', () => {
    expect(parseDialogue('(silencio)')).toEqual([{ speaker: '', emotion: '', text: '(silencio)' }])
  })
  it('ida y vuelta sin perder nada', () => {
    const t = 'Voz en el teléfono: —Son seis al pastor\nBeto (nervioso): —Sí, sí…\n(silencio)'
    expect(serializeDialogue(parseDialogue(t))).toBe(t)
  })
  it('cambiar la emoción solo toca esa línea', () => {
    const lines = parseDialogue('Beto: —Hola\nDoña Chuy: —Ándale')
    lines[1].emotion = 'enojado'
    expect(serializeDialogue(lines)).toBe('Beto: —Hola\nDoña Chuy (enojado): —Ándale')
  })
  it('emoji y segundos', () => {
    expect(emojiFor('Presumido')).toBe('💅')
    expect(lineSeconds('—Son seis al pastor, dos sin cebolla y una de queso')).toBe(4.5)
    expect(lineSeconds('')).toBe(0)
  })
  it('tres emociones: inicio → mitad → final', () => {
    const [l] = parseDialogue('Beto (nervioso → confundido → aliviado): —Sí, sí…')
    expect(splitEmotions(l.emotion)).toEqual(['nervioso', 'confundido', 'aliviado'])
    expect(joinEmotions(['nervioso', '', 'aliviado'])).toBe('nervioso → neutral → aliviado')
    expect(joinEmotions(['feliz', '', ''])).toBe('feliz')
    expect(joinEmotions(['', '', ''])).toBe('')
  })
})
