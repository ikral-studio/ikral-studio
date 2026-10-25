import { describe, expect, it } from 'vitest'
import { buildExample } from '../features/continuity/examples'
import { missingRefs } from '../features/chat/missingRefs'

describe('aviso de referencias que faltan antes de generar', () => {
  it('avisa de objetos sin imagen y de pantallas sin ficha con imagen', () => {
    const { project, scenes } = buildExample([['Escena 18', 'despues', 'Jorge escanea el QR de la mesa y pide en su celular.']])
    project.props = [{ id: 'p1', name: 'letrero de la mesa', aliases: ['qr'], description: '' }]
    const out = missingRefs(project, scenes)
    expect(out.some((m) => m.includes('«letrero de la mesa»: sin imagen'))).toBe(true)
    expect(out.some((m) => m.includes('pantalla del celular'))).toBe(true)
    expect(out.some((m) => m.includes('código QR'))).toBe(true)
  })

  it('no avisa cuando ya hay imágenes', () => {
    const { project, scenes } = buildExample([['Escena 18', 'despues', 'Jorge escanea el QR y pide en su celular.']])
    project.props = [
      { id: 'p1', name: 'letrero con QR de la mesa', description: '', imageId: 'm1' },
      { id: 'p2', name: 'pantalla celular', description: '', imageId: 'm2' },
    ]
    expect(missingRefs(project, scenes)).toEqual([])
  })
})
