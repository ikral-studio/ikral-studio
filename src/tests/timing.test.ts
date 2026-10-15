import { describe, expect, it } from 'vitest'
import { createScene } from '../features/scene-management/factory'
import { suggestDuration } from '../features/timing/suggest'

describe('duración sugerida', () => {
  it('sin guion no sugiere', () => {
    expect(suggestDuration(createScene('p', 'x', 8))).toBeNull()
  })
  it('diálogo: 2.5 palabras por segundo, sin contar el nombre de quien habla', () => {
    const s = createScene('p', 'x', 8)
    s.script.dialogue = 'Joven: ¡Mire! Con esta aplicación pueden organizar todos sus pedidos.' // 9 palabras
    const r = suggestDuration(s)!
    expect(r.seconds).toBe(5) // 9/2.5 + 1 = 4.6
    expect(r.reasons[0]).toBe('diálogo de 9 palabras ≈ 5 s')
  })
  it('gana lo más largo: un orbital lento pide más que el diálogo', () => {
    const s = createScene('p', 'x', 8)
    s.script.dialogue = 'Joven: ¡Mire!'
    s.script.camera = { move: 'orbit', speed: 'slow' }
    expect(suggestDuration(s)!.seconds).toBe(9) // 6 × 1.35 = 8.1 → 9
  })
})
