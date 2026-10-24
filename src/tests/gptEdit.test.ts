// Fase 3e: «Consultar GPT» en Edición (ritmo, orden y duración). GPT simulado (sin gastar cuota); el store es el real.
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { useProject } from '../stores/projectStore'
import { runEditConsult, type GptDeps } from '../features/gpt/client'
import {
  acceptEditProposal,
  buildEditPacket,
  describeEditProposal,
  discardEditProposal,
  EDIT_KEY,
  editChangesSince,
  editClaudeText,
  editEditProposal,
  editSeenOf,
  isEditStale,
  markEditAskedClaude,
  parseEditResponse,
  toEditProposals,
  undoEditProposal,
  type EditOps,
  type EditProposal,
  type EditProposalRef,
  type EditResponse,
  type EditSeen,
  type EditThread,
} from '../features/gpt/edit'
import { shotsOf } from '../features/coverage/shots'
import { orderedScenes } from '../features/script-sync/derive'
import { addMessage, mergeSection, newThread, threadsFor, type StoredThread } from '../features/gpt/threads'
import { GPT_ERROR_TEXT } from '../features/gpt/proposals'
import schemaText from '../features/gpt/schemas/edit.json?raw'

const st = useProject.getState
const ops = (): EditOps => ({
  ordered: () => orderedScenes(st().project!, st().scenes),
  moveScene: st().moveScene,
  updateScene: (id, patch) => st().updateScene(id, patch),
  moveShot: st().moveShot,
  updateShot: (a, b, patch) => st().updateShot(a, b, patch),
})
const ordered = () => orderedScenes(st().project!, st().scenes)
const ids = () => ordered().map((s) => s.id)

beforeAll(async () => {
  await st().init()
})

/** Proyecto nuevo con 3 escenas: 1 y 2 sin planos (8 s), 3 con cobertura de 2 planos (4 s y 2 s). */
async function fresh() {
  await st().newProject('Caldo')
  st().setStyle({ notes: 'Luz cálida de tarde.' })
  st().addDecision('El final siempre es en la cocina.', { proposedBy: 'director', approve: true })
  st().addDecision('PROPUESTA-SECRETA', { proposedBy: 'claude' })
  const made: string[] = []
  for (const title of ['Llegada', 'Mesa', 'Cocina']) {
    const id = st().addScene()!
    const sc = st().scenes[id]
    st().updateScene(id, { title, plannedDuration: 8, script: { ...sc.script, action: `Pasa algo en ${title}.`, dialogue: 'Abuela: —Siéntate a comer, mijo.' } })
    made.push(id)
  }
  const c = made[2]
  await st().convertToCoverage(c)
  st().updateShot(c, st().scenes[c].shots![0].id, { name: 'General', duration: 4 })
  const second = st().addShot(c)!
  st().updateShot(c, second, { name: 'Detalle', duration: 2 })
  return made
}

const answer = (propuestas: EditResponse['propuestas']): EditResponse => ({ respuesta: 'Ideas de ritmo.', resumen_hilo: 'Revisamos el ritmo.', propuestas })
const prop = (p: Partial<EditResponse['propuestas'][number]>): EditResponse['propuestas'][number] => ({
  tipo: 'duracion_escena',
  escena: 1,
  plano: null,
  posicion: null,
  duracion: 5,
  motivo: 'Más ágil.',
  ...p,
})

function withProposals(propuestas: EditResponse['propuestas']) {
  let t = newThread<EditProposal, EditSeen>(EDIT_KEY, 'Prueba', '2026-10-24T00:00:00.000Z', 'edit')
  t = addMessage(t, { from: 'gpt', text: 'Ideas', proposals: toEditProposals(answer(propuestas), ordered()) })
  const m = t.messages[0]
  const ref = (k = 0): EditProposalRef => ({ threadId: t.id, messageId: m.id, proposalId: m.proposals![k].id })
  return { threads: [t] as EditThread[], ref, proposals: m.proposals! }
}

