import { beforeAll, describe, expect, it } from 'vitest'
import type { Scene, Shot } from '../types'
import { createProjectData, createScene, cloneScene } from '../features/scene-management/factory'
import { applyShotText, convertToCoverage, flattenToV1, implicitShotId, mergeShots, moveShot, sceneDuration, sceneMediaIds, shotsOf, v1LossReport } from '../features/coverage/shots'
import { buildScriptFile, defaultScriptVersion, exportScriptJson } from '../features/script-exchange/export'
import { parseSceneText, parseScriptText } from '../features/script-exchange/schema'
import { mergeProjects } from '../database/merge'
import { mediaIdsOf } from '../database/idb'
import { addToTrash, restoreFromTrash, trashMediaIds } from '../features/trash/trash'
import { useProject } from '../stores/projectStore'

const at = (n: number) => `2026-10-24T10:00:${String(n).padStart(2, '0')}.000Z`
const project = createProjectData('Doña Chuy')

/** Escena «vieja» con todo lo de hoy: cámara, prep, imágenes, fotogramas y un video con clips. */
function oldScene(): Scene {
  return createScene(project.id, 'Doña Chuy cocina', 10, {
    startImageId: 'img-start',
    endImageId: 'img-end',
    prep: { start: { approvedId: 'img-start', tries: [{ id: 't1', mediaId: 'try-1', at: at(1) }] } },
    storyboardFrames: [{ id: 'fr1', mediaId: 'frame-1', order: 0 }],
    videoVersions: [{ id: 'vv1', mediaId: 'vid-1', previewMediaId: 'prev-1', duration: 4, clips: [{ id: 'c1', mediaId: 'clip-1', duration: 2 }], createdAt: at(1) }],
    activeVideoVersionId: 'vv1',
    script: {
      action: 'Doña Chuy voltea la carne y contesta.',
      dialogue: 'Doña Chuy: ¡Ya casi!\nCliente: Gracias.',
      cameraDirection: 'Abre general y cierra en su rostro.',
      soundDirection: 'Parrilla chisporroteando.',
      generationPrompt: 'Realista, luz cálida.',
      pronunciations: [],
      camera: { shot: 'ms', angle: 'eye' },
    },
    updatedAt: at(1),
  })
}

const shot = (id: string, order: number, patch: Partial<Shot> = {}): Shot => ({ id, order, name: `Plano ${order + 1}`, duration: 2, updatedAt: at(1), ...patch })

/** Los 4 planos del ejemplo del plan. */
function chuyShots(): Shot[] {
  return [
    shot('sh_a', 0, { name: 'Plano general del restaurante', duration: 3, camera: { shot: 'ws' }, startImageId: 'a-start' }),
    shot('sh_b', 1, { name: 'Detalle de sus manos', duration: 2, action: 'Manos volteando la carne', continuity: 'La carne ya está volteada' }),
    shot('sh_c', 2, { name: 'Inserto de la carne', duration: 2, sound: 'Chisporroteo', videoVersions: [{ id: 'vv_c', mediaId: 'c-vid', duration: 2, createdAt: at(1) }], activeVideoVersionId: 'vv_c' }),
    shot('sh_d', 3, { name: 'Primer plano de su rostro', duration: 3, dialogueLines: [0], references: [{ id: 'fr_d', mediaId: 'd-ref', order: 0 }] }),
  ]
}

describe('shotsOf: escena sin planos = un plano implícito', () => {
  it('una escena vieja da 1 plano con los mismos datos, sin cambiar la escena', () => {
    const s = oldScene()
    const copy = structuredClone(s)
    const [p, ...rest] = shotsOf(s)
    expect(rest).toHaveLength(0)
    expect(p.id).toBe(implicitShotId(s))
    expect(shotsOf(s)[0].id).toBe(p.id) // estable
    expect(p).toMatchObject({ name: s.title, duration: 10, action: s.script.action, sound: s.script.soundDirection, camera: s.script.camera, startImageId: 'img-start', endImageId: 'img-end', activeVideoVersionId: 'vv1' })
    expect(p.references).toBe(s.storyboardFrames)
    expect(p.videoVersions).toBe(s.videoVersions)
    expect(s).toEqual(copy)
    expect(s.shots).toBeUndefined()
    expect(sceneDuration(s)).toBe(10)
  })
  it('con planos: en orden y la duración es la suma', () => {
    const shots = chuyShots().reverse()
    const s = { ...oldScene(), shots }
    expect(shotsOf(s).map((x) => x.id)).toEqual(['sh_a', 'sh_b', 'sh_c', 'sh_d'])
    expect(sceneDuration(s)).toBe(10)
  })
  it('reordenar cambia solo el orden; los ids no cambian', () => {
    const moved = moveShot(chuyShots(), 'sh_c', -1, at(9))
    expect(moved.map((x) => x.id)).toEqual(['sh_a', 'sh_c', 'sh_b', 'sh_d'])
    expect(moved.map((x) => x.order)).toEqual([0, 1, 2, 3])
    expect(moved[1].updatedAt).toBe(at(9))
    expect(moved[0].updatedAt).toBe(at(1))
    expect(moveShot(chuyShots(), 'sh_a', -1)).toHaveLength(4)
  })
})

