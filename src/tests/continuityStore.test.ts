import { beforeAll, describe, expect, it } from 'vitest'
import { useProject } from '../stores/projectStore'
import { loadProject } from '../database/idb'
import { mergeProjects } from '../database/merge'
import { createProjectData, createScene } from '../features/scene-management/factory'
import type { Decision } from '../types'

const st = useProject.getState

describe('etapas en el store', () => {
  beforeAll(async () => {
    await st().init()
    await st().newProject('Etapas')
  })

  it('agregar, renombrar y ordenar etapas', () => {
    const a = st().addPhase('ANTES', 'comandas de papel')!
    const d = st().addPhase('DESPUÉS')!
    const t = st().addPhase('TRANSICIÓN')!
    expect(st().addPhase('   ')).toBeUndefined()
    st().movePhase(t, 1)
    expect(st().project!.phases!.map((p) => p.id)).toEqual([a, t, d])
    st().renamePhase(d, 'DESPUÉS (con la app)')
    expect(st().project!.phases![2]).toMatchObject({ name: 'DESPUÉS (con la app)' })
    expect(st().project!.phases![0].note).toBe('comandas de papel')
    st().movePhase(a, 99)
    expect(st().project!.phases!.map((p) => p.id)).toEqual([t, d, a])
    st().undo()
    expect(st().project!.phases!.map((p) => p.id)).toEqual([a, t, d])
  })

  it('poner etapa a una escena actualiza su updatedAt; una etapa que no existe no se acepta', async () => {
    const id = st().addScene()!
    const before = st().scenes[id].updatedAt
    await new Promise((r) => setTimeout(r, 5))
    const [a] = st().project!.phases!
    st().setScenePhase(id, a.id)
    expect(st().scenes[id].phaseId).toBe(a.id)
    expect(st().scenes[id].updatedAt > before).toBe(true)
    st().setScenePhase(id, 'no-existe')
    expect(st().scenes[id].phaseId).toBe(a.id)
    st().setScenePhase(id, undefined)
    expect('phaseId' in st().scenes[id]).toBe(false)
    st().undo()
    expect(st().scenes[id].phaseId).toBe(a.id)
  })

  it('quitar una etapa limpia escenas y Biblia; Deshacer devuelve todo', () => {
    const [a, t, d] = st().project!.phases!.map((p) => p.id)
    const sid = st().project!.sceneIds[0]
    st().setScenePhase(sid, d)
    const obj = st().addItem('props', 'Tablet de pedidos')!
    st().updateItem('props', obj, { onlyIn: [t, d], aliases: ['tablet'] })
    st().removePhase(d)
    expect(st().project!.phases!.map((p) => p.id)).toEqual([a, t])
    expect(st().scenes[sid].phaseId).toBeUndefined()
    expect(st().project!.props!.find((p) => p.id === obj)!.onlyIn).toEqual([t])
    st().undo()
    expect(st().project!.phases!.map((p) => p.id)).toEqual([a, t, d])
    expect(st().scenes[sid].phaseId).toBe(d)
    expect(st().project!.props!.find((p) => p.id === obj)!.onlyIn).toEqual([t, d])
  })
})