describe('paquete de Edición', () => {
  it('lleva todas las escenas en orden, duraciones, planos y solo decisiones aprobadas', async () => {
    await fresh()
    const r = buildEditPacket(st().project!, ordered(), newThread(EDIT_KEY, 't', undefined, 'edit'), 'Revisa el ritmo')
    expect(r.prompt).toContain('ritmo, el orden y la duración')
    expect(r.prompt).toContain('Escenas en orden (3) · duración total 22 s')
    expect(r.prompt).toContain('1. «Llegada»')
    expect(r.prompt).toContain('dura 8 s (planeada)')
    expect(r.prompt).toContain('3. «Cocina»')
    expect(r.prompt).toContain('dura 6 s (suma de sus planos)')
    expect(r.prompt).toContain('Plano 1 «General» · 4 s')
    expect(r.prompt).toContain('Plano 2 «Detalle» · 2 s')
    expect(r.prompt).toContain('Duración sugerida por el guion')
    expect(r.prompt).toContain('Luz cálida de tarde.')
    expect(r.prompt).toContain('El final siempre es en la cocina.')
    expect(r.prompt).not.toContain('PROPUESTA-SECRETA')
    expect(r.prompt).toContain('Pedido del director: Revisa el ritmo')
    expect(r.prompt).not.toContain('Esto cambió desde la última vez')
    expect(r.seen).toEqual(editSeenOf(st().project!, ordered()))
  })

  it('avisa qué cambió desde la última vez (orden, duraciones, decisiones)', async () => {
    const [a] = await fresh()
    const seen = editSeenOf(st().project!, ordered())
    expect(editChangesSince(undefined, seen)).toEqual([])
    st().moveScene(a, 2)
    st().updateScene(ids()[0], { plannedDuration: 3 })
    st().addDecision('Nueva regla', { proposedBy: 'director', approve: true })
    const now = editSeenOf(st().project!, ordered())
    expect(editChangesSince(seen, now)).toEqual(['El orden de las escenas cambió.', 'Las duraciones (o los planos) cambiaron.', 'Las decisiones aprobadas del director cambiaron.'])
    const t = { ...newThread<EditProposal, EditSeen>(EDIT_KEY, 't', undefined, 'edit'), seen }
    expect(buildEditPacket(st().project!, ordered(), t, 'x').prompt).toContain('El orden de las escenas cambió.')
  })

  it('el esquema pide todos los campos', () => {
    const s = JSON.parse(schemaText)
    expect(s.properties.propuestas.items.required).toEqual(['tipo', 'escena', 'plano', 'posicion', 'duracion', 'motivo'])
    expect(s.properties.propuestas.items.properties.tipo.enum).toEqual(['mover_escena', 'duracion_escena', 'mover_plano', 'duracion_plano'])
  })
})

describe('respuesta de GPT', () => {
  it('formato malo: no se usa nada', () => {
    expect(parseEditResponse('no es json')).toEqual({ ok: false, error: 'bad-format' })
    expect(parseEditResponse(JSON.stringify({ respuesta: 'x' }))).toEqual({ ok: false, error: 'bad-format' })
    expect(parseEditResponse(JSON.stringify(answer([prop({ tipo: 'borrar' as never })])))).toEqual({ ok: false, error: 'bad-format' })
    expect(parseEditResponse(JSON.stringify(answer([prop({})]))).ok).toBe(true)
  })

  it('ignora escenas o planos que no existen, cambios que no cambian nada y duraciones malas', async () => {
    await fresh()
    const ps = toEditProposals(
      answer([
        prop({ escena: 9 }),
        prop({ duracion: 8 }), // igual que hoy
        prop({ duracion: -2 }),
        prop({ escena: 3, duracion: 5 }), // la 3 tiene planos: la duración va por plano
        prop({ tipo: 'mover_escena', posicion: 1 }), // ya está ahí
        prop({ tipo: 'mover_escena', posicion: 7 }),
        prop({ tipo: 'duracion_plano', escena: 1, plano: 1, duracion: 3 }), // la 1 no tiene planos
        prop({ tipo: 'duracion_plano', escena: 3, plano: 5, duracion: 3 }),
        prop({ tipo: 'mover_plano', escena: 3, plano: 2, posicion: 2 }),
      ]),
      ordered(),
    )
    expect(ps).toEqual([])
    const ok = toEditProposals(
      answer([
        prop({ duracion: 900 }), // se recorta al máximo
        prop({ tipo: 'mover_escena', escena: 3, posicion: 1 }),
        prop({ tipo: 'duracion_plano', escena: 3, plano: 2, duracion: 3.5 }),
        prop({ tipo: 'mover_plano', escena: 3, plano: 2, posicion: 1 }),
      ]),
      ordered(),
    )
    expect(ok.map((p) => [p.kind, p.value])).toEqual([
      ['scene-duration', 600],
      ['move-scene', 1],
      ['shot-duration', 3.5],
      ['move-shot', 1],
    ])
    expect(ok.every((p) => p.status === 'pending')).toBe(true)
  })

  it('máximo 10 propuestas', async () => {
    await fresh()
    const many = Array.from({ length: 14 }, (_, k) => prop({ duracion: k + 1 }))
    expect(toEditProposals(answer(many), ordered()).length).toBeLessThanOrEqual(10)
  })
})