describe('pasar a cobertura (función pura)', () => {
  it('copia todo al Plano 1 y la escena conserva lo suyo; no se pierde ningún archivo', () => {
    const s = oldScene()
    const before = new Set(sceneMediaIds(s))
    const c = convertToCoverage(s, at(5))
    expect(c.shots).toHaveLength(1)
    const p1 = c.shots![0]
    expect(p1.id).not.toBe(implicitShotId(s))
    expect(p1.startImageId).toBe('img-start')
    expect(p1.references![0].mediaId).toBe('frame-1')
    expect(p1.videoVersions![0].mediaId).toBe('vid-1')
    expect(p1.videoVersions![0].clips![0].mediaId).toBe('clip-1')
    expect(p1.activeVideoVersionId).toBe(p1.videoVersions![0].id)
    expect(c.startImageId).toBe('img-start')
    expect(c.videoVersions).toBe(s.videoVersions)
    for (const id of before) expect(sceneMediaIds(c)).toContain(id)
    expect(convertToCoverage(c)).toBe(c) // ya tiene planos: no cambia
  })
})

describe('archivos de los planos', () => {
  it('limpieza, respaldo y papelera cuentan los archivos de los planos', () => {
    const s = { ...oldScene(), shots: chuyShots() }
    const used = mediaIdsOf(project, [s])
    for (const id of ['a-start', 'c-vid', 'd-ref', 'img-start', 'clip-1']) expect(used).toContain(id)
    const p = { ...project, trash: addToTrash(project, { kind: 'shot', sceneId: s.id, shot: chuyShots()[2], index: 2 }) }
    expect(trashMediaIds(p)).toContain('c-vid')
  })
  it('duplicar una escena copia los planos con ids nuevos y los mismos archivos', () => {
    const s = { ...oldScene(), shots: chuyShots() }
    const d = cloneScene(s)
    expect(d.shots!.map((x) => x.name)).toEqual(s.shots.map((x) => x.name))
    expect(d.shots!.some((x) => s.shots.some((y) => y.id === x.id))).toBe(false)
    expect(d.shots![2].videoVersions![0].mediaId).toBe('c-vid')
    expect(d.shots![2].activeVideoVersionId).toBe(d.shots![2].videoVersions![0].id)
  })
  it('papelera: quitar y recuperar un plano en su lugar', () => {
    const s = { ...oldScene(), shots: chuyShots() }
    const [b] = s.shots.splice(1, 1)
    const p = { ...project, trash: addToTrash(project, { kind: 'shot', sceneId: s.id, shot: b, index: 1 }) }
    const r = restoreFromTrash(p, { [s.id]: s }, p.trash![0].id)
    if ('error' in r) throw new Error(r.error)
    expect(shotsOf(r.scenes[s.id]).map((x) => x.id)).toEqual(['sh_a', 'sh_b', 'sh_c', 'sh_d'])
    expect(r.project.trash).toHaveLength(0)
  })
})