describe('decisiones en el store', () => {
  it('el director propone y queda aprobada; Claude y GPT solo proponen', () => {
    const mine = st().addDecision('La plancha siempre a la izquierda.')!
    const gpt = st().addDecision('La escena 3 es un flashback.', { proposedBy: 'gpt', approve: true, allowsBackstep: true })!
    const ds = st().project!.decisions!
    expect(ds.find((x) => x.id === mine)).toMatchObject({ proposedBy: 'director', status: 'approved', approvedBy: 'director' })
    expect(ds.find((x) => x.id === gpt)).toMatchObject({ proposedBy: 'gpt', status: 'proposed', allowsBackstep: true })
    expect(ds.find((x) => x.id === gpt)!.approvedBy).toBeUndefined()
  })

  it('aprobar, rechazar, editar y quitar se pueden deshacer', () => {
    const find = (id: string) => st().project!.decisions!.find((x) => x.id === id)
    const id = st().addDecision('Beto usa mandil rojo.', { proposedBy: 'claude' })!
    st().approveDecision(id)
    expect(find(id)).toMatchObject({ status: 'approved', approvedBy: 'director', proposedBy: 'claude' })
    st().undo()
    expect(find(id)!.status).toBe('proposed')
    st().rejectDecision(id)
    expect(find(id)).toMatchObject({ status: 'rejected' })
    expect(find(id)!.approvedBy).toBeUndefined()
    st().updateDecision(id, { text: 'Beto usa mandil azul.' })
    expect(find(id)!.text).toBe('Beto usa mandil azul.')
    st().undo()
    expect(find(id)!.text).toBe('Beto usa mandil rojo.')
    st().removeDecision(id)
    expect(find(id)).toBeUndefined()
    st().undo()
    expect(find(id)).toBeDefined()
  })

  it('guardar y volver a cargar conserva etapas, decisiones, etapa de escena, onlyIn y alias', async () => {
    await st().flushSave()
    const saved = await loadProject(st().project!.id)
    const p = saved!.project
    expect(p.phases).toEqual(st().project!.phases)
    expect(p.decisions).toEqual(st().project!.decisions)
    const obj = p.props!.find((x) => x.name === 'Tablet de pedidos')!
    expect(obj.onlyIn).toHaveLength(2)
    expect(obj.aliases).toEqual(['tablet'])
    const sid = st().project!.sceneIds[0]
    expect(saved!.scenes.find((s) => s.id === sid)!.phaseId).toBe(st().scenes[sid].phaseId)
  })

  it('al cargar se limpian etapas que ya no existen', async () => {
    const sid = st().project!.sceneIds[0]
    st().updateScene(sid, { phaseId: 'borrada' })
    await st().flushSave()
    await st().reloadCurrent()
    expect(st().scenes[sid].phaseId).toBeUndefined()
  })
})

describe('unir etapas y decisiones de la app y de Claude', () => {
  const at = (n: number) => `2026-10-23T10:00:${String(n).padStart(2, '0')}.000Z`
  const dec = (id: string, text: string, n: number): Decision => ({
    id,
    text,
    proposedBy: 'director',
    proposedAt: at(1),
    status: 'approved',
    approvedBy: 'director',
    updatedAt: at(n),
  })
  const p = createProjectData('P')
  const s = { ...createScene(p.id, 'A', 5), updatedAt: at(1) }
  const base = {
    project: { ...p, sceneIds: [s.id], updatedAt: at(1), phases: [{ id: 'antes', name: 'ANTES' }], decisions: [dec('d1', 'Plancha a la izquierda', 1), dec('d2', 'Sin música', 1)] },
    scenes: [s],
  }

  it('Claude agrega una decisión mientras David edita otra cosa: se quedan las dos', () => {
    const disk = { ...base, project: { ...base.project, updatedAt: at(5), decisions: [...base.project.decisions, dec('d3', 'Escena 3 es flashback', 5)] } }
    const local = { ...base, project: { ...base.project, title: 'Nuevo título', updatedAt: at(6), phases: [...base.project.phases, { id: 'despues', name: 'DESPUÉS' }] } }
    const m = mergeProjects(base, disk, local)
    expect(m.project.title).toBe('Nuevo título')
    expect(m.project.decisions!.map((d) => d.id)).toEqual(['d1', 'd2', 'd3'])
    expect(m.project.phases!.map((ph) => ph.id)).toEqual(['antes', 'despues'])
  })

  it('los dos editan la misma decisión: gana la más reciente; lo borrado se queda borrado', () => {
    const disk = { ...base, project: { ...base.project, updatedAt: at(7), decisions: [dec('d1', 'Plancha a la derecha', 7), base.project.decisions[1]] } }
    const local = { ...base, project: { ...base.project, updatedAt: at(8), decisions: [dec('d1', 'Plancha al centro', 4)] } }
    const m = mergeProjects(base, disk, local)
    expect(m.project.decisions!.map((d) => [d.id, d.text])).toEqual([['d1', 'Plancha a la derecha']])
  })

  it('proyecto viejo sin etapas ni decisiones: no aparecen campos nuevos', () => {
    const old = { project: { ...p, sceneIds: [s.id], updatedAt: at(1) }, scenes: [s] }
    const m = mergeProjects(old, { ...old, project: { ...old.project, updatedAt: at(2) } }, old)
    expect('phases' in m.project).toBe(false)
    expect('decisions' in m.project).toBe(false)
  })
})