describe('aceptar, deshacer y avisos', () => {
  it('mover una escena: Aceptar la mueve y Deshacer la regresa', async () => {
    const [a, b, c] = await fresh()
    const { threads, ref } = withProposals([prop({ tipo: 'mover_escena', escena: 3, posicion: 1 })])
    const r = acceptEditProposal(threads, ref(), ops())
    expect(r.ok).toBe(true)
    expect(ids()).toEqual([c, a, b])
    if (!r.ok) return
    const u = undoEditProposal(r.threads, ref(), ops())
    expect(u.ok).toBe(true)
    expect(ids()).toEqual([a, b, c])
  })

  it('duración de una escena: cambia lo planeado; ⌘Z del store también lo regresa', async () => {
    const [a] = await fresh()
    const { threads, ref } = withProposals([prop({ duracion: 5 })])
    const r = acceptEditProposal(threads, ref(), ops())
    expect(r.ok).toBe(true)
    expect(st().scenes[a].plannedDuration).toBe(5)
    st().undo()
    expect(st().scenes[a].plannedDuration).toBe(8)
  })

  it('duración y orden de planos', async () => {
    const [, , c] = await fresh()
    const [first, second] = shotsOf(st().scenes[c]).map((s) => s.id)
    const { threads, ref } = withProposals([prop({ tipo: 'duracion_plano', escena: 3, plano: 2, duracion: 3.5 }), prop({ tipo: 'mover_plano', escena: 3, plano: 2, posicion: 1 })])
    let r = acceptEditProposal(threads, ref(0), ops())
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(shotsOf(st().scenes[c])[1].duration).toBe(3.5)
    r = acceptEditProposal(r.threads, ref(1), ops())
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(shotsOf(st().scenes[c]).map((s) => s.id)).toEqual([second, first])
    const u = undoEditProposal(r.threads, ref(1), ops())
    expect(u.ok).toBe(true)
    expect(shotsOf(st().scenes[c]).map((s) => s.id)).toEqual([first, second])
    if (!u.ok) return
    expect(undoEditProposal(u.threads, ref(0), ops()).ok).toBe(true)
    expect(shotsOf(st().scenes[c])[1].duration).toBe(2)
  })

  it('Deshacer no pisa lo que editaste después', async () => {
    const [a] = await fresh()
    const { threads, ref } = withProposals([prop({ duracion: 5 })])
    const r = acceptEditProposal(threads, ref(), ops())
    if (!r.ok) throw new Error('no aceptó')
    st().updateScene(a, { plannedDuration: 6 })
    expect(undoEditProposal(r.threads, ref(), ops())).toEqual({ ok: false, error: 'changed' })
    expect(st().scenes[a].plannedDuration).toBe(6)
  })

  it('avisa «esto cambió» si el orden o la duración cambió desde que GPT lo vio', async () => {
    const [a, b] = await fresh()
    const { proposals } = withProposals([prop({ duracion: 5 }), prop({ tipo: 'mover_escena', escena: 2, posicion: 1 })])
    expect(isEditStale(proposals[0], ordered())).toBe(false)
    expect(isEditStale(proposals[1], ordered())).toBe(false)
    st().updateScene(a, { plannedDuration: 7 })
    expect(isEditStale(proposals[0], ordered())).toBe(true)
    st().moveScene(b, 2)
    expect(isEditStale(proposals[1], ordered())).toBe(true)
    // Ya aceptadas o descartadas no avisan.
    expect(isEditStale({ ...proposals[0], status: 'discarded' }, ordered())).toBe(false)
  })

  it('Editar, Descartar y Pedir a Claude', async () => {
    await fresh()
    const { threads, ref } = withProposals([prop({ duracion: 5 }), prop({ tipo: 'mover_escena', escena: 3, posicion: 1 })])
    let t = editEditProposal(threads, ref(0), '6,5')
    t = editEditProposal(t, ref(0), 'nada') // no vale: se queda
    t = editEditProposal(t, ref(1), '2')
    const ps = t[0].messages[0].proposals!
    expect(ps[0].value).toBe(6.5)
    expect(ps[1].value).toBe(2)
    expect(describeEditProposal(ps[0])).toBe('Duración de la escena 01: 6.5 s (hoy 8 s)')
    expect(describeEditProposal(ps[1])).toBe('Mover la escena 03 al lugar 2')
    const d = discardEditProposal(t, ref(0))
    expect(d[0].messages[0].proposals![0].status).toBe('discarded')
    const c = markEditAskedClaude(t, ref(1))
    expect(c[0].messages[0].proposals![1].status).toBe('asked-claude')
    expect(editClaudeText(ps[1])).toContain('sin tocar el Canon ni lo aprobado')
    // Aceptar algo que ya no está pendiente no hace nada.
    expect(acceptEditProposal(d, ref(0), ops())).toEqual({ ok: false, error: 'not-pending' })
  })
})

