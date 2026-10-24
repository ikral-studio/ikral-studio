import { describe, expect, it } from 'vitest'
import type { BibleItem, Decision, ItemKind, Project, Scene } from '../types'
import { buildExample } from '../features/continuity/examples'
import { buildContinuityPacket } from '../features/gpt/context'
import { acceptProposal, answerQuestion, parseContinuityResponse, toReview, undoAnswer, undoProposal, type ContinuityResponse, type DecisionOps, type GptReview, type ItemOps } from '../features/gpt/proposals'
import { applyCorrection, outcomeText, planCorrection, regenTargets } from '../features/gpt/corrections'
import { itemImagePrompt } from '../features/bible/itemStates'

const T = '2026-10-24T00:00:00.000Z'
const MIXED_DESC = 'Pase de cocina dentro del food truck: plancha, ventanilla, comandas de papel (al inicio) y luego tablet/celular con LISTO.'

/** 2 escenas (3 = ANTES, 8 = DESPUÉS) y 1 locación de cocina que mezcla papel y app, con imagen Canon. */
function fixture() {
  const { project, scenes } = buildExample([
    ['Escena 3', 'antes', 'Beto lee las comandas en el pase de cocina.'],
    ['Escena 8', 'despues', 'Beto mira la tablet en el pase de cocina.'],
  ])
  const loc: BibleItem = { id: 'loc-pase', name: 'Pase de cocina dentro del food truck', aliases: ['Pase de cocina'], description: MIXED_DESC, imageId: 'canon-pase' }
  project.locations = [loc]
  const map: Record<string, Scene> = Object.fromEntries(scenes.map((s) => [s.id, s]))
  return { project, scenes, map }
}

const change = (escena: number, etiqueta: string, se_ve: string, no_se_ve: string) => ({ tipo: 'estado-ficha' as const, ficha: 'Pase de cocina', escena, etiqueta, se_ve, no_se_ve, texto: null })

const answer: ContinuityResponse = {
  resumen: 'La ficha del pase mezcla papel y app.',
  hallazgos: [
    {
      escena: null,
      plano: null,
      imagen: null,
      gravedad: 'alta',
      problema: 'La ficha «Pase de cocina» mezcla comandas de papel y la tablet en una sola imagen.',
      evidencia: 'Dice «comandas de papel (al inicio) y luego tablet/celular con LISTO».',
      correccion: 'Separar en un estado por escena.',
      regla: 'En el pase de cocina va el papel o la app, nunca los dos.',
      cambios: [
        change(1, 'Antes: papel', 'comandas de papel colgadas sobre la plancha', 'tablet o celular'),
        change(2, 'Después: app', 'tablet con la app y botón LISTO', 'comandas de papel'),
        { tipo: 'descripcion-ficha' as const, ficha: 'Pase de cocina', escena: null, etiqueta: null, se_ve: null, no_se_ve: null, texto: 'Pase de cocina dentro del food truck: plancha a la izquierda, ventanilla al frente, acero inoxidable.' },
        change(2, 'Mal', 'primero papel y luego tablet', ''),
        change(1, 'Nada', 'algo', ''),
      ].map((c, i) => (i === 4 ? { ...c, ficha: 'Comedor' } : c)),
      pregunta: null,
    },
    {
      escena: null,
      plano: null,
      imagen: null,
      gravedad: 'media',
      problema: 'No está claro si es un restaurante con comedor o un food truck.',
      evidencia: 'La escena 8 habla de mesas.',
      correccion: '',
      regla: null,
      cambios: [],
      pregunta: { texto: '¿La historia pasa en un restaurante con comedor o en un food truck?', opciones: ['Restaurante con comedor', 'Food truck'] },
    },
  ],
}

