import { describe, expect, it, vi } from 'vitest'
import type { Decision, Scene } from '../types'
import { buildExample } from '../features/continuity/examples'
import { runScriptConsult, type GptDeps } from '../features/gpt/client'
import {
  acceptScriptProposal,
  buildScriptPacket,
  discardScriptProposal,
  editScriptProposal,
  isScriptStale,
  markScriptAskedClaude,
  parseScriptResponse,
  scriptClaudeText,
  seenOf,
  toScriptProposals,
  undoScriptProposal,
  type ProposalRef,
  type ScriptOps,
  type ScriptResponse,
} from '../features/gpt/script'
import { addMessage, changesSince, historyForPrompt, KEEP_RECENT, newThread, setArchived, threadsFor, upsertThread, type GptThread } from '../features/gpt/threads'
import { GPT_ERROR_TEXT } from '../features/gpt/proposals'
import schemaText from '../features/gpt/schemas/script.json?raw'

const decision = (patch: Partial<Decision>): Decision => ({
  id: 'd1',
  text: 'La abuela nunca grita.',
  proposedBy: 'director',
  proposedAt: '2026-10-24T00:00:00.000Z',
  status: 'approved',
  approvedBy: 'director',
  updatedAt: '2026-10-24T00:00:00.000Z',
  ...patch,
})

const DIALOGUE = 'Abuela (tranquila): —Siéntate, mijo.\nBeto (nervioso): —Ya voy.\nAbuela: —¿Comiste?'

function sample() {
  const { project, scenes } = buildExample(
    [
      ['Cocina', 'antes', 'Beto entra a la cocina.'],
      ['Mesa', 'antes', 'La abuela sirve el caldo.'],
      ['Patio', 'despues', 'Beto sale al patio.'],
    ],
    [
      decision({}),
      decision({ id: 'd2', text: 'PROPUESTA-SECRETA', status: 'proposed', proposedBy: 'claude', approvedBy: undefined }),
      decision({ id: 'd3', text: 'RECHAZADA-SECRETA', status: 'rejected', approvedBy: undefined }),
    ],
  )
  scenes[1].script.dialogue = DIALOGUE
  scenes[1].script.generationPrompt = 'PROMPT-SECRETO'
  return { project, scenes, scene: scenes[1] }
}

const answer = (propuestas: ScriptResponse['propuestas'], patch: Partial<ScriptResponse> = {}): ScriptResponse => ({
  respuesta: 'Aquí van mis ideas.',
  resumen_hilo: 'El director quiere diálogos más cálidos.',
  propuestas,
  ...patch,
})
const prop = (p: Partial<ScriptResponse['propuestas'][number]>): ScriptResponse['propuestas'][number] => ({
  tipo: 'cambiar_linea',
  linea: 1,
  personaje: null,
  emocion: null,
  texto: 'Siéntate, mi niño.',
  motivo: 'Más cálido.',
  ...p,
})

/** Escena en memoria: aplica los cambios como lo haría la app. */
function fakeOps(scene: Scene) {
  let current = scene
  const calls: string[] = []
  const ops: ScriptOps = {
    setScriptField: (_id, field, value) => {
      calls.push(field)
      current = { ...current, script: { ...current.script, [field]: value } }
    },
  }
  return { ops, calls, get: () => current, set: (s: Scene) => (current = s) }
}

/** Hilo con un mensaje de GPT y sus propuestas, listo para Aceptar / Deshacer. */
function withProposals(scene: Scene, propuestas: ScriptResponse['propuestas']) {
  let t = newThread(scene.id, 'Prueba', '2026-10-24T00:00:00.000Z')
  t = addMessage(t, { from: 'gpt', text: 'Ideas', proposals: toScriptProposals(answer(propuestas), scene) })
  const m = t.messages[0]
  const ref = (k = 0): ProposalRef => ({ threadId: t.id, messageId: m.id, proposalId: m.proposals![k].id })
  return { threads: [t], ref }
}

