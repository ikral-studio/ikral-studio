// Guion vs Biblia (lugar). Prueba con un proyecto INVENTADO: la historia dice restaurante y, a la mitad, la Biblia
// cambió a food truck a propósito. Nada de un proyecto real.
import { beforeAll, describe, expect, it } from 'vitest'
import { useProject } from '../stores/projectStore'
import { loadProject } from '../database/idb'
import { conflictMessage, detectSettingConflict, settingImpact, applySetting, undoSetting, type Snapshot } from '../features/continuity/setting'
import { itemImagePrompt, mixesMoments } from '../features/bible/itemStates'
import { createProjectData, createScene } from '../features/scene-management/factory'
import type { Scene } from '../types'

const st = useProject.getState
const scenes = () => st().project!.sceneIds.map((id) => st().scenes[id])
const ROWS: [string, string, string][] = [
  ['Hora pico', 'Dentro del restaurante, Lupe lee las comandas de papel colgadas.', '—¿Quién pidió sin cebolla?'],
  ['Se pierde un pedido', 'En el comedor del restaurante un papelito cae al piso.', ''],
  ['Cliente molesto', 'Interior restaurante. Un mesero devuelve el plato.', '—Este restaurante ya no es lo que era.'],
  ['La demo', 'Beto le enseña la app en su celular.', ''],
  ['OTRO DÍA', 'Letrero: OTRO DÍA.', ''],
  ['Todo fluye', 'El restaurante con la tablet: los pedidos llegan solos.', ''],
]

async function fixture() {
  await st().init()
  await st().newProject('Taquería de prueba (inventada)')
  const first = st().project!.sceneIds[0]
  for (const [i, [title, action, dialogue]] of ROWS.entries()) {
    const id = i === 0 && first ? first : st().addScene()!
    st().updateScene(id, { title })
    st().updateScript(id, 'action', action)
    st().updateScript(id, 'dialogue', dialogue)
  }
  const [s1, , s3, , , s6] = st().project!.sceneIds
  st().updateScript(s3, 'generationPrompt', 'Inside a busy restaurant kitchen, a waiter returns a plate')
  st().updateScene(s3, { startImageId: 'media_aprobada_s3' })
  const loc = st().addItem('locations', 'Pase de cocina dentro del food truck')!
  st().updateItem('locations', loc, {
    description: 'Cocina angosta del food truck, plancha a la izquierda, ventanilla al frente.',
    imageId: 'media_canon',
    tries: [{ id: 't1', mediaId: 'media_canon', at: '2026-10-24T00:00:00Z' }],
    states: [
      { id: 'papel', label: 'Antes: papel', sceneIds: [s1, s3], shows: 'comandas de papel colgadas', hides: 'tablet', updatedAt: '' },
      { id: 'app', label: 'Después: app', sceneIds: [s6], shows: 'tablet con la app', hides: 'comandas de papel', updatedAt: '' },
    ],
  })
  return loc
}

