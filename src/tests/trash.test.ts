import { beforeAll, describe, expect, it } from 'vitest'
import { useProject } from '../stores/projectStore'
import { loadProject, mediaIdsOf } from '../database/idb'

describe('papelera', () => {
  beforeAll(async () => {
    await useProject.getState().init()
    await useProject.getState().newProject('Papelera')
  })
  const st = useProject.getState

  it('una escena borrada va a la papelera y regresa a su lugar', () => {
    const a = st().addScene()!
    const b = st().addScene()!
    st().updateScene(a, { title: 'Primera', startImageId: 'md_x' })
    st().deleteScene(a)
    expect(st().project!.sceneIds).toEqual([b])
    expect(st().project!.trash).toHaveLength(1)
    // la imagen de la escena borrada no se limpia
    expect(mediaIdsOf(st().project!, Object.values(st().scenes))).toContain('md_x')
    expect(st().restoreTrash(st().project!.trash![0].id)).toBeNull()
    expect(st().project!.sceneIds).toEqual([a, b])
    expect(st().scenes[a].title).toBe('Primera')
    expect(st().project!.trash).toHaveLength(0)
  })

  it('un personaje regresa con sus relaciones', () => {
    const c1 = st().addItem('characters', 'Doña Chuy')!
    const c2 = st().addItem('characters', 'Don Pepe')!
    st().addRelation(c1, c2, 'Matrimonio')
    st().removeItem('characters', c1)
    expect(st().project!.relations).toHaveLength(0)
    const entry = st().project!.trash!.at(-1)!
    expect(st().restoreTrash(entry.id)).toBeNull()
    expect(st().project!.characters!.map((c) => c.name)).toContain('Doña Chuy')
    expect(st().project!.relations).toHaveLength(1)
  })

  it('una relación sin sus personajes no se puede recuperar', () => {
    const rel = st().project!.relations![0]
    st().removeRelation(rel.id)
    st().removeItem('characters', rel.a)
    const relEntry = st().project!.trash!.find((e) => e.kind === 'relation')!
    expect(st().restoreTrash(relEntry.id)).toMatch(/ya no existe/)
  })

  it('«Deshacer» regresa la locación completa a su lugar y queda guardada', async () => {
    const sala = st().addItem('locations', 'Sala')!
    const cocina = st().addItem('locations', 'Cocina', { description: 'Cocina de talavera', note: 'Interior', imageId: 'md_canon', prompt: 'cocina cálida', tries: [{ id: 't1', mediaId: 'md_try', at: '2026-10-24T00:00:00Z' }], onlyIn: ['ph_1'], aliases: ['la cocina'] })!
    const patio = st().addItem('locations', 'Patio')!
    st().setMainLocation(cocina)
    const before = st().project!.locations!.find((l) => l.id === cocina)!
    const trashId = st().removeItem('locations', cocina)!
    expect(st().project!.locations!.map((l) => l.id)).toEqual([sala, patio])
    // la imagen Canon y las pruebas no se limpian mientras está en la papelera
    expect(mediaIdsOf(st().project!, Object.values(st().scenes))).toEqual(expect.arrayContaining(['md_canon', 'md_try']))
    st().addItem('locations', 'Azotea')
    expect(st().restoreTrash(trashId)).toBeNull()
    expect(st().project!.locations!.map((l) => l.name)).toEqual(['Sala', 'Cocina', 'Patio', 'Azotea'])
    expect(st().project!.locations!.find((l) => l.id === cocina)).toEqual(before)
    expect(st().project!.mainLocationId).toBe(cocina)
    await st().flushSave()
    const saved = await loadProject(st().project!.id)
    expect(saved!.project.locations!.find((l) => l.id === cocina)).toEqual(before)
  })

  it('vaciar la papelera', () => {
    st().purgeTrash()
    expect(st().project!.trash).toEqual([])
  })
})
