import { describe, expect, it } from 'vitest'
import { createScene } from '../features/scene-management/factory'
import {
  buildSegments,
  deriveStatus,
  generationPrompt,
  locateTime,
  masterScriptText,
  totalDuration,
} from '../features/script-sync/derive'
import { createProjectData } from '../features/scene-management/factory'

const mk = (d: number, title = 'x') => createScene('p', title, d)

describe('motor de tiempo', () => {
  it('ejemplo del documento: 8+10+15+7, segundo 20 → escena 3, segundo 2', () => {
    const segs = buildSegments([mk(8), mk(10), mk(15), mk(7)])
    expect(totalDuration(segs)).toBe(40)
    expect(locateTime(segs, 20)).toEqual({ index: 2, offset: 2 })
    expect(locateTime(segs, 0)).toEqual({ index: 0, offset: 0 })
    expect(locateTime(segs, 99).index).toBe(3)
  })
  it('el video activo manda sobre la duración planificada', () => {
    const s = mk(8)
    s.videoVersions = [{ id: 'v1', mediaId: 'm', duration: 5.2, createdAt: '' }]
    s.activeVideoVersionId = 'v1'
    expect(buildSegments([s, mk(3)])[1].start).toBeCloseTo(5.2)
  })
})

describe('guion y prompt', () => {
  it('el guion maestro se deriva de las escenas, en orden', () => {
    const p = createProjectData('Promo')
    const a = mk(4, 'Uno')
    const b = mk(6, 'Dos')
    b.script.dialogue = 'Joven: —¡Mire!'
    expect(masterScriptText(p, [a, b])).toMatch(/ESCENA 01 · UNO[\s\S]*ESCENA 02 · DOS[\s\S]*Diálogo: Joven: —¡Mire!/)
    expect(masterScriptText(p, [b, a])).toMatch(/ESCENA 01 · DOS/)
  })
  it('la pronunciación solo cambia el prompt', () => {
    const p = createProjectData('Promo')
    const s = mk(5)
    s.script.action = 'Aparece el logo de TuApp.digital'
    s.script.pronunciations = [{ id: '1', written: 'TuApp.digital', spoken: 'Tu Ap Dijital' }]
    expect(generationPrompt(s)).toContain('Tu Ap Dijital')
    expect(masterScriptText(p, [s])).toContain('TuApp.digital')
  })
  it('estados', () => {
    const s = mk(5)
    expect(deriveStatus(s)).toBe('draft')
    s.script.action = 'algo'
    expect(deriveStatus(s)).toBe('script-ready')
    s.startImageId = 'm'
    expect(deriveStatus(s)).toBe('video-pending')
    s.reviewed = true
    expect(deriveStatus(s)).toBe('reviewed')
  })
})

import { integerToWords, numbersToWordsInText } from '../utils/numberWords'
describe('números en letras', () => {
  it('enteros', () => {
    expect(integerToWords(1253)).toBe('mil doscientos cincuenta y tres')
    expect(integerToWords(100)).toBe('cien')
    expect(integerToWords(101)).toBe('ciento uno')
    expect(integerToWords(21)).toBe('veintiuno')
    expect(integerToWords(21000)).toBe('veintiún mil')
    expect(integerToWords(31000)).toBe('treinta y un mil')
    expect(integerToWords(1000000)).toBe('un millón')
    expect(integerToWords(2500000)).toBe('dos millones quinientos mil')
    expect(integerToWords(0)).toBe('cero')
  })
  it('en texto: precios, porcentajes, miles y decimales', () => {
    expect(numbersToWordsInText('Cuesta $150 y 50% menos')).toBe('Cuesta ciento cincuenta pesos y cincuenta por ciento menos')
    expect(numbersToWordsInText('1,253 clientes')).toBe('mil doscientos cincuenta y tres clientes')
    expect(numbersToWordsInText('2.5 segundos')).toBe('dos punto cinco segundos')
  })
  it('solo si el interruptor está prendido, y nunca en el guion maestro', () => {
    const s = mk(5)
    s.script.dialogue = 'Joven: —¡Son 3 tacos!'
    expect(generationPrompt(s)).toContain('3 tacos')
    s.script.numbersToWords = true
    expect(generationPrompt(s)).toContain('tres tacos')
    expect(masterScriptText(createProjectData('P'), [s])).toContain('3 tacos')
  })
})
