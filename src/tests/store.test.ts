import { beforeAll, describe, expect, it } from 'vitest'
import { useProject } from '../stores/projectStore'
import { loadProject } from '../database/db'

describe('store del proyecto', () => {
  beforeAll(async () => {
    await useProject.getState().init()
    await useProject.getState().newProject('Test')
  })
  it('agregar, reordenar, duplicar, eliminar y deshacer', async () => {
    const st = useProject.getState
    const a = st().addScene()!
    const b = st().addScene()!
    const c = st().addScene()!
    st().moveScene(c, 0)
    expect(st().project!.sceneIds).toEqual([c, a, b])
    st().duplicateScene(a)
    expect(st().project!.sceneIds).toHaveLength(4)
    st().deleteScene(b)
    expect(st().project!.sceneIds).not.toContain(b)
    st().undo()
    expect(st().project!.sceneIds).toContain(b)
    await st().flushSave()
    const saved = await loadProject(st().project!.id)
    expect(saved!.project.sceneIds).toEqual(st().project!.sceneIds)
    expect(st().saveState).toBe('saved')
  })
  it('el texto se agrupa en un solo paso de deshacer', () => {
    const st = useProject.getState
    const id = st().project!.sceneIds[0]
    const before = st().past.length
    st().updateScript(id, 'action', 'H')
    st().updateScript(id, 'action', 'Ho')
    st().updateScript(id, 'action', 'Hola')
    expect(st().past.length).toBe(before + 1)
    st().undo()
    expect(st().scenes[id].script.action).toBe('')
  })
})
