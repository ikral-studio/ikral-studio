// Fase 2b: «Pasar a cobertura» y los planos en el store (agregar, ordenar, duplicar, quitar y recuperar).
import { beforeAll, describe, expect, it } from 'vitest'
import { useProject } from '../stores/projectStore'
import { listSnapshots } from '../database/db'
import { createProjectData, createScene } from '../features/scene-management/factory'
import { mergeShots, sceneDuration, sceneMediaIds, shotMediaIds, shotsOf, v1LossReport, v2DurationWarnings } from '../features/coverage/shots'
import { exportScriptJson } from '../features/script-exchange/export'
import { auditContinuity } from '../features/continuity/continuity'
import { restoreFromTrash } from '../features/trash/trash'
import type { Scene, Shot } from '../types'

const st = useProject.getState
const at = (n: number) => `2026-10-24T10:00:${String(n).padStart(2, '0')}.000Z`

/** Pone en la escena los datos de una escena «vieja» (imágenes, fotogramas y video). */
function fillOld(id: string) {
  useProject.setState((x) => ({
    scenes: {
      ...x.scenes,
      [id]: {
        ...x.scenes[id],
        startImageId: 'img-start',
        endImageId: 'img-end',
        prep: { start: { approvedId: 'img-start', tries: [{ id: 't1', mediaId: 'try-1', at: at(1) }] } },
        storyboardFrames: [{ id: 'fr1', mediaId: 'frame-1', order: 0 }],
        videoVersions: [{ id: 'vv1', mediaId: 'vid-1', duration: 4, createdAt: at(1) }],
        activeVideoVersionId: 'vv1',
        script: { ...x.scenes[id].script, cameraDirection: 'General', action: 'Doña Chuy cocina' },
      },
    },
  }))
}

describe('Pasar a cobertura en el store', () => {
  beforeAll(async () => {
    await st().init()
    await st().newProject('Cobertura')
  })

  it('hace un respaldo antes, no pierde archivos y Deshacer deja la escena idéntica', async () => {
    const id = st().addScene()!
    fillOld(id)
    const before = structuredClone(st().scenes[id])
    const snaps = (await listSnapshots(st().project!.id)).length
    expect(await st().convertToCoverage(id)).toBe(true)
    const after = (await listSnapshots(st().project!.id)).filter((s) => s.reason === 'before-coverage')
    expect((await listSnapshots(st().project!.id)).length).toBe(snaps + 1)
    expect(after).toHaveLength(1)
    const sc = st().scenes[id]
    expect(sc.shots).toHaveLength(1)
    // Ningún archivo se pierde: la escena conserva los suyos y el Plano 1 los copia.
    for (const m of sceneMediaIds(before)) expect(sceneMediaIds(sc)).toContain(m)
    expect(shotMediaIds(sc.shots![0]).sort()).toEqual(sceneMediaIds(before).sort())
    expect(sc.shots![0].references![0].mediaId).toBe('frame-1')
    // Una segunda vez no hace nada.
    expect(await st().convertToCoverage(id)).toBe(false)
    st().undo()
    expect(st().scenes[id]).toEqual(before)
  })

  it('agregar, ordenar, cambiar, duplicar y quitar planos (ids estables)', async () => {
    const id = st().addScene()!
    await st().convertToCoverage(id)
    const p1 = st().scenes[id].shots![0].id
    const p2 = st().addShot(id)!
    const p3 = st().addShot(id)!
    expect(shotsOf(st().scenes[id]).map((s) => s.id)).toEqual([p1, p2, p3])
    st().moveShot(id, p3, -1)
    expect(shotsOf(st().scenes[id]).map((s) => s.id)).toEqual([p1, p3, p2])
    st().updateShot(id, p3, { name: 'Detalle de manos', duration: 2, continuity: 'la carne ya está volteada' })
    expect(shotsOf(st().scenes[id])[1]).toMatchObject({ id: p3, name: 'Detalle de manos', duration: 2, continuity: 'la carne ya está volteada' })
    expect(sceneDuration(st().scenes[id])).toBe(st().scenes[id].plannedDuration + 2 + 3)
    // Duplicar copia los archivos con un id nuevo, justo después.
    useProject.setState((x) => ({ scenes: { ...x.scenes, [id]: { ...x.scenes[id], shots: x.scenes[id].shots!.map((s) => (s.id === p3 ? { ...s, startImageId: 'p3-img', videoVersions: [{ id: 'v3', mediaId: 'p3-vid', duration: 2, createdAt: at(1) }], activeVideoVersionId: 'v3' } : s)) } } }))
    const copy = st().duplicateShot(id, p3)!
    const list = shotsOf(st().scenes[id])
    expect(list.map((s) => s.id)).toEqual([p1, p3, copy, p2])
    expect(list[2]).toMatchObject({ name: 'Detalle de manos (copia)', startImageId: 'p3-img' })
    expect(list[2].videoVersions![0].id).not.toBe('v3')
    expect(list[2].activeVideoVersionId).toBe(list[2].videoVersions![0].id)
    // Quitar manda a la papelera y se recupera en su lugar.
    st().removeShot(id, p3)
    expect(shotsOf(st().scenes[id]).map((s) => s.id)).toEqual([p1, copy, p2])
    const entry = st().project!.trash!.at(-1)!
    expect(entry).toMatchObject({ kind: 'shot', sceneId: id, index: 1 })
    expect(st().restoreTrash(entry.id)).toBeNull()
    expect(shotsOf(st().scenes[id]).map((s) => s.id)).toEqual([p1, p3, copy, p2])
    expect(shotsOf(st().scenes[id]).map((s) => s.order)).toEqual([0, 1, 2, 3])
  })

  it('quitar el último plano deja la escena como un solo plano con sus datos', async () => {
    const id = st().addScene()!
    fillOld(id)
    await st().convertToCoverage(id)
    st().removeShot(id, st().scenes[id].shots![0].id)
    const sc = st().scenes[id]
    expect(sc.shots).toEqual([])
    expect(shotsOf(sc)).toHaveLength(1)
    expect(shotsOf(sc)[0]).toMatchObject({ startImageId: 'img-start', activeVideoVersionId: 'vv1' })
  })
})