describe('paquete de guion y diálogos', () => {
  it('lleva solo decisiones aprobadas, líneas numeradas, vecinas y el pedido; no prompts de generación', () => {
    const { project, scenes, scene } = sample()
    const { prompt } = buildScriptPacket(project, scenes, scene, newThread(scene.id, 't'), 'Mejora los diálogos')
    expect(prompt).toContain('La abuela nunca grita.')
    expect(prompt).not.toContain('PROPUESTA-SECRETA')
    expect(prompt).not.toContain('RECHAZADA-SECRETA')
    expect(prompt).not.toContain('PROMPT-SECRETO')
    expect(prompt).toContain('Escena 2 de 3')
    expect(prompt).toContain('1. Abuela (tranquila): —Siéntate, mijo.')
    expect(prompt).toContain('3. Abuela: —¿Comiste?')
    expect(prompt).toContain('Anterior: escena 1')
    expect(prompt).toContain('Siguiente: escena 3')
    expect(prompt).toContain('Pedido del director: Mejora los diálogos')
    expect(prompt).not.toContain('Esto cambió desde la última vez')
  })

  it('avisa «esto cambió desde la última vez»', () => {
    const { project, scenes, scene } = sample()
    const t = { ...newThread(scene.id, 't'), seen: seenOf(project, scene) }
    const edited = { ...scene, script: { ...scene.script, action: 'Otra acción.' } }
    const { prompt } = buildScriptPacket(project, scenes, edited, t, 'Sigue')
    expect(prompt).toContain('Esto cambió desde la última vez')
    expect(prompt).toContain('La acción visual de la escena cambió.')
    expect(changesSince(t.seen, seenOf(project, scene))).toEqual([])
    expect(changesSince(t.seen, { ...t.seen!, dialogue: 'x', decisionIds: [] })).toEqual(['Los diálogos de la escena cambiaron.', 'Las decisiones aprobadas del director cambiaron.'])
  })

  it('con historial largo manda resumen de lo viejo y los últimos mensajes completos', () => {
    let t = newThread('s', 't')
    for (let k = 1; k <= KEEP_RECENT + 3; k++) t = addMessage(t, { from: k % 2 ? 'director' : 'gpt', text: `mensaje-${k}` })
    const plain = historyForPrompt(t)
    expect(plain).toContain('Resumen de lo platicado antes:')
    expect(plain).toContain('- Director: mensaje-1')
    expect(plain).toContain(`GPT: mensaje-${KEEP_RECENT + 2}`)
    const withSummary = historyForPrompt({ ...t, summary: 'RESUMEN-GPT' })
    expect(withSummary).toContain('RESUMEN-GPT')
    expect(withSummary).not.toContain('mensaje-1\n')
    expect(withSummary.split('Últimos mensajes:')[1].trim().split('\n')).toHaveLength(KEEP_RECENT)
    expect(historyForPrompt(newThread('s', 't'))).toBe('')
  })

  it('el esquema de respuesta es estricto', () => {
    const schema = JSON.parse(schemaText)
    expect(schema.additionalProperties).toBe(false)
    expect(schema.required).toEqual(['respuesta', 'resumen_hilo', 'propuestas'])
  })
})

describe('respuesta de GPT', () => {
  it('formato malo no se usa', () => {
    expect(parseScriptResponse('no es json')).toEqual({ ok: false, error: 'bad-format' })
    expect(parseScriptResponse(JSON.stringify({ respuesta: 'x' }))).toEqual({ ok: false, error: 'bad-format' })
    expect(parseScriptResponse(JSON.stringify(answer([prop({})]))).ok).toBe(true)
  })

  it('ignora propuestas a líneas que no existen o vacías', () => {
    const { scene } = sample()
    const ps = toScriptProposals(
      answer([prop({ linea: 9 }), prop({ linea: 0 }), prop({ texto: '  ' }), prop({ tipo: 'agregar_linea', linea: 4 }), prop({ tipo: 'accion', texto: '' }), prop({ tipo: 'quitar_linea', linea: 2, texto: '' })]),
      scene,
    )
    expect(ps.map((p) => p.kind)).toEqual(['line-remove'])
    expect(ps[0].before).toBe('Beto (nervioso): —Ya voy.')
    expect(ps[0].status).toBe('pending')
  })
})

