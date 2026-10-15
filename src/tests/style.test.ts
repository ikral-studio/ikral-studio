import { describe, expect, it } from 'vitest'
import { createProjectData, createScene } from '../features/scene-management/factory'
import { generationPrompt, masterScriptText } from '../features/script-sync/derive'
import { charactersInScene } from '../features/project-style/style'
import { shotRows } from '../features/camera/shotList'

describe('estilo, personajes y lista de tomas', () => {
  const p = createProjectData('Promo')
  p.style = { preset: 'anim2d', notes: 'colores cálidos' }
  p.characters = [
    { id: '1', name: 'Joven', description: 'camisa azul' },
    { id: '2', name: 'Abuelito', description: 'suéter café' },
    { id: '3', name: 'Mesero', description: 'mandil verde' },
  ]
  const s = createScene(p.id, 'El descubrimiento', 7)
  s.script.action = 'El joven le enseña el celular al abuelito.'
  it('el prompt lleva estilo y solo los personajes que salen', () => {
    const pr = generationPrompt(s, [], p)
    expect(pr).toMatch(/^Visual style: warm hand-drawn 2D animation style.*colores cálidos\./)
    expect(pr).toContain('Joven: camisa azul.')
    expect(pr).toContain('Abuelito: suéter café.')
    expect(pr).not.toContain('Mesero')
    expect(charactersInScene(p, s).map((c) => c.name)).toEqual(['Joven', 'Abuelito'])
  })
  it('el guion maestro muestra el estilo', () => {
    expect(masterScriptText(p, [s])).toContain('Estilo: Animación 2D cálida · colores cálidos')
  })
  it('lista de tomas con la cámara elegida', () => {
    s.script.camera = { shot: 'ms', move: 'orbit', speed: 'slow' }
    const [row] = shotRows([s])
    expect(row).toEqual(['01', 'El descubrimiento', '7 s', 'Plano medio', '—', 'Orbital 360° (lento)', '—', '—', 'No', 'Sin preparar'])
  })
})