describe('JSON v1 y v2', () => {
  const withShots = () => ({ ...oldScene(), shots: chuyShots() })
  it('sin planos se exporta v1, y v1 entra igual que siempre', () => {
    const s = oldScene()
    expect(defaultScriptVersion([s])).toBe(1)
    const { json, warnings } = exportScriptJson({ ...project, sceneIds: [s.id] }, [s])
    expect(warnings).toEqual([])
    const r = parseScriptText(json)
    if (!r.ok) throw new Error(r.errors.join())
    expect(r.data.version).toBe(1)
    expect(r.data.scenes[0].script.action).toBe(s.script.action)
    expect(r.data.scenes[0].shots).toBeUndefined()
  })
  it('v2 ida y vuelta: exportar → importar = mismo contenido, sin archivos ni ids', () => {
    const s = withShots()
    const file = buildScriptFile(project, [s])
    expect(file.version).toBe(2)
    const json = JSON.stringify(file)
    expect(json).not.toMatch(/c-vid|a-start|d-ref|sh_a|vv_c/)
    const r = parseScriptText(json)
    if (!r.ok) throw new Error(r.errors.join())
    expect(r.data).toEqual(file)
    expect(r.data.scenes[0].shots!.map((x) => x.name)).toEqual(chuyShots().map((x) => x.name))
    expect(r.data.scenes[0].shots![1].continuity).toBe('La carne ya está volteada')
    expect(r.data.scenes[0].shots![3].dialogueLines).toEqual([0])
    expect(buildScriptFile(project, [s], 2)).toEqual(r.data)
  })
  it('v1 con planos rechaza «shots»; versión desconocida da error claro', () => {
    const file = buildScriptFile(project, [withShots()], 2)
    const r = parseScriptText(JSON.stringify({ ...file, version: 1 }))
    expect(r.ok).toBe(false)
    expect((r as { errors: string[] }).errors.join()).toMatch(/Escena 1 · campo «Planos»: los planos.*version.*2/)
    const bad = parseScriptText(JSON.stringify({ ...file, version: 3 }))
    expect((bad as { errors: string[] }).errors.join()).toMatch(/debe ser 1 o 2/)
    const badShot = structuredClone(file)
    badShot.scenes[0].shots![1].duration = 0
    expect((parseScriptText(JSON.stringify(badShot)) as { errors: string[] }).errors.join()).toMatch(/Escena 1 · Plano 2 · campo «Duración del plano»/)
  })
  it('exportar como v1 avisa lo que se pierde y no pierde texto', () => {
    const s = withShots()
    const { json, warnings } = exportScriptJson(project, [s], 1)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toMatch(/Escena 1 «Doña Chuy cocina»: 4 planos se unen en uno/)
    expect(warnings[0]).toMatch(/la cámara/)
    expect(warnings[0]).toMatch(/las notas de continuidad/)
    expect(warnings[0]).toMatch(/imágenes y videos/)
    const r = parseScriptText(json)
    if (!r.ok) throw new Error(r.errors.join())
    const sc = r.data.scenes[0]
    expect(sc.shots).toBeUndefined()
    expect(sc.plannedDuration).toBe(10)
    expect(sc.script.action).toContain(s.script.action)
    expect(sc.script.action).toContain('Manos volteando la carne')
    expect(sc.script.action).toContain('La carne ya está volteada')
    expect(sc.script.soundDirection).toContain('Chisporroteo')
    expect(sc.script.dialogue).toBe(s.script.dialogue)
    expect(flattenToV1(oldScene()).action).toBe(oldScene().script.action)
    expect(v1LossReport([oldScene()])).toEqual([])
  })
  it('pegar una escena v2 acepta los planos', () => {
    const file = buildScriptFile(project, [withShots()], 2)
    const r = parseSceneText(JSON.stringify(file.scenes[0]))
    expect(r.ok && r.scene.shots).toHaveLength(4)
  })
})