describe('consulta (GPT simulado)', () => {
  const deps = (raw: string | Error, desktop = true): GptDeps => ({
    desktop: () => desktop,
    diskPath: async () => null,
    consult: vi.fn(async () => {
      if (raw instanceof Error) throw raw
      return raw
    }),
  })

  it('en la web no consulta y no cambia nada', async () => {
    await fresh()
    const d = deps('{}', false)
    const t = newThread<EditProposal, EditSeen>(EDIT_KEY, 't', undefined, 'edit')
    const r = await runEditConsult(st().project!, ordered(), t, 'Ritmo', d)
    expect(r).toEqual({ ok: false, kind: 'web', message: GPT_ERROR_TEXT.web })
    expect(d.consult).not.toHaveBeenCalled()
  })

  it('agrega el mensaje, las propuestas pendientes, el resumen y lo visto; no cambia el proyecto', async () => {
    const [a] = await fresh()
    const before = JSON.stringify(ordered())
    const d = deps(JSON.stringify(answer([prop({ duracion: 5 })])))
    const t = newThread<EditProposal, EditSeen>(EDIT_KEY, 't', undefined, 'edit')
    const r = await runEditConsult(st().project!, ordered(), t, 'Más ágil', d)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const call = (d.consult as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(call.schema).toBe(schemaText)
    expect(call.images).toEqual([])
    expect(r.thread.messages.map((m) => m.from)).toEqual(['director', 'gpt'])
    expect(r.thread.messages[1].proposals![0]).toMatchObject({ kind: 'scene-duration', sceneId: a, value: 5, status: 'pending' })
    expect(r.thread.summary).toBe('Revisamos el ritmo.')
    expect(r.thread.seen).toEqual(editSeenOf(st().project!, ordered()))
    expect(JSON.stringify(ordered())).toBe(before)
  })

  it('formato malo o error: el hilo queda igual', async () => {
    await fresh()
    const t = newThread<EditProposal, EditSeen>(EDIT_KEY, 't', undefined, 'edit')
    const bad = await runEditConsult(st().project!, ordered(), t, 'x', deps('no json'))
    expect(bad).toMatchObject({ ok: false, kind: 'bad-format' })
    const err = await runEditConsult(st().project!, ordered(), t, 'x', deps(new Error('boom')))
    expect(err.ok).toBe(false)
  })

  it('los hilos de Edición viven en su apartado y no pisan a los demás', () => {
    const edit = newThread<EditProposal, EditSeen>(EDIT_KEY, 'Ritmo', undefined, 'edit') as unknown as StoredThread
    const other = newThread('esc1', 'Guion', undefined, 'script') as unknown as StoredThread
    const merged = mergeSection([other], [edit], 'edit')
    expect(merged.map((t) => t.section).sort()).toEqual(['edit', 'script'])
    expect(threadsFor(merged, EDIT_KEY, false, 'edit').map((t) => t.title)).toEqual(['Ritmo'])
  })
})
