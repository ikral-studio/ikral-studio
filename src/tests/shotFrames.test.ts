// Fase 2d: imagen inicial y final de cada plano (pedido `shot-preview`), ligadas al id del plano.
import { beforeAll, describe, expect, it } from 'vitest'
import { useProject } from '../stores/projectStore'
import { listSnapshots } from '../database/db'
import { createProjectData, createScene } from '../features/scene-management/factory'
import { framesProgress, framesToApply, shotFramePrompt } from '../features/bible/frames'
import { mergeShots, sceneMediaIds, shotsOf } from '../features/coverage/shots'
import type { Shot } from '../types'

const st = useProject.getState
const at = (n: number) => `2026-10-24T10:00:${String(n).padStart(2, '0')}.000Z`
const shot = (id: string) => st().scenes[sceneOf(id)].shots!.find((x) => x.id === id)!
let sceneOf: (shotId: string) => string = () => ''

describe('prompt y «Pasar a Edición» por plano', () => {
  const p = createProjectData('Tacos')
  p.characters = [
    { id: 'c1', name: 'Doña Chuy', description: 'señora de 60 años, mandil amarillo' },
    { id: 'c2', name: 'Beto', description: 'niño de 8 años, gorra roja' },
  ]
  p.bible = { look: 'cartoon' }
  const s = createScene(p.id, 'Todo va bien', 8)
  s.script.action = 'Doña Chuy sirve tacos y sonríe.'
  const sh: Shot = { id: 'sh_a', order: 0, name: 'Detalle de manos', duration: 2, action: 'Las manos de Beto toman el taco.', continuity: 'la carne ya está volteada', cameraDirection: 'Primer plano', updatedAt: at(1) }

  it('el prompt lee el plano, su escena, los personajes (de la escena y del plano) y el estilo', () => {
    const start = shotFramePrompt(p, s, sh, 'start', 3, 2, 4)
    expect(start).toMatch(/^Opening frame .*shot 2 of 4 "Detalle de manos" of scene 3 "Todo va bien"/)
    expect(start).toContain('Las manos de Beto toman el taco.')
    expect(start).toContain('Scene context (Spanish): Doña Chuy sirve tacos')
    expect(start).toContain('la carne ya está volteada')
    expect(start).toContain('Primer plano')
    expect(start).toContain('Doña Chuy: señora de 60 años')
    expect(start).toContain('Beto: niño de 8 años')
    expect(start).toContain('2D cartoon illustration')
    expect(shotFramePrompt(p, s, sh, 'end', 3, 2)).toMatch(/^Closing frame .*shot 2 "Detalle de manos"/)
  })

  it('pasa a Edición las aprobadas de los planos sin tocar el avance de escenas', () => {
    const a = { ...s, id: 'a', shots: [{ ...sh, prep: { start: { approvedId: 'm1' }, end: { approvedId: 'm2' } }, endImageId: 'viejo' }, { ...sh, id: 'sh_b', order: 1, prep: { start: { approvedId: 'm3' } }, startImageId: 'm3' }] }
    expect(framesToApply([a])).toEqual([
      { sceneId: 'a', shotId: 'sh_a', slot: 'start', mediaId: 'm1', replaces: false },
      { sceneId: 'a', shotId: 'sh_a', slot: 'end', mediaId: 'm2', replaces: true },
    ])
    expect(framesProgress([a])).toEqual({ approved: 0, total: 2 })
    // Una escena sin cobertura no ve planos.
    expect(framesToApply([{ ...s, id: 'b' }])).toEqual([])
  })
})

