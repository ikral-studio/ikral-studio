import { describe, expect, it } from 'vitest'
import { createProjectData, createScene } from '../features/scene-management/factory'
import { framePrompt, framesProgress, framesToApply, mapPrep, prepMediaIds } from '../features/bible/frames'

describe('imagen inicial y final (Preproducción)', () => {
  const p = createProjectData('Tacos')
  p.characters = [{ id: 'c1', name: 'Doña Chuy', description: 'señora de 60 años, mandil amarillo' }]
  p.bible = { look: 'cartoon' }
  const s = createScene(p.id, 'Todo va bien', 8)
  s.script.action = 'Doña Chuy sirve tacos y sonríe.'

  it('el prompt lee la escena, sus personajes y el estilo', () => {
    const start = framePrompt(p, s, 'start', 1)
    expect(start).toMatch(/^Opening frame .*scene 1 "Todo va bien"/)
    expect(start).toContain('Doña Chuy sirve tacos')
    expect(start).toContain('Doña Chuy: señora de 60 años, mandil amarillo')
    expect(start).toContain('2D cartoon illustration')
    expect(framePrompt(p, s, 'end', 1)).toMatch(/^Closing frame/)
  })

  it('cuenta aprobadas y pasa solo las nuevas a Edición', () => {
    const a = { ...s, id: 'a', prep: { start: { approvedId: 'm1', tries: [{ id: 't', mediaId: 'm0', at: '' }] }, end: { approvedId: 'm2' } }, startImageId: 'm1', endImageId: 'viejo' }
    const b = { ...s, id: 'b' }
    expect(framesProgress([a, b])).toEqual({ approved: 2, total: 4 })
    expect(framesToApply([a, b])).toEqual([{ sceneId: 'a', slot: 'end', mediaId: 'm2', replaces: true }])
    expect(prepMediaIds(a).sort()).toEqual(['m0', 'm1', 'm2'])
    expect(mapPrep(a.prep, (id) => id && `n${id}`)?.start).toMatchObject({ approvedId: 'nm1', tries: [{ mediaId: 'nm0' }] })
  })
})
