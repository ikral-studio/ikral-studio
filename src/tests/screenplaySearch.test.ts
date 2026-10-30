import { StrictMode, createElement } from 'react'
import { act, fireEvent, render } from '@testing-library/react'
import { beforeAll, describe, expect, it } from 'vitest'
import { useProject } from '../stores/projectStore'
import { Screenplay } from '../components/screenplay/Screenplay'

describe('búsqueda en el guion', () => {
  beforeAll(async () => {
    Element.prototype.scrollIntoView = () => {}
    await useProject.getState().init()
    await useProject.getState().newProject('Búsqueda')
    const st = useProject.getState
    const a = st().addScene()!
    const b = st().addScene()!
    st().updateScene(a, { title: 'Casa casa' })
    st().updateScript(a, 'action', 'Entra a la casa.')
    st().updateScript(a, 'dialogue', 'Sin coincidencias.')
    st().updateScript(b, 'action', 'Otra CASA, y otra casa más.')
  })

  it('numera las coincidencias igual en cada render (StrictMode y re-render)', () => {
    const view = render(createElement(StrictMode, null, createElement(Screenplay)))
    fireEvent.click(view.getByLabelText('Buscar en el guion'))
    fireEvent.change(view.getByLabelText('Texto a buscar en el guion'), { target: { value: 'casa' } })
    const hits = () => [...view.container.querySelectorAll('mark[data-hit]')].map((m) => Number(m.getAttribute('data-hit')))
    expect(hits()).toEqual([0, 1, 2, 3, 4])
    expect(view.getByText('1 de 5')).toBeTruthy()

    // Renders repetidos (otro cambio de estado) no deben mover la numeración.
    act(() => useProject.getState().updateScript(useProject.getState().project!.sceneIds[0], 'dialogue', 'Nada aquí.'))
    expect(hits()).toEqual([0, 1, 2, 3, 4])

    // La coincidencia resaltada sigue a la navegación.
    fireEvent.click(view.getByLabelText('Coincidencia siguiente'))
    fireEvent.click(view.getByLabelText('Coincidencia siguiente'))
    const current = view.container.querySelector('mark.ring-2')
    expect(current?.getAttribute('data-hit')).toBe('2')
    expect(view.getByText('3 de 5')).toBeTruthy()
    view.unmount()
  })
})