describe('guion vs Biblia: restaurante → food truck', () => {
  let loc = ''
  beforeAll(async () => {
    loc = await fixture()
  })

  it('detecta la divergencia y la dice en una sola frase', () => {
    const c = detectSettingConflict(st().project, scenes())!
    expect(c).toMatchObject({ story: 'restaurante', bible: 'food-truck' })
    expect(c.sceneHits.map((h) => h.n)).toEqual([1, 2, 3, 6])
    expect(c.itemHits.map((h) => h.itemId)).toEqual([loc])
    expect(conflictMessage(c)).toBe('La historia dice RESTAURANTE, pero ahora la Biblia dice FOOD TRUCK. ¿Qué quieres conservar?')
    expect(conflictMessage(c).length).toBeLessThanOrEqual(200)
  })

  it('la vista previa no cambia nada', () => {
    const before = structuredClone({ p: st().project, s: st().scenes })
    for (const ch of ['adapt', 'keep', 'transform'] as const) expect(settingImpact(st().project!, scenes(), ch)).not.toBeNull()
    expect({ p: st().project, s: st().scenes }).toEqual(before)
  })

  it('«Adaptar historia»: vista previa con escenas, prompts y lo que queda para revisar', () => {
    const im = settingImpact(st().project!, scenes(), 'adapt')!
    expect(im.edits.map((e) => e.where)).toEqual(['Escena 01 · Acción', 'Escena 02 · Acción', 'Escena 03 · Acción', 'Escena 03 · Prompt de video', 'Escena 06 · Acción'])
    expect(im.edits[0].after).toBe('Dentro del food truck, Lupe lee las comandas de papel colgadas.')
    expect(im.edits[2].after).toBe('Interior food truck. Un mesero devuelve el plato.')
    expect(im.edits[3].after).toBe('Inside a busy food truck kitchen, a waiter returns a plate')
    expect(im.pending.join('\n')).toMatch(/Escena 03 · el diálogo dice «restaurante»/)
    expect(im.pending.join('\n')).toMatch(/Escena 02 · dice «comedor»/)
    expect(im.pending.join('\n')).toMatch(/Escena 03 · tiene imágenes o video aprobados de restaurante: revisar o regenerar \(no se tocan\)/)
  })

  it('«Adaptar historia»: aplica en un paso, guarda y se puede deshacer; diálogos e imágenes intactos', async () => {
    const [s1, , s3] = st().project!.sceneIds
    const dialogue = st().scenes[s3].script.dialogue
    const change = st().applySettingChoice('adapt')!
    expect(change.edits).toHaveLength(5)
    expect(st().scenes[s1].script.action).toMatch(/food truck/)
    expect(st().scenes[s3].script.dialogue).toBe(dialogue)
    expect(st().scenes[s3].startImageId).toBe('media_aprobada_s3')
    expect(st().project!.locations![0].imageId).toBe('media_canon')
    expect(st().project!.decisions!.find((d) => d.id === change.decisionId)).toMatchObject({ status: 'approved', approvedBy: 'director' })
    expect(detectSettingConflict(st().project, scenes())).toBeNull()

    await st().flushSave()
    const saved = (await loadProject(st().project!.id))!
    expect(saved.project.settingChange).toEqual(change)
    expect(saved.scenes.find((s) => s.id === s1)!.script.action).toMatch(/food truck/)

    expect(st().undoSettingChange()).toEqual([])
    expect(st().scenes[s1].script.action).toBe(ROWS[0][1])
    expect(st().project!.settingChange).toBeUndefined()
    expect(st().project!.decisions!.some((d) => d.id === change.decisionId)).toBe(false)
    expect(detectSettingConflict(st().project, scenes())).not.toBeNull()
  })

  it('Cmd+Z también deshace todo en un solo paso', () => {
    const [s1] = st().project!.sceneIds
    st().applySettingChoice('adapt')
    st().undo()
    expect(st().scenes[s1].script.action).toBe(ROWS[0][1])
    expect(st().project!.settingChange).toBeUndefined()
  })

  it('«Mantener restaurante»: corrige la ficha y sus estados; la imagen Canon y sus pruebas no se tocan', () => {
    const im = settingImpact(st().project!, scenes(), 'keep')!
    expect(im.edits.map((e) => e.where)).toEqual(['Locación «Pase de cocina dentro del food truck» · Nombre', 'Locación «Pase de cocina dentro del food truck» · Descripción'])
    expect(im.pending.join('\n')).toMatch(/imagen Canon .* revisar o regenerar \(no se toca\)/)
    expect(im.pending.join('\n')).toMatch(/«ventanilla»/)
    st().applySettingChoice('keep')
    const it = st().project!.locations!.find((x) => x.id === loc)!
    expect(it.name).toBe('Pase de cocina dentro del restaurante')
    expect(it.description).toBe('Cocina angosta del restaurante, plancha a la izquierda, ventanilla al frente.')
    expect(it.imageId).toBe('media_canon')
    expect(it.tries).toHaveLength(1)
    expect(it.states!.map((s) => s.shows)).toEqual(['comandas de papel colgadas', 'tablet con la app'])
  })

  it('al deshacer no borra lo que el director escribió después a mano', () => {
    st().updateItem('locations', loc, { description: 'La escribí yo.' })
    expect(st().undoSettingChange()).toEqual(['Locación «Pase de cocina dentro del food truck» · Descripción'])
    const it = st().project!.locations!.find((x) => x.id === loc)!
    expect(it.name).toBe('Pase de cocina dentro del food truck')
    expect(it.description).toBe('La escribí yo.')
    expect(st().project!.settingChange).toBeUndefined()
  })

  it('«Definir transformación»: no cambia textos, guarda la decisión y dice qué falta', () => {
    const before = structuredClone(st().scenes)
    const change = st().applySettingChoice('transform')!
    expect(change.edits).toEqual([])
    expect(change.pending.join('\n')).toMatch(/Falta la escena donde el restaurante se vuelve food truck/)
    expect(st().scenes).toEqual(before)
    expect(st().project!.decisions!.find((d) => d.id === change.decisionId)!.text).toMatch(/se transforma en FOOD TRUCK/)
    st().undoSettingChange()
  })

  it('el prompt de cada escena muestra un solo estado (nunca papel y app juntos)', () => {
    const [s1, , , , , s6] = st().project!.sceneIds
    const it = st().project!.locations!.find((x) => x.id === loc)!
    for (const sceneId of [s1, s6]) {
      const r = itemImagePrompt(st().project, 'locations', it, { mode: 'scene', sceneId }, scenes())
      expect(r.blocked).toBeUndefined()
      expect(mixesMoments(r.prompt)).toBeUndefined()
    }
    const p1 = itemImagePrompt(st().project, 'locations', it, { mode: 'scene', sceneId: s1 }, scenes()).prompt
    expect(p1).toMatch(/In this scene you see \(Spanish\): comandas de papel/)
    expect(p1).toMatch(/Must NOT appear .*tablet con la app/)
  })
})

