import { beforeAll, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { buildAIPrompt, EXAMPLE, parseScriptText } from '../features/script-exchange/schema'
import { useProject } from '../stores/projectStore'
import { generationPrompt, masterScriptText, orderedScenes } from '../features/script-sync/derive'
import { loadProject } from '../database/db'

const sample = readFileSync('tests-e2e/fixtures/guion-ia.json', 'utf8')

describe('formato para IA', () => {
  it('el prompt trae reglas y un ejemplo que pasa la validación', () => {
    const p = buildAIPrompt({ title: 'X', aspectRatio: '16:9', customFields: ['Vestuario'] })
    expect(p).toContain('ÚNICAMENTE CON JSON')
    expect(p).toContain('"Vestuario"')
    const ex = p.slice(p.indexOf('Ejemplo válido:'))
    const json = ex.slice(ex.indexOf('{'), ex.lastIndexOf('}') + 1)
    expect(parseScriptText(json).ok).toBe(true)
    expect(parseScriptText(JSON.stringify(EXAMPLE)).ok).toBe(true)
  })
  it('acepta el JSON aunque venga dentro de ```json', () => {
    expect(parseScriptText('Aquí está:\n```json\n' + sample + '\n```').ok).toBe(true)
  })
  it('errores claros por escena y campo; rechaza campos de archivos', () => {
    const bad = JSON.parse(sample)
    bad.scenes[1].script.dialogue = 42
    bad.scenes[0].startImage = '/Users/x/foto.png'
    bad.version = 2
    const r = parseScriptText(JSON.stringify(bad))
    expect(r.ok).toBe(false)
    const errs = (r as { errors: string[] }).errors.join('\n')
    expect(errs).toMatch(/Escena 2 · campo «Diálogos»/)
    expect(errs).toMatch(/Escena 1: no se permite: «startImage»/)
    expect(errs).toMatch(/version/)
    expect(parseScriptText('hola').ok).toBe(false)
    expect(parseScriptText('{"format": ').ok).toBe(false)
  })
})

describe('importar guion', () => {
  beforeAll(async () => {
    await useProject.getState().init()
  })
  it('crea un proyecto nuevo con todos los campos, pronunciación, números y campos extra', async () => {
    const r = parseScriptText(sample)
    if (!r.ok) throw new Error(r.errors.join())
    await useProject.getState().importScript(r.data, 'new')
    const { project, scenes } = useProject.getState()
    expect(project!.title).toBe('Promo importada')
    expect(project!.aspectRatio).toBe('9:16')
    expect(project!.customFields!.map((f) => f.name)).toEqual(['Vestuario', 'Emoción'])
    const list = orderedScenes(project, scenes)
    expect(list.map((s) => s.title)).toEqual(['Todo va bien', 'El descubrimiento'])
    expect(list[1].script.cameraDirection).toBe('Joven a la izquierda, abuelito a la derecha.')
    expect(list[1].script.pronunciations[0].id).toBeTruthy()
    const prompt = generationPrompt(list[1], project!.customFields)
    expect(prompt).toContain('Tu Ap Dijital')
    expect(prompt).toContain('veinticinco pedidos')
    expect(prompt).toContain('Vestuario: Camisa azul')
    const master = masterScriptText(project!, list)
    expect(master).toContain('TuApp.digital')
    expect(master).toContain('25 pedidos')
    expect(master).toContain('Emoción: Sorpresa')
    const saved = await loadProject(project!.id)
    expect(saved!.scenes).toHaveLength(2)
  })
  it('agregar al actual no toca videos ni música y se deshace en un paso', async () => {
    const st = useProject.getState
    const id = st().addScene()!
    st().addVideoVersion(id, { mediaId: 'vid', duration: 4 })
    const track = st().project!.audioTracks![0]
    st().addAudioClip(track.id, { mediaId: 'mus', name: 'm', start: 0, duration: 3 })
    const before = st().project!.sceneIds.length
    const r = parseScriptText(sample)
    if (!r.ok) throw new Error()
    await st().importScript(r.data, 'append')
    expect(st().project!.sceneIds.length).toBe(before + 2)
    expect(st().scenes[id].videoVersions[0].mediaId).toBe('vid')
    expect(st().project!.audioTracks![0].clips).toHaveLength(1)
    expect(st().project!.customFields).toHaveLength(2) // reusa los campos con el mismo nombre
    st().undo()
    expect(st().project!.sceneIds.length).toBe(before)
  })
})

import { parseSceneText } from '../features/script-exchange/schema'
describe('pegar una escena', () => {
  const one = JSON.parse(sample)
  one.scenes = [one.scenes[1]]
  it('acepta el formato con una escena o solo el objeto de la escena', () => {
    const a = parseSceneText(JSON.stringify(one))
    expect(a.ok && a.scene.title).toBe('El descubrimiento')
    const b = parseSceneText('```json\n' + JSON.stringify(one.scenes[0]) + '\n```')
    expect(b.ok && b.scene.script.dialogue).toContain('¡Mire!')
    const c = parseSceneText(JSON.stringify({ title: 'Sin duración', script: { action: 'x' } }))
    expect(c.ok && c.hasDuration).toBe(false)
  })
  it('rechaza varias escenas y errores de campo', () => {
    const r = parseSceneText(sample)
    expect(r.ok).toBe(false)
    expect((r as { errors: string[] }).errors[0]).toMatch(/trae 2 escenas/)
    const bad = parseSceneText(JSON.stringify({ title: 'x', script: { dialogue: 3 } }))
    expect((bad as { errors: string[] }).errors.join()).toMatch(/Diálogos/)
  })
  it('llena solo los textos y deja el video', async () => {
    const st = useProject.getState
    const id = st().addScene()!
    st().addVideoVersion(id, { mediaId: 'vid2', duration: 5 })
    const r = parseSceneText(JSON.stringify(one))
    if (!r.ok) throw new Error()
    st().applySceneFromAI(id, r.scene, { customFields: r.customFields, keepDuration: false })
    const s = st().scenes[id]
    expect(s.title).toBe('El descubrimiento')
    expect(s.plannedDuration).toBe(7)
    expect(s.script.cameraDirection).toContain('Joven a la izquierda')
    expect(s.videoVersions[0].mediaId).toBe('vid2')
    st().undo()
    expect(st().scenes[id].title).not.toBe('El descubrimiento')
  })
})
