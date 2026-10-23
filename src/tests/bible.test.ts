import { describe, expect, it } from 'vitest'
import { createProjectData, createScene } from '../features/scene-management/factory'
import { generationPrompt } from '../features/script-sync/derive'
import { bibleAnswered, findCharacters } from '../features/bible/bible'

describe('biblia del proyecto', () => {
  const p = createProjectData('Promo')
  const s1 = createScene(p.id, 'Llegada', 5)
  s1.script.dialogue = 'Ana (feliz): —Hola\nBeto: —¿Qué tal?\nAna: —Bien'
  const s2 = createScene(p.id, 'Salida', 5)
  s2.script.dialogue = 'Ána: —Adiós'
  p.characters = [{ id: '1', name: 'Mesero', description: '' }]

  it('encuentra a quien habla, sin repetir por acentos', () => {
    const f = findCharacters(p, [s1, s2])
    expect(f.map((c) => [c.name, c.scenes, c.lines])).toEqual([
      ['Ana', 2, 3],
      ['Beto', 1, 1],
      ['Mesero', 0, 0],
    ])
    expect(f.find((c) => c.name === 'Mesero')?.saved).toBe(true)
  })

  it('las respuestas entran al prompt', () => {
    p.bible = { look: 'cartoon', era: 'pueblo mexicano, años 80', mood: 'alegre' }
    expect(bibleAnswered(p)).toBe(3)
    expect(generationPrompt(s1, [], p)).toMatch(/^Visual style: 2D cartoon illustration; setting: pueblo mexicano, años 80; bright cheerful/)
  })
})