describe('guion vs Biblia: funciones puras', () => {
  const build = () => {
    const project = createProjectData('Inventado')
    const a = createScene(project.id, 'Uno', 5, { order: 0 })
    a.script.action = 'RESTAURANTE lleno.'
    a.shots = [{ id: 'sh1', order: 0, name: 'Detalle', duration: 2, action: 'Las mesas del restaurante.', updatedAt: '' }] as Scene['shots']
    project.sceneIds = [a.id]
    project.bible = { place: 'Un food truck en Los Ángeles' }
    const s: Snapshot = { project, scenes: { [a.id]: a } }
    return { s, a }
  }

  it('respeta mayúsculas, cambia también los planos y el lugar principal', () => {
    const { s, a } = build()
    const c = detectSettingConflict(s.project, [a])!
    expect(c.place).toBe(true)
    const adapt = settingImpact(s.project, [a], 'adapt')!
    expect(adapt.edits.map((e) => e.after)).toEqual(['FOOD TRUCK lleno.', 'Las mesas del food truck.'])
    const keep = settingImpact(s.project, [a], 'keep')!
    expect(keep.edits.map((e) => [e.where, e.after])).toEqual([['Biblia · Lugar principal', 'Un restaurante en Los Ángeles']])
    const next = applySetting(s, adapt, 'dec_x')
    expect(next.scenes[a.id].shots![0].action).toBe('Las mesas del food truck.')
    expect(undoSetting(next)!.next.scenes[a.id].shots![0].action).toBe('Las mesas del restaurante.')
  })

  it('sin divergencia no pregunta nada', () => {
    const project = createProjectData('Inventado')
    const a = createScene(project.id, 'Uno', 5, { order: 0 })
    a.script.action = 'El restaurante abre.'
    project.locations = [{ id: 'l', name: 'Cocina del restaurante', description: '' }]
    expect(detectSettingConflict(project, [a])).toBeNull()
  })
})
