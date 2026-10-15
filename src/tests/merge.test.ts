import { describe, expect, it } from 'vitest'
import { mergeProjects } from '../database/merge'
import { createProjectData, createScene } from '../features/scene-management/factory'

const at = (n: number) => `2026-10-15T10:00:${String(n).padStart(2, '0')}.000Z`

describe('unir cambios de la app y de Claude', () => {
  const p = createProjectData('P')
  const a = { ...createScene(p.id, 'A', 5), updatedAt: at(1) }
  const b = { ...createScene(p.id, 'B', 5), updatedAt: at(1) }
  const base = { project: { ...p, sceneIds: [a.id, b.id], updatedAt: at(1) }, scenes: [a, b] }

  it('Claude pone una imagen en B mientras David cambia el título de A: se quedan los dos cambios', () => {
    const disk = { project: { ...base.project, updatedAt: at(5) }, scenes: [a, { ...b, startImageId: 'img', updatedAt: at(5) }] }
    const local = { project: { ...base.project, updatedAt: at(6) }, scenes: [{ ...a, title: 'A editada', updatedAt: at(6) }, b] }
    const m = mergeProjects(base, disk, local)
    expect(m.scenes.find((s) => s.id === a.id)!.title).toBe('A editada')
    expect(m.scenes.find((s) => s.id === b.id)!.startImageId).toBe('img')
  })
  it('Claude agrega una escena y David borra otra', () => {
    const c = { ...createScene(p.id, 'C', 5), updatedAt: at(5) }
    const disk = { project: { ...base.project, sceneIds: [a.id, c.id, b.id] }, scenes: [a, c, b] }
    const local = { project: { ...base.project, sceneIds: [b.id] }, scenes: [b] }
    const m = mergeProjects(base, disk, local)
    expect(m.project.sceneIds).toEqual([c.id, b.id])
  })
  it('sin base guarda lo local', () => {
    expect(mergeProjects(null, base, base)).toBe(base)
  })
})
