import { describe, expect, it } from 'vitest'
import type { BibleItem, ItemState } from '../types'
import { buildExample } from '../features/continuity/examples'
import { cleanContinuity } from '../features/continuity/continuity'
import { hiddenIn, itemImagePrompt, mixesMoments, resolveState, sceneStatesPrompt, sceneTargets } from '../features/bible/itemStates'
import { framePrompt } from '../features/bible/frames'

const T = '2026-10-24T00:00:00.000Z'
const PAPER: ItemState = { id: 'st-papel', label: 'Antes: papel', phaseIds: ['antes'], shows: 'comandas de papel colgadas sobre la plancha', hides: 'tablet o celular con pedidos', updatedAt: T }
const APP: ItemState = { id: 'st-app', label: 'Después: app', phaseIds: ['despues'], shows: 'tablet con la app de pedidos y botón LISTO', hides: 'comandas de papel', updatedAt: T }

/** La misma cocina en 2 escenas: la 3 con papel (ANTES) y la 8 con la app (DESPUÉS). */
function kitchen(states: ItemState[] = [PAPER, APP]) {
  const { project, scenes } = buildExample([
    ['Escena 3', 'antes', 'Beto lee las comandas en el pase de cocina.'],
    ['Escena 8', 'despues', 'Beto mira la tablet en el pase de cocina.'],
  ])
  const loc: BibleItem = {
    id: 'loc-pase',
    name: 'Pase de cocina',
    description: 'Cocina angosta dentro del food truck: plancha a la izquierda, ventanilla al frente, acero inoxidable, luz cálida.',
    imageId: 'canon-pase',
    tries: [{ id: 'try-base', mediaId: 'canon-pase', prompt: 'base', at: T }],
    states,
  }
  project.locations = [loc]
  return { project, scenes, loc }
}