/** La app en memoria: decisiones y fichas, con las mismas acciones que usa el panel. */
function fakeApp(project: Project) {
  const decisions: Decision[] = []
  const ops: DecisionOps & ItemOps = {
    addDecision: (text, o) => {
      const id = `dec${decisions.length + 1}`
      decisions.push({ id, text, proposedBy: o.proposedBy, proposedAt: T, status: o.proposedBy === 'director' ? 'approved' : 'proposed', updatedAt: T, sceneIds: o.sceneIds })
      return id
    },
    approveDecision: (id) => Object.assign(decisions.find((d) => d.id === id)!, { status: 'approved', approvedBy: 'director' }),
    removeDecision: (id) => decisions.splice(decisions.findIndex((d) => d.id === id), 1),
    updateItem: (kind: ItemKind, id, patch) => {
      project[kind] = project[kind]!.map((it) => (it.id === id ? { ...it, ...patch } : it))
    },
  }
  return { decisions, ops }
}

function setup() {
  const f = fixture()
  const review = toReview(answer, buildContinuityPacket(f.project, f.scenes), f.map)
  return { ...f, review, reviews: [review] as GptReview[] }
}

describe('revisión GPT honesta · corrección de fichas', () => {
  it('lee «cambios» y «pregunta»; las respuestas viejas (sin esos campos) siguen valiendo', () => {
    const { review, scenes } = setup()
    expect(review.proposals[0].changes?.[0]).toEqual({ kind: 'item-state', item: 'Pase de cocina', sceneId: scenes[0].id, label: 'Antes: papel', shows: 'comandas de papel colgadas sobre la plancha', hides: 'tablet o celular', text: undefined })
    expect(review.proposals[1].question?.options).toEqual(['Restaurante con comedor', 'Food truck'])
    const old = JSON.stringify({ resumen: 'x', hallazgos: [{ escena: null, plano: null, imagen: null, gravedad: 'baja', problema: 'p', evidencia: '', correccion: '', regla: null }] })
    const parsed = parseContinuityResponse(old)
    expect(parsed.ok).toBe(true)
    if (parsed.ok) expect(parsed.data.hallazgos[0].cambios).toEqual([])
  })

  it('GPT sabe pedir cambios por escena, preguntar sin adivinar y ve los estados que ya hay', () => {
    const { project, scenes } = fixture()
    project.locations![0].states = [{ id: 's1', label: 'Antes: papel', phaseIds: ['antes'], shows: 'comandas de papel', updatedAt: T }]
    const { prompt } = buildContinuityPacket(project, scenes)
    expect(prompt).toContain('«estado-ficha»')
    expect(prompt).toContain('¿restaurante con comedor o food truck?')
    expect(prompt).toContain('estados: «Antes: papel» (se ve: comandas de papel)')
  })

  it('la vista previa no cambia nada y dice qué no se puede hacer solo', () => {
    const { project, map, review } = setup()
    const before = JSON.stringify(project)
    const plan = planCorrection(project, map, review.proposals[0])
    expect(JSON.stringify(project)).toBe(before)
    expect(plan.ready.map((c) => c.title)).toEqual([
      'Locación «Pase de cocina dentro del food truck» · Escena 01',
      'Locación «Pase de cocina dentro del food truck» · Escena 02',
      'Locación «Pase de cocina dentro del food truck» · descripción fija',
    ])
    expect(plan.ready[0].before).toBe('Sin estado para esta escena')
    expect(plan.ready[0].note).toBe('La imagen aprobada (Canon) no cambia.')
    expect(plan.blocked.map((b) => b.reason)).toEqual([expect.stringMatching(/dos momentos/), 'No encontré la ficha «Comedor» en la Biblia.'])
  })

  it('Aplicar: la Escena 3 queda con papel y la 8 con la app, sin mezclar; Canon e imágenes intactos', () => {
    const { project, scenes, map, review, reviews } = setup()
    const { decisions, ops } = fakeApp(project)
    const next = applyCorrection(reviews, review.id, review.proposals[0].id, project, map, ops)
    const p = next[0].proposals[0]
    expect(p).toMatchObject({ status: 'accepted', outcome: 'applied', decisionId: 'dec1' })
    expect(p.missing).toHaveLength(2)
    expect(decisions[0]).toMatchObject({ text: 'En el pase de cocina va el papel o la app, nunca los dos.', status: 'approved', approvedBy: 'director' })
    const loc = project.locations![0]
    expect(loc.imageId).toBe('canon-pase')
    expect(loc.tries).toBeUndefined()
    expect(loc.states!.map((s) => [s.label, s.sceneIds])).toEqual([
      ['Antes: papel', [scenes[0].id]],
      ['Después: app', [scenes[1].id]],
    ])
    const s3 = itemImagePrompt(project, 'locations', loc, { mode: 'scene', sceneId: scenes[0].id }, scenes)
    const s8 = itemImagePrompt(project, 'locations', loc, { mode: 'scene', sceneId: scenes[1].id }, scenes)
    expect(s3.blocked).toBeUndefined()
    expect(s8.blocked).toBeUndefined()
    expect(s3.prompt.split('Must NOT appear')[0]).not.toMatch(/tablet/i)
    expect(s8.prompt.split('Must NOT appear')[0]).not.toMatch(/papel/)
    expect(outcomeText(p)).toMatch(/^✓ Corrección aplicada en 1 ficha y se guardó la regla\. Las imágenes no cambiaron\. Se guardó la regla; faltan estos pasos:/)
    // Regenerar solo como opción aparte, una por escena.
    expect(regenTargets(project, p).map((t) => t.label)).toEqual(['Escena 01', 'Escena 02'])
    // Aplicar dos veces no hace nada.
    expect(applyCorrection(next, review.id, p.id, project, map, ops)).toBe(next)
  })

  it('guardar y abrir: la revisión aplicada sobrevive a JSON y Deshacer deja la ficha como estaba', () => {
    const { project, map, review, reviews } = setup()
    const original = structuredClone(project.locations![0])
    const { decisions, ops } = fakeApp(project)
    const saved = JSON.stringify({ reviews: applyCorrection(reviews, review.id, review.proposals[0].id, project, map, ops) })
    const opened: GptReview[] = JSON.parse(saved).reviews
    expect(opened[0].proposals[0].applied?.[0].before.description).toBe(MIXED_DESC)
    const undone = undoProposal(opened, review.id, review.proposals[0].id, ops)
    expect(undone[0].proposals[0]).toMatchObject({ status: 'pending', outcome: undefined, applied: undefined })
    expect(project.locations![0]).toEqual(original)
    expect(decisions).toEqual([])
  })

  it('«Guardar regla» solo guarda la regla y lo dice', () => {
    const { project, review, reviews } = setup()
    const { decisions, ops } = fakeApp(project)
    const before = JSON.stringify(project)
    const next = acceptProposal(reviews, review.id, review.proposals[0].id, ops)
    expect(JSON.stringify(project)).toBe(before)
    expect(decisions).toHaveLength(1)
    expect(outcomeText(next[0].proposals[0])).toBe('✓ Se guardó la regla; faltan estos pasos: Separar en un estado por escena. No cambió fichas, diálogos ni imágenes.')
    expect(outcomeText({ ...next[0].proposals[0], rule: undefined, decisionId: undefined, outcome: 'reviewed' })).toBe('✓ Marcado como revisado. No se cambió nada.')
  })

  it('la pregunta (restaurante o food truck) queda como decisión del director y no reescribe la ficha', () => {
    const { project, review, reviews } = setup()
    const { decisions, ops } = fakeApp(project)
    const before = JSON.stringify(project)
    const pid = review.proposals[1].id
    expect(answerQuestion(reviews, review.id, pid, 'Otra cosa', ops)).toBe(reviews)
    let next = answerQuestion(reviews, review.id, pid, 'Food truck', ops)
    expect(next[0].proposals[1]).toMatchObject({ answer: 'Food truck', answerDecisionId: 'dec1', status: 'pending' })
    expect(decisions[0]).toMatchObject({ proposedBy: 'director', status: 'approved', text: '¿La historia pasa en un restaurante con comedor o en un food truck? Respuesta del director: Food truck.' })
    expect(JSON.stringify(project)).toBe(before)
    next = undoAnswer(next, review.id, pid, ops)
    expect(next[0].proposals[1].answer).toBeUndefined()
    expect(decisions).toEqual([])
  })

  it('sin escena no se adivina: el estado queda bloqueado', () => {
    const { project, map } = setup()
    const plan = planCorrection(project, map, { changes: [{ kind: 'item-state', item: 'Pase de cocina', shows: 'papel' }] })
    expect(plan.ready).toEqual([])
    expect(plan.blocked[0].reason).toMatch(/no lo adivino/)
  })
})
