import { describe, expect, it } from 'vitest'
import { createProjectData, createScene } from '../features/scene-management/factory'
import { generationPrompt } from '../features/script-sync/derive'
import { applyItemSuggestion, applySuggestion, bibleAnswered, characterContext, findCharacters, suggestionPrompt } from '../features/bible/bible'

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

  it('aceptar la sugerencia la pasa a las fichas', () => {
    const q = { ...p, suggestion: [
      { name: 'mesero', description: 'joven, mandil negro', imageId: 'm1' },
      { name: 'Ana', description: 'señora alegre' },
    ] }
    const one = applySuggestion(q, 'Mesero')
    expect(one.characters).toMatchObject([{ id: '1', name: 'Mesero', description: 'joven, mandil negro', imageId: 'm1', tries: [{ mediaId: 'm1' }] }])
    expect(one.suggestion?.map((s) => s.name)).toEqual(['Ana'])
    const all = applySuggestion(one)
    expect(all.characters?.map((c) => [c.name, c.description])).toEqual([['Mesero', 'joven, mandil negro'], ['Ana', 'señora alegre']])
    expect(all.suggestion).toBeUndefined()
  })

  it('aceptar locaciones sugeridas las pasa a la lista sin repetir', () => {
    const q = { ...p, locations: [{ id: 'l1', name: 'Cocina', description: '' }], itemSuggestions: { locations: [
      { name: 'cocina', note: 'Interior', description: 'cocina de taquería' },
      { name: 'Calle', description: 'banqueta de noche' },
    ] } }
    const one = applyItemSuggestion(q, 'locations', 'Cocina')
    expect(one.locations).toEqual([{ id: 'l1', name: 'Cocina', note: 'Interior', description: 'cocina de taquería' }])
    const all = applyItemSuggestion(one, 'locations')
    expect(all.locations?.map((l) => l.name)).toEqual(['Cocina', 'Calle'])
    expect(all.itemSuggestions?.locations).toBeUndefined()
  })

  it('el guion da contexto de cada personaje', () => {
    s1.script.action = 'Ana entra cargando bolsas. Llueve.'
    const ctx = characterContext('ana', [s1, s2])
    expect(ctx).toContain('«Hola»')
    expect(ctx).toContain('Hace: Ana entra cargando bolsas.')
    expect(ctx).not.toContain('Llueve')
    expect(suggestionPrompt(p, ['Ana'], [s1, s2])).toContain('- Ana: Dice:')
  })
})