describe('estados de una ficha por escena', () => {
  it('cada escena toma su estado por etapa; la escena manda sobre la etapa', () => {
    const { scenes, loc } = kitchen()
    expect(resolveState(loc, scenes[0])).toEqual({ kind: 'state', state: PAPER })
    expect(resolveState(loc, scenes[1])).toEqual({ kind: 'state', state: APP })
    const flashback = { ...PAPER, id: 'st-fb', label: 'Recuerdo', phaseIds: undefined, sceneIds: [scenes[1].id] }
    expect(resolveState({ states: [PAPER, APP, flashback] }, scenes[1])).toEqual({ kind: 'state', state: flashback })
  })

  it('no adivina: sin estado o con dos posibles, bloquea y lo dice', () => {
    const { project, scenes, loc } = kitchen([PAPER, { ...APP, phaseIds: ['antes'] }])
    expect(resolveState(loc, scenes[0]).kind).toBe('ambiguous')
    expect(resolveState(loc, scenes[1]).kind).toBe('missing')
    const a = itemImagePrompt(project, 'locations', loc, { mode: 'scene', sceneId: scenes[0].id }, scenes)
    expect(a.blocked).toMatch(/no lo adivino/)
    expect(a.prompt).toBe('')
    const b = itemImagePrompt(project, 'locations', loc, { mode: 'scene', sceneId: scenes[1].id }, scenes)
    expect(b.blocked).toMatch(/Escena 02 no tiene un estado/)
  })

  it('escena con papel no pide tablet; escena con app no pide papel', () => {
    const { project, scenes, loc } = kitchen()
    const s3 = itemImagePrompt(project, 'locations', loc, { mode: 'scene', sceneId: scenes[0].id }, scenes)
    const s8 = itemImagePrompt(project, 'locations', loc, { mode: 'scene', sceneId: scenes[1].id }, scenes)
    expect(s3.blocked).toBeUndefined()
    expect(s8.blocked).toBeUndefined()
    const seen = (p: string) => p.split('Must NOT appear')[0]
    const notSeen = (p: string) => p.split('Must NOT appear')[1] ?? ''
    expect(seen(s3.prompt)).toContain('comandas de papel')
    expect(seen(s3.prompt)).not.toMatch(/tablet/i)
    expect(notSeen(s3.prompt)).toMatch(/tablet/)
    expect(seen(s8.prompt)).toContain('tablet con la app')
    expect(seen(s8.prompt)).not.toMatch(/papel/)
    expect(notSeen(s8.prompt)).toMatch(/comandas de papel/)
    for (const p of [s3.prompt, s8.prompt]) {
      expect(p).toContain('same layout, materials, lighting and camera position')
      expect(p).toContain('plancha a la izquierda')
      expect(p).toContain('ONE single moment')
    }
  })

  it('la referencia base es el lugar vacío: sin cosas de ninguna etapa', () => {
    const { project, loc } = kitchen()
    const base = itemImagePrompt(project, 'locations', loc, { mode: 'base' })
    expect(base.blocked).toBeUndefined()
    expect(base.prompt).toContain('base reference')
    expect(base.prompt.split('Do NOT show')[0]).not.toMatch(/comandas|tablet/)
    expect(base.prompt.split('Do NOT show')[1]).toMatch(/comandas.*tablet/)
  })

  it('bloquea «primero papel, luego tablet» en una sola imagen', () => {
    expect(mixesMoments('comandas de papel (al inicio) y luego tablet/celular con LISTO')).toBeTruthy()
    expect(mixesMoments('Primero papel, después la tablet')).toBeTruthy()
    expect(mixesMoments('At first paper tickets, then a tablet')).toBeTruthy()
    expect(mixesMoments('Cocina angosta, plancha a la izquierda.')).toBeUndefined()
    const { project, scenes, loc } = kitchen()
    const mixed = { ...loc, description: 'Pase con comandas de papel (al inicio) y luego tablet/celular con LISTO.' }
    expect(itemImagePrompt(project, 'locations', mixed, { mode: 'base' }).blocked).toMatch(/dos momentos/)
    expect(itemImagePrompt(project, 'locations', mixed, { mode: 'scene', sceneId: scenes[0].id }, scenes).blocked).toMatch(/dos momentos/)
  })

  it('lo que no se ve junta lo del estado y lo de los otros estados', () => {
    expect(hiddenIn({ states: [PAPER, APP] }, PAPER)).toEqual(['tablet o celular con pedidos', 'tablet con la app de pedidos y botón LISTO'])
  })

  it('«¿Para qué escena?» lista las escenas que usan la ficha con su estado', () => {
    const { project, scenes, loc } = kitchen()
    const t = sceneTargets(project, loc, scenes)
    expect(t.map((x) => x.label)).toEqual(['Escena 01 (ANTES) · Antes: papel', 'Escena 02 (DESPUÉS) · Después: app'])
  })

  it('el inicio/final de cada escena lleva el estado de la locación; sin estados no cambia nada', () => {
    const { project, scenes, loc } = kitchen()
    expect(sceneStatesPrompt(project, scenes[0])).toContain('comandas de papel colgadas')
    expect(sceneStatesPrompt(project, scenes[0])).toMatch(/Not visible: .*tablet/)
    expect(framePrompt(project, scenes[1], 'start', 2)).toContain('tablet con la app de pedidos')
    const plain = { ...project, locations: [{ ...loc, states: undefined }] }
    expect(sceneStatesPrompt(plain, scenes[0])).toBe('')
    expect(framePrompt(plain, scenes[0], 'start', 1)).not.toContain('single moment')
  })

  it('borrar una etapa la quita de los estados, sin tocar la imagen Canon', () => {
    const { project, scenes } = kitchen()
    const clean = cleanContinuity({ ...project, phases: project.phases!.filter((p) => p.id !== 'antes') }, scenes)
    const loc = clean.project.locations![0]
    expect(loc.states!.map((s) => s.phaseIds)).toEqual([[], ['despues']])
    expect(loc.imageId).toBe('canon-pase')
  })
})