describe('Aceptar · Deshacer · Descartar · Editar · Pedir a Claude', () => {
  it('cambiar línea conserva personaje y emoción si GPT manda null', () => {
    const { scene } = sample()
    const f = fakeOps(scene)
    const { threads, ref } = withProposals(scene, [prop({})])
    const r = acceptScriptProposal(threads, ref(), f.get(), f.ops)
    expect(r.ok).toBe(true)
    expect(f.get().script.dialogue.split('\n')[0]).toBe('Abuela (tranquila): —Siéntate, mi niño.')
    if (!r.ok) return
    const u = undoScriptProposal(r.threads, ref(), f.get(), f.ops)
    expect(u.ok).toBe(true)
    expect(f.get().script.dialogue).toBe(DIALOGUE)
    if (u.ok) expect(u.threads[0].messages[0].proposals![0].status).toBe('pending')
  })

  it('agregar, quitar y cambiar la acción', () => {
    const { scene } = sample()
    const f = fakeOps(scene)
    const { threads, ref } = withProposals(scene, [
      prop({ tipo: 'agregar_linea', linea: 0, personaje: 'Beto', emocion: 'feliz', texto: '¡Huele rico!' }),
      prop({ tipo: 'quitar_linea', linea: 3, texto: '' }),
      prop({ tipo: 'accion', linea: null, texto: 'La abuela sirve dos platos.' }),
    ])
    let cur = threads
    for (const k of [0, 1, 2]) {
      const r = acceptScriptProposal(cur, ref(k), f.get(), f.ops)
      expect(r.ok).toBe(true)
      if (r.ok) cur = r.threads
    }
    expect(f.get().script.dialogue).toBe('Beto (feliz): —¡Huele rico!\nAbuela (tranquila): —Siéntate, mijo.\nBeto (nervioso): —Ya voy.')
    expect(f.get().script.action).toBe('La abuela sirve dos platos.')
    expect(f.calls).toEqual(['dialogue', 'dialogue', 'action'])
    // Aceptar otra vez no hace nada.
    expect(acceptScriptProposal(cur, ref(2), f.get(), f.ops)).toEqual({ ok: false, error: 'not-pending' })
  })

  it('aceptar una no vuelve viejas a las demás: siguen la línea aunque se mueva', () => {
    const { scene } = sample()
    const f = fakeOps(scene)
    const { threads, ref } = withProposals(scene, [prop({ tipo: 'agregar_linea', linea: 0, personaje: 'Beto', texto: 'Hola.' }), prop({ linea: 2, texto: 'Ahorita voy.' })])
    const r = acceptScriptProposal(threads, ref(0), f.get(), f.ops)
    if (!r.ok) throw new Error('no aceptó')
    const second = r.threads[0].messages[0].proposals![1]
    expect(isScriptStale(second, f.get())).toBe(false)
    const r2 = acceptScriptProposal(r.threads, ref(1), f.get(), f.ops)
    expect(r2.ok).toBe(true)
    expect(f.get().script.dialogue.split('\n')[2]).toBe('Beto (nervioso): —Ahorita voy.')
  })

  it('avisa si la línea cambió y no aplica si ya no existe', () => {
    const { scene } = sample()
    const f = fakeOps(scene)
    const { threads, ref } = withProposals(scene, [prop({ linea: 3, texto: '¿Ya comiste, mijo?' })])
    const p = threads[0].messages[0].proposals![0]
    const edited = { ...scene, script: { ...scene.script, dialogue: 'Abuela: —Hola.\nBeto: —Hola.\nAbuela: —¿Tienes hambre?' } }
    expect(isScriptStale(p, edited)).toBe(true)
    expect(isScriptStale(p, undefined)).toBe(true)
    const gone = { ...scene, script: { ...scene.script, dialogue: 'Abuela: —Hola.' } }
    expect(acceptScriptProposal(threads, ref(), gone, f.ops)).toEqual({ ok: false, error: 'missing' })
    expect(f.calls).toEqual([])
  })

  it('Deshacer no pisa lo que el director editó después', () => {
    const { scene } = sample()
    const f = fakeOps(scene)
    const { threads, ref } = withProposals(scene, [prop({ tipo: 'accion', texto: 'Nueva acción.' })])
    const r = acceptScriptProposal(threads, ref(), f.get(), f.ops)
    if (!r.ok) throw new Error('no aceptó')
    f.set({ ...f.get(), script: { ...f.get().script, action: 'Lo escribí yo.' } })
    expect(undoScriptProposal(r.threads, ref(), f.get(), f.ops)).toEqual({ ok: false, error: 'changed' })
    expect(f.get().script.action).toBe('Lo escribí yo.')
  })

  it('descartar, editar y pedir a Claude no tocan la escena y se pueden deshacer', () => {
    const { scene } = sample()
    const f = fakeOps(scene)
    const { threads, ref } = withProposals(scene, [prop({})])
    const edited = editScriptProposal(threads, ref(), { text: '—Siéntate, corazón.', emotion: 'dulce' })
    const r = acceptScriptProposal(edited, ref(), f.get(), f.ops)
    expect(f.get().script.dialogue.split('\n')[0]).toBe('Abuela (dulce): —Siéntate, corazón.')
    expect(r.ok).toBe(true)

    const g = fakeOps(scene)
    const d = discardScriptProposal(threads, ref())
    expect(d[0].messages[0].proposals![0].status).toBe('discarded')
    const asked = markScriptAskedClaude(threads, ref())
    expect(asked[0].messages[0].proposals![0].status).toBe('asked-claude')
    const back = undoScriptProposal(d, ref(), g.get(), g.ops)
    expect(back.ok && back.threads[0].messages[0].proposals![0].status).toBe('pending')
    expect(g.calls).toEqual([])
    expect(scriptClaudeText(threads[0].messages[0].proposals![0], 2)).toContain('escena 02')
  })
})