describe('imágenes por plano en el store', () => {
  let id = ''
  let p1 = ''
  let p2 = ''
  beforeAll(async () => {
    await st().init()
    await st().newProject('Planos con imágenes')
    id = st().addScene()!
    await st().convertToCoverage(id)
    p1 = st().scenes[id].shots![0].id
    p2 = st().addShot(id)!
    sceneOf = () => id
  })

  it('guarda prompt, pruebas y aprobada en el plano, con su updatedAt', () => {
    const before = shot(p1).updatedAt
    st().updateShotFramePlan(id, p1, 'start', { tries: [{ id: 't1', mediaId: 'try-1', at: at(1) }], approvedId: 'try-1' })
    st().updateShotFramePlan(id, p1, 'start', { prompt: 'Mi prompt' })
    expect(shot(p1).prep?.start).toMatchObject({ prompt: 'Mi prompt', approvedId: 'try-1', tries: [{ mediaId: 'try-1' }] })
    expect(shot(p1).updatedAt >= before).toBe(true)
    expect(shot(p2).prep).toBeUndefined()
    // Un plano que no existe no hace nada (ni crea planos).
    st().updateShotFramePlan(id, 'sh_no', 'start', { approvedId: 'x' })
    expect(st().scenes[id].shots).toHaveLength(2)
    // Los archivos del plano cuentan para la limpieza.
    expect(sceneMediaIds(st().scenes[id])).toContain('try-1')
  })

  it('«Pasar a Edición» pone la imagen en el plano y no en la escena', () => {
    const sceneStart = st().scenes[id].startImageId
    st().setShotImage(id, p1, 'start', 'try-1')
    expect(shot(p1).startImageId).toBe('try-1')
    expect(st().scenes[id].startImageId).toBe(sceneStart)
    expect(framesToApply([st().scenes[id]])).toEqual([])
  })

  it('reordenar, duplicar, quitar y recuperar conservan las pruebas del plano', () => {
    st().moveShot(id, p1, 1)
    expect(shotsOf(st().scenes[id]).map((x) => x.id)).toEqual([p2, p1])
    expect(shot(p1).prep?.start?.tries).toHaveLength(1)
    const copy = st().duplicateShot(id, p1)!
    expect(shot(copy).prep?.start).toMatchObject({ approvedId: 'try-1', tries: [{ mediaId: 'try-1' }] })
    st().updateShotFramePlan(id, copy, 'start', { prompt: 'Solo la copia' })
    expect(shot(p1).prep?.start?.prompt).toBe('Mi prompt')
    st().removeShot(id, p1)
    const entry = st().project!.trash!.at(-1)!
    expect(st().restoreTrash(entry.id)).toBeNull()
    expect(shot(p1).prep?.start).toMatchObject({ prompt: 'Mi prompt', approvedId: 'try-1' })
  })

  it('un respaldo restaurado trae las pruebas del plano', async () => {
    await st().backupNow('auto')
    st().updateShotFramePlan(id, p2, 'end', { tries: [{ id: 't9', mediaId: 'try-9', at: at(9) }] })
    await st().flushSave()
    const [snap] = await listSnapshots(st().project!.id)
    await st().restoreSnapshot(snap.id)
    expect(shot(p1).prep?.start?.approvedId).toBe('try-1')
    expect(shot(p2).prep?.end).toBeUndefined()
  })

  it('si Claude agrega una prueba mientras la app cambia otro plano, se unen las dos', () => {
    const base = st().scenes[id].shots!
    const fromClaude = base.map((x) => (x.id === p2 ? { ...x, prep: { end: { tries: [{ id: 'tc', mediaId: 'claude-1', at: at(20) }], approvedId: 'claude-1' } }, updatedAt: '2099-01-01T00:00:00.000Z' } : x))
    const fromApp = base.map((x) => (x.id === p1 ? { ...x, name: 'Cambiado en la app', updatedAt: '2099-01-01T00:00:00.000Z' } : x))
    const { shots: merged = [], conflicts } = mergeShots(base, fromClaude, fromApp, true)
    expect(conflicts).toEqual([])
    expect(merged.find((x) => x.id === p2)?.prep?.end?.approvedId).toBe('claude-1')
    expect(merged.find((x) => x.id === p1)?.name).toBe('Cambiado en la app')
  })
})