describe('decisiones de la revisión de 2a', () => {
  const project = createProjectData('Largo')
  const long = (): Scene => ({
    ...createScene(project.id, 'Larga', 8),
    shots: [
      { id: 'a', order: 0, name: 'A', duration: 400, updatedAt: at(1) },
      { id: 'b', order: 1, name: 'B', duration: 300, updatedAt: at(1) },
    ],
  })

  it('v1 con más de 600 s avisa claro y ofrece v2; el proyecto no cambia', () => {
    const s = long()
    const { json, warnings } = exportScriptJson(project, [s], 1)
    expect(JSON.parse(json).scenes[0].plannedDuration).toBe(600)
    expect(warnings.some((w) => w.includes('700 s') && w.includes('v2'))).toBe(true)
    expect(sceneDuration(s)).toBe(700)
    expect(v1LossReport([createScene(project.id, 'Corta', 8)])).toEqual([])
  })

  it('v2 avisa si un plano pasa de 600 s', () => {
    const s = { ...long(), shots: [{ id: 'a', order: 0, name: 'A', duration: 700, updatedAt: at(1) }] }
    expect(v2DurationWarnings([s])).toHaveLength(1)
    expect(exportScriptJson(project, [s], 2).warnings).toHaveLength(1)
    expect(v2DurationWarnings([long()])).toEqual([])
  })

  it('borrado de un lado y cambiado del otro: queda borrado, pero el cambio va a la papelera', () => {
    const base: Shot[] = [{ id: 'x', order: 0, name: 'X', duration: 2, updatedAt: at(1) }]
    const disk: Shot[] = []
    const local: Shot[] = [{ ...base[0], action: 'cambio', updatedAt: at(5) }]
    const m = mergeShots(base, disk, local, true)
    expect(m.shots).toEqual([])
    expect(m.conflicts.map((s) => s.action)).toEqual(['cambio'])
    // Si nadie lo cambió, el borrado no deja nada en la papelera.
    expect(mergeShots(base, [], base, true).conflicts).toEqual([])
  })

  it('la otra versión de un choque se recupera junto a la que ganó', () => {
    const sc: Scene = { ...createScene(project.id, 'S', 8), shots: [{ id: 'x', order: 0, name: 'X', duration: 2, action: 'gana', updatedAt: at(5) }] }
    const p = { ...project, sceneIds: [sc.id], trash: [{ id: 't', deletedAt: at(5), kind: 'shot' as const, sceneId: sc.id, index: 0, conflict: true, shot: { ...sc.shots![0], action: 'pierde' } }] }
    const r = restoreFromTrash(p, { [sc.id]: sc }, 't')
    if ('error' in r) throw new Error(r.error)
    const list = r.scenes[sc.id].shots!
    expect(list.map((s) => s.action)).toEqual(['gana', 'pierde'])
    expect(list[1].id).not.toBe('x')
    expect(list[1].name).toBe('X (otra versión)')
  })
})

describe('auditor de continuidad en los planos', () => {
  it('avisa si un elemento aparece en el texto de un plano fuera de su etapa', () => {
    const base = createProjectData('Etapas')
    const project = {
      ...base,
      phases: [
        { id: 'antes', name: 'ANTES', order: 0 },
        { id: 'despues', name: 'DESPUÉS', order: 1 },
      ],
      props: [{ id: 'com', name: 'comandas', onlyIn: ['antes'] }],
    }
    const s: Scene = {
      ...createScene(project.id, 'Con app', 8),
      phaseId: 'despues',
      shots: [
        { id: 'p1', order: 0, name: 'General', duration: 3, updatedAt: at(1) },
        { id: 'p2', order: 1, name: 'Detalle', duration: 2, continuity: 'Las comandas en la barra', updatedAt: at(1) },
      ],
    }
    const f = auditContinuity({ ...project, sceneIds: [s.id] } as never, [s])
    expect(f).toHaveLength(1)
    expect(f[0]).toMatchObject({ rule: 1, shotId: 'p2', field: 'continuity', quote: 'comandas' })
    expect(f[0].problem).toContain('plano «Detalle»')
  })
})