describe('hilos', () => {
  it('se listan por escena, se archivan y se retoman', () => {
    const a = newThread('s1', 'A', '2026-10-24T01:00:00.000Z')
    const b = newThread('s1', 'B', '2026-10-24T02:00:00.000Z')
    const c = newThread('s2', 'C')
    let all = upsertThread(upsertThread(upsertThread([], a), b), c)
    expect(threadsFor(all, 's1').map((t) => t.title)).toEqual(['B', 'A'])
    all = setArchived(all, b.id, true)
    expect(threadsFor(all, 's1').map((t) => t.title)).toEqual(['A'])
    expect(threadsFor(all, 's1', true).map((t) => t.title)).toEqual(['B'])
    all = setArchived(all, b.id, false)
    expect(threadsFor(all, 's1')).toHaveLength(2)
  })
})

describe('consulta con GPT (simulada, sin gastar cuota)', () => {
  const deps = (consult: GptDeps['consult'], desktop = true): GptDeps => ({ desktop: () => desktop, diskPath: async () => null, consult })

  it('agrega el mensaje del director y la respuesta con propuestas pendientes; la escena no cambia', async () => {
    const { project, scenes, scene } = sample()
    const consult = vi.fn(async () => JSON.stringify(answer([prop({})])))
    const thread = newThread(scene.id, 't')
    const r = await runScriptConsult(project, scenes, scene, thread, ' Mejora los diálogos ', deps(consult))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(consult).toHaveBeenCalledOnce()
    const args = (consult.mock.calls[0] as unknown as [Parameters<GptDeps['consult']>[0]])[0]
    expect(args.images).toEqual([])
    expect(args.schema).toBe(schemaText)
    expect(r.thread.messages.map((m) => m.from)).toEqual(['director', 'gpt'])
    expect(r.thread.messages[0].text).toBe('Mejora los diálogos')
    expect(r.thread.messages[1].proposals![0].status).toBe('pending')
    expect(r.thread.summary).toBe('El director quiere diálogos más cálidos.')
    expect(r.thread.seen).toEqual(seenOf(project, scene))
    expect(scene.script.dialogue).toBe(DIALOGUE)
  })

  it('en la web avisa con calma y no consulta', async () => {
    const { project, scenes, scene } = sample()
    const consult = vi.fn(async () => '')
    const r = await runScriptConsult(project, scenes, scene, newThread(scene.id, 't'), 'x', deps(consult, false))
    expect(r).toEqual({ ok: false, kind: 'web', message: GPT_ERROR_TEXT.web })
    expect(consult).not.toHaveBeenCalled()
  })

  it('formato malo, cuota, sesión o tiempo: mensaje amable y el hilo queda igual', async () => {
    const { project, scenes, scene } = sample()
    const thread: GptThread = newThread(scene.id, 't')
    const cases: [GptDeps['consult'], string][] = [
      [async () => '{"x":1}', 'bad-format'],
      [async () => Promise.reject(new Error('usage limit reached')), 'quota'],
      [async () => Promise.reject(new Error('Not logged in')), 'no-login'],
      [async () => Promise.reject(new Error('TIMEOUT')), 'timeout'],
      [async () => Promise.reject(new Error('NO_CODEX')), 'no-codex'],
    ]
    for (const [consult, kind] of cases) {
      const r = await runScriptConsult(project, scenes, scene, thread, 'x', deps(consult))
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.kind).toBe(kind)
    }
    expect(thread.messages).toEqual([])
  })
})