describe('unir cambios plano por plano (Claude y la app)', () => {
  const base = chuyShots()
  it('Claude cambia el plano 2 y la app el 4: se quedan los dos', () => {
    const disk = base.map((s) => (s.id === 'sh_b' ? { ...s, action: 'Claude', updatedAt: at(5) } : s))
    const local = base.map((s) => (s.id === 'sh_d' ? { ...s, action: 'App', updatedAt: at(6) } : s))
    const m = mergeShots(base, disk, local, true)
    expect(m.shots!.find((s) => s.id === 'sh_b')!.action).toBe('Claude')
    expect(m.shots!.find((s) => s.id === 'sh_d')!.action).toBe('App')
    expect(m.conflicts).toEqual([])
  })
  it('los dos cambian el mismo plano: gana el más reciente y el otro va a la papelera', () => {
    const disk = base.map((s) => (s.id === 'sh_b' ? { ...s, action: 'Claude', updatedAt: at(7) } : s))
    const local = base.map((s) => (s.id === 'sh_b' ? { ...s, action: 'App', updatedAt: at(6) } : s))
    const m = mergeShots(base, disk, local, true)
    expect(m.shots!.find((s) => s.id === 'sh_b')!.action).toBe('Claude')
    expect(m.conflicts.map((s) => s.action)).toEqual(['App'])
  })
  it('planos nuevos de cada lado se respetan; uno borrado se queda borrado', () => {
    const disk = [...base, shot('sh_claude', 4, { updatedAt: at(5) })]
    const local = [...base.filter((s) => s.id !== 'sh_a'), shot('sh_app', 4, { updatedAt: at(6) })]
    const ids = mergeShots(base, disk, local, true).shots!.map((s) => s.id)
    expect(ids).not.toContain('sh_a')
    expect(ids).toContain('sh_claude')
    expect(ids).toContain('sh_app')
  })
  it('mergeProjects: une los planos dentro de la escena y guarda el perdedor en la papelera', () => {
    const s = { ...oldScene(), shots: base }
    const p = { ...project, sceneIds: [s.id], updatedAt: at(1) }
    const b = { project: p, scenes: [s] }
    const disk = { project: { ...p, updatedAt: at(5) }, scenes: [{ ...s, updatedAt: at(5), shots: base.map((x) => (x.id === 'sh_b' ? { ...x, action: 'Claude b', updatedAt: at(5) } : x.id === 'sh_c' ? { ...x, sound: 'Claude c', updatedAt: at(5) } : x)) }] }
    const local = { project: { ...p, updatedAt: at(6) }, scenes: [{ ...s, title: 'Título app', updatedAt: at(6), shots: base.map((x) => (x.id === 'sh_d' ? { ...x, action: 'App d', updatedAt: at(6) } : x.id === 'sh_c' ? { ...x, sound: 'App c', updatedAt: at(6) } : x)) }] }
    const m = mergeProjects(b, disk, local)
    const sc = m.scenes[0]
    expect(sc.title).toBe('Título app')
    const by = (id: string) => sc.shots!.find((x) => x.id === id)!
    expect(by('sh_b').action).toBe('Claude b')
    expect(by('sh_d').action).toBe('App d')
    expect(by('sh_c').sound).toBe('App c')
    const lost = m.project.trash!.filter((e) => e.kind === 'shot')
    expect(lost).toHaveLength(1)
    expect(lost[0].kind === 'shot' && lost[0].shot.sound).toBe('Claude c')
  })
  it('proyectos sin planos se unen igual que antes (sin «shots» ni papelera nueva)', () => {
    const s = oldScene()
    const p = { ...project, sceneIds: [s.id], updatedAt: at(1) }
    const m = mergeProjects({ project: p, scenes: [s] }, { project: p, scenes: [s] }, { project: { ...p, updatedAt: at(2) }, scenes: [{ ...s, title: 'x', updatedAt: at(2) }] })
    expect(m.scenes[0].shots).toBeUndefined()
    expect(m.scenes[0]).not.toHaveProperty('shots')
    expect(m.project.trash).toBeUndefined()
  })
})

describe('importar v2 con el store', () => {
  beforeAll(async () => {
    await useProject.getState().init()
  })
  it('crea las escenas con sus planos (ids nuevos) y una escena v1 queda sin planos', async () => {
    const file = buildScriptFile(project, [{ ...oldScene(), shots: chuyShots() }, oldScene()], 2)
    await useProject.getState().importScript(file, 'new')
    const { project: p, scenes } = useProject.getState()
    const [a, b] = p!.sceneIds.map((id) => scenes[id])
    expect(shotsOf(a).map((s) => s.name)).toEqual(chuyShots().map((s) => s.name))
    expect(a.shots!.every((s) => s.id.startsWith('sh_') && !['sh_a', 'sh_b', 'sh_c', 'sh_d'].includes(s.id))).toBe(true)
    expect(sceneDuration(a)).toBe(10)
    expect(b.shots).toBeUndefined()
  })
  it('pegar escena v2 sobre una escena con planos conserva imágenes y videos de cada plano', () => {
    const st = useProject.getState
    const id = st().addScene()!
    useProject.setState((x) => ({ scenes: { ...x.scenes, [id]: { ...x.scenes[id], shots: chuyShots() } } }))
    const texts = [{ name: 'Nuevo 1', duration: 4 }, { name: 'Nuevo 2', duration: 1, action: 'nuevo' }, { name: 'N3', duration: 2 }, { name: 'N4', duration: 2 }, { name: 'Extra', duration: 1 }]
    st().applySceneFromAI(id, { title: 'T', plannedDuration: 8, script: { action: '', dialogue: '', cameraDirection: '', soundDirection: '', generationPrompt: '', pronunciations: [], numbersToWords: false, extras: {} }, shots: texts }, { customFields: [], keepDuration: true })
    const shots = shotsOf(st().scenes[id])
    expect(shots.map((s) => s.name)).toEqual(['Nuevo 1', 'Nuevo 2', 'N3', 'N4', 'Extra'])
    expect(shots[0].startImageId).toBe('a-start')
    expect(shots[0].id).toBe('sh_a')
    expect(shots[2].videoVersions![0].mediaId).toBe('c-vid')
    expect(shots[1].continuity).toBeUndefined()
    expect(applyShotText(undefined, [{ name: 'Solo', duration: 2 }])).toHaveLength(1)
  })
})
