// Fase 3c: «Consultar GPT» en personajes y Biblia. GPT simulado (sin gastar cuota); el store es el real.
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { useProject } from '../stores/projectStore'
import { runBibleConsult, type GptDeps } from '../features/gpt/client'
import {
  acceptBibleProposal,
  bibleChangesSince,
  bibleClaudeText,
  bibleSeenOf,
  buildBiblePacket,
  canEditBible,
  describeBibleProposal,
  discardBibleProposal,
  editBibleProposal,
  isBibleStale,
  markBibleAskedClaude,
  parseBibleResponse,
  targetKey,
  toBibleProposals,
  undoBibleProposal,
  type BibleOps,
  type BibleProposal,
  type BibleProposalRef,
  type BibleResponse,
  type BibleSeen,
  type BibleThread,
} from '../features/gpt/bible'
import { addMessage, mergeSection, newThread, threadsFor, type StoredThread } from '../features/gpt/threads'
import { GPT_ERROR_TEXT } from '../features/gpt/proposals'
import schemaText from '../features/gpt/schemas/bible.json?raw'

const st = useProject.getState
const ops = (): BibleOps => ({
  project: () => st().project,
  setStyle: st().setStyle,
  setBible: st().setBible,
  updateCharacter: st().updateCharacter,
  updateItem: st().updateItem,
  addRelation: st().addRelation,
  removeRelation: st().removeRelation,
  addDecision: st().addDecision,
  approveDecision: st().approveDecision,
  removeDecision: st().removeDecision,
})

let abuela = ''
let beto = ''
let taza = ''
let antes = ''
let despues = ''

beforeAll(async () => {
  await st().init()
  await st().newProject('Caldo')
  abuela = st().addCharacter('Abuela')!
  beto = st().addCharacter('Beto')!
  st().updateCharacter(abuela, { description: 'Señora de 70 años, rebozo azul.', role: 'abuela' })
  taza = st().addItem('props', 'Taza', { description: 'Taza de peltre blanca.' })!
  antes = st().addPhase('Antes')!
  despues = st().addPhase('Después')!
  st().setStyle({ notes: 'Luz cálida de tarde.' })
  st().addDecision('La abuela nunca grita.', { proposedBy: 'director', approve: true })
  st().addDecision('PROPUESTA-SECRETA', { proposedBy: 'claude' })
})

const answer = (propuestas: BibleResponse['propuestas']): BibleResponse => ({ respuesta: 'Ideas.', resumen_hilo: 'Afinamos a la abuela.', propuestas })
const prop = (p: Partial<BibleResponse['propuestas'][number]>): BibleResponse['propuestas'][number] => ({ tipo: 'descripcion', con: null, texto: 'Señora de 70 años, rebozo azul y lentes.', motivo: 'Más clara.', ...p })

function withProposals(key: string, propuestas: BibleResponse['propuestas']) {
  let t = newThread<BibleProposal, BibleSeen>(key, 'Prueba', '2026-10-24T00:00:00.000Z', 'bible')
  t = addMessage(t, { from: 'gpt', text: 'Ideas', proposals: toBibleProposals(answer(propuestas), st().project!, key) })
  const m = t.messages[0]
  const ref = (k = 0): BibleProposalRef => ({ threadId: t.id, messageId: m.id, proposalId: m.proposals![k].id })
  return { threads: [t] as BibleThread[], ref, proposals: m.proposals! }
}

describe('paquete de la Biblia', () => {
  it('lleva el apartado, el resto de la Biblia y solo decisiones aprobadas', () => {
    const key = targetKey('characters', abuela)
    const r = buildBiblePacket(st().project!, key, newThread(key, 't', undefined, 'bible'), 'Hazla más clara')!
    expect(r.prompt).toContain('Personaje «Abuela»')
    expect(r.prompt).toContain('rebozo azul')
    expect(r.prompt).toContain('- Beto')
    expect(r.prompt).toContain('Taza')
    expect(r.prompt).toContain('Luz cálida de tarde.')
    expect(r.prompt).toContain('Antes → Después')
    expect(r.prompt).toContain('La abuela nunca grita.')
    expect(r.prompt).not.toContain('PROPUESTA-SECRETA')
    expect(r.prompt).toContain('Pedido del director: Hazla más clara')
    expect(r.prompt).not.toContain('Esto cambió desde la última vez')
    expect(buildBiblePacket(st().project!, 'characters:nada', newThread('x', 't'), 'x')).toBeNull()
  })

  it('avisa «esto cambió desde la última vez»', () => {
    const key = targetKey('props', taza)
    const t = { ...newThread<BibleProposal, BibleSeen>(key, 't', undefined, 'bible'), seen: { ...bibleSeenOf(st().project!, key), target: 'viejo', decisionIds: [] } }
    const { prompt } = buildBiblePacket(st().project!, key, t, 'Sigue')!
    expect(prompt).toContain('Esto cambió desde la última vez')
    expect(prompt).toContain('Este apartado cambió.')
    expect(prompt).toContain('Las decisiones aprobadas del director cambiaron.')
    expect(bibleChangesSince(bibleSeenOf(st().project!, key), bibleSeenOf(st().project!, key))).toEqual([])
  })

  it('lleva el guion ya guardado: la historia en orden y las escenas donde aparece la locación', () => {
    const cocina = st().addItem('locations', 'Cocina', { aliases: ['fogón'] })!
    const titles = ['INT. COCINA - DÍA', 'EXT. MERCADO - DÍA', 'INT. SALA - NOCHE']
    const actions = ['La abuela pone el caldo en la estufa.', 'Beto compra cebollas.', 'Beto vuelve y prende el fogón otra vez.']
    titles.forEach((title, i) => {
      const id = st().addScene()!
      st().updateScene(id, { title })
      st().updateScript(id, 'action', actions[i])
    })
    st().updateScript(st().project!.sceneIds.at(-1)!, 'dialogue', 'BETO: Ya huele a caldo.')
    const scenes = st().project!.sceneIds.map((id) => st().scenes[id])
    const key = targetKey('locations', cocina)
    const { prompt } = buildBiblePacket(st().project!, key, newThread(key, 't', undefined, 'bible'), '¿Cómo pasa del papel a la app?', scenes)!
    expect(prompt).toContain('no pidas que te peguen el guion')
    expect(prompt).toContain('Historia (escenas del guion guardado, en orden):')
    expect(prompt).toContain('«EXT. MERCADO - DÍA»: Beto compra cebollas.')
    expect(prompt).toContain('Escenas donde aparece Locación «Cocina»:')
    const where = prompt.split('Escenas donde aparece')[1]
    expect(where).toContain('Escena 1 · «INT. COCINA - DÍA»')
    expect(where).toContain('Diálogo: BETO: Ya huele a caldo.')
    expect(where).not.toContain('MERCADO')
    // Sin escenas lo dice claro (no inventa ni pide el guion).
    expect(buildBiblePacket(st().project!, key, newThread(key, 't', undefined, 'bible'), 'x')!.prompt).toContain('(el proyecto aún no tiene escenas)')
  })

  it('el esquema es estricto y el formato malo no se usa', () => {
    const schema = JSON.parse(schemaText)
    expect(schema.additionalProperties).toBe(false)
    expect(schema.required).toEqual(['respuesta', 'resumen_hilo', 'propuestas'])
    expect(parseBibleResponse('no es json')).toEqual({ ok: false, error: 'bad-format' })
    expect(parseBibleResponse(JSON.stringify({ respuesta: 'x' }))).toEqual({ ok: false, error: 'bad-format' })
    expect(parseBibleResponse(JSON.stringify(answer([prop({ tipo: 'inventado' as 'regla' })]))).ok).toBe(false)
    expect(parseBibleResponse(JSON.stringify(answer([prop({})]))).ok).toBe(true)
  })

  it('ignora tipos que no valen en el apartado, iguales, vacíos o con nombres que no existen', () => {
    const p = st().project!
    const char = toBibleProposals(
      answer([prop({ tipo: 'epoca', texto: '1980' }), prop({ tipo: 'alias', texto: 'x' }), prop({ texto: 'Señora de 70 años, rebozo azul.' }), prop({ tipo: 'papel', texto: ' ' }), prop({ tipo: 'relacion', con: 'Nadie', texto: 'prima' }), prop({ tipo: 'relacion', con: 'Abuela', texto: 'ella misma' }), prop({ tipo: 'relacion', con: 'beto', texto: 'nieto' })]),
      p,
      targetKey('characters', abuela),
    )
    expect(char.map((x) => x.kind)).toEqual(['relation'])
    const style = toBibleProposals(answer([prop({ tipo: 'descripcion' }), prop({ tipo: 'aspecto', texto: 'no existe' }), prop({ tipo: 'epoca', texto: '1985' })]), p, 'style')
    expect(style.map((x) => x.field)).toEqual(['era'])
    const item = toBibleProposals(answer([prop({ tipo: 'etapas', texto: 'Antes, Nunca' }), prop({ tipo: 'etapas', texto: 'Después' }), prop({ tipo: 'alias', texto: 'tacita,  pocillo' })]), p, targetKey('props', taza))
    expect(item.map((x) => [x.field, x.text])).toEqual([
      ['onlyIn', despues],
      ['aliases', 'tacita, pocillo'],
    ])
    expect(toBibleProposals(answer(Array.from({ length: 12 }, (_, k) => prop({ tipo: 'regla', texto: `Regla ${k}` }))), p, 'style')).toHaveLength(8)
  })

  it('etapas y decisiones: solo reglas, con las etapas y lo que solo existe en una', () => {
    st().updateItem('props', taza, { onlyIn: [antes] })
    const r = buildBiblePacket(st().project!, 'rules', newThread('rules', 't', undefined, 'bible'), 'Propón reglas')!
    expect(r.prompt).toContain('Apartado: Etapas y decisiones')
    expect(r.prompt).toContain('- Taza: solo en Antes')
    expect(r.images).toEqual([])
    const ps = toBibleProposals(answer([prop({ tipo: 'epoca', texto: '1990' }), prop({ tipo: 'regla', texto: 'La taza no aparece después.' })]), st().project!, 'rules')
    expect(ps.map((x) => x.kind)).toEqual(['rule'])
    st().updateItem('props', taza, { onlyIn: undefined })
  })

  it('la ficha con imagen Canon la manda en miniatura; sin imagen, nada', () => {
    st().updateCharacter(beto, { imageId: 'img-beto' })
    const key = targetKey('characters', beto)
    const r = buildBiblePacket(st().project!, key, newThread(key, 't', undefined, 'bible'), 'x')!
    expect(r.images).toEqual(['img-beto'])
    expect(r.prompt).toContain('imagen Canon')
    expect(buildBiblePacket(st().project!, 'style', newThread('style', 't', undefined, 'bible'), 'x')!.images).toEqual([])
    st().updateCharacter(beto, { imageId: undefined })
  })
})

describe('Aceptar · Deshacer · Descartar · Editar · Pedir a Claude (store real, con deshacer)', () => {
  it('campo de personaje: aplica y se deshace', () => {
    const key = targetKey('characters', abuela)
    const { threads, ref } = withProposals(key, [prop({})])
    const r = acceptBibleProposal(threads, ref(), ops())
    expect(r.ok).toBe(true)
    expect(st().project!.characters!.find((c) => c.id === abuela)!.description).toBe('Señora de 70 años, rebozo azul y lentes.')
    if (!r.ok) return
    expect(acceptBibleProposal(r.threads, ref(), ops())).toEqual({ ok: false, error: 'not-pending' })
    const u = undoBibleProposal(r.threads, ref(), ops())
    expect(u.ok && u.threads[0].messages[0].proposals![0].status).toBe('pending')
    expect(st().project!.characters!.find((c) => c.id === abuela)!.description).toBe('Señora de 70 años, rebozo azul.')
  })

  it('estilo: notas, época y colores; el Deshacer de la app también lo regresa', () => {
    const { threads, ref } = withProposals('style', [prop({ tipo: 'notas_estilo', texto: 'Luz cálida y sombras suaves.' }), prop({ tipo: 'colores', texto: 'Alegres' }), prop({ tipo: 'aspecto', texto: 'cartoon' })])
    let cur = threads
    for (const k of [0, 1, 2]) {
      const r = acceptBibleProposal(cur, ref(k), ops())
      expect(r.ok).toBe(true)
      if (r.ok) cur = r.threads
    }
    expect(st().project!.style?.notes).toBe('Luz cálida y sombras suaves.')
    expect(st().project!.bible?.look).toBe('cartoon')
    expect(st().project!.bible?.mood).toBe('alegre')
    st().undo()
    expect(st().project!.bible?.look).toBeUndefined()
    const u = undoBibleProposal(cur, ref(0), ops())
    expect(u.ok).toBe(true)
    expect(st().project!.style?.notes).toBe('Luz cálida de tarde.')
    expect(canEditBible(cur[0].messages[0].proposals![1])).toBe(false)
  })

  it('relación y regla: la regla entra como decisión de GPT aprobada por el director', () => {
    const key = targetKey('characters', abuela)
    const { threads, ref } = withProposals(key, [prop({ tipo: 'relacion', con: 'Beto', texto: 'nieto consentido' }), prop({ tipo: 'regla', texto: 'El rebozo siempre es azul.' })])
    const r1 = acceptBibleProposal(threads, ref(0), ops())
    if (!r1.ok) throw new Error('no aceptó la relación')
    expect(st().project!.relations!.some((x) => x.a === abuela && x.b === beto && x.label === 'nieto consentido')).toBe(true)
    const r2 = acceptBibleProposal(r1.threads, ref(1), ops())
    if (!r2.ok) throw new Error('no aceptó la regla')
    const d = st().project!.decisions!.find((x) => x.text === 'El rebozo siempre es azul.')!
    expect(d).toMatchObject({ proposedBy: 'gpt', status: 'approved', itemIds: [abuela] })
    const u2 = undoBibleProposal(r2.threads, ref(1), ops())
    const u1 = u2.ok && undoBibleProposal(u2.threads, ref(0), ops())
    expect(u1 && u1.ok).toBe(true)
    expect(st().project!.decisions!.some((x) => x.text === 'El rebozo siempre es azul.')).toBe(false)
    expect(st().project!.relations!.some((x) => x.label === 'nieto consentido')).toBe(false)
  })

  it('objeto: alias y etapas; Deshacer no pisa lo editado después', () => {
    const key = targetKey('props', taza)
    const { threads, ref } = withProposals(key, [prop({ tipo: 'alias', texto: 'tacita, pocillo' }), prop({ tipo: 'etapas', texto: 'Antes' })])
    const r = acceptBibleProposal(threads, ref(0), ops())
    if (!r.ok) throw new Error('no aceptó')
    const r2 = acceptBibleProposal(r.threads, ref(1), ops())
    if (!r2.ok) throw new Error('no aceptó etapas')
    const item = () => st().project!.props!.find((x) => x.id === taza)!
    expect(item().aliases).toEqual(['tacita', 'pocillo'])
    expect(item().onlyIn).toEqual([antes])
    st().updateItem('props', taza, { aliases: ['lo escribí yo'] })
    expect(undoBibleProposal(r2.threads, ref(0), ops())).toEqual({ ok: false, error: 'changed' })
    expect(item().aliases).toEqual(['lo escribí yo'])
    expect(describeBibleProposal(r2.threads[0].messages[0].proposals![1], st().project!)).toBe('Cambiar las etapas donde existe a: «Antes»')
  })

  it('avisa si cambió desde que GPT lo propuso, y no aplica si ya no existe', () => {
    const key = targetKey('props', taza)
    st().updateItem('props', taza, { description: 'Taza de peltre blanca.' })
    const { threads, ref, proposals } = withProposals(key, [prop({ texto: 'Taza de peltre con borde azul.' })])
    expect(isBibleStale(proposals[0], st().project!)).toBe(false)
    st().updateItem('props', taza, { description: 'Taza despostillada.' })
    expect(isBibleStale(proposals[0], st().project!)).toBe(true)
    const gone = { ...proposals[0], target: 'props:nada' }
    expect(isBibleStale(gone, st().project!)).toBe(true)
    const t2 = [{ ...threads[0], messages: [{ ...threads[0].messages[0], proposals: [gone] }] }]
    expect(acceptBibleProposal(t2, ref(), ops())).toEqual({ ok: false, error: 'missing' })
  })

  it('descartar, editar y pedir a Claude no tocan la Biblia', () => {
    const key = targetKey('characters', beto)
    const before = JSON.stringify(st().project)
    const { threads, ref, proposals } = withProposals(key, [prop({ texto: 'Niño de 8 años.' })])
    expect(discardBibleProposal(threads, ref())[0].messages[0].proposals![0].status).toBe('discarded')
    expect(markBibleAskedClaude(threads, ref())[0].messages[0].proposals![0].status).toBe('asked-claude')
    expect(editBibleProposal(threads, ref(), ' Niño de 9 años. ')[0].messages[0].proposals![0].text).toBe('Niño de 9 años.')
    expect(JSON.stringify(st().project)).toBe(before)
    expect(bibleClaudeText(proposals[0], st().project!)).toContain('Personaje «Beto»')
  })
})

describe('hilos guardados por apartado', () => {
  it('guion y Biblia comparten archivo sin pisarse', () => {
    const s = newThread('scene-1', 'Guion')
    const b = newThread('style', 'Biblia', undefined, 'bible')
    const b2 = newThread('style', 'Biblia 2', undefined, 'bible')
    const onDisk = [s, b] as StoredThread[]
    const merged = mergeSection(onDisk, [b2] as StoredThread[], 'bible')
    expect(merged.map((t) => t.title).sort()).toEqual(['Biblia 2', 'Guion'])
    expect(threadsFor(merged, 'scene-1').map((t) => t.title)).toEqual(['Guion'])
    expect(threadsFor(merged, 'style', false, 'bible').map((t) => t.title)).toEqual(['Biblia 2'])
    expect(threadsFor(merged, 'style')).toEqual([])
  })
})

describe('consulta con GPT (simulada, sin gastar cuota)', () => {
  const deps = (consult: GptDeps['consult'], desktop = true): GptDeps => ({ desktop: () => desktop, diskPath: async () => null, consult })

  it('agrega mensajes y propuestas pendientes; la Biblia no cambia', async () => {
    const key = targetKey('characters', abuela)
    const before = JSON.stringify(st().project)
    const consult = vi.fn(async () => JSON.stringify(answer([prop({ texto: 'Señora con rebozo azul y trenza.' })])))
    const scenes = st().project!.sceneIds.map((id) => st().scenes[id])
    const r = await runBibleConsult(st().project!, scenes, key, newThread(key, 't', undefined, 'bible'), ' Más detalle ', deps(consult))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const args = (consult.mock.calls[0] as unknown as [Parameters<GptDeps['consult']>[0]])[0]
    // Lo que de verdad le llega a GPT trae el guion guardado.
    expect(args.prompt).toContain('«INT. COCINA - DÍA»')
    expect(args.prompt).toContain('Escenas donde aparece Personaje «Abuela»:\nEscena 1')
    expect(args.images).toEqual([])
    expect(args.schema).toBe(schemaText)
    expect(r.thread.messages.map((m) => m.from)).toEqual(['director', 'gpt'])
    expect(r.thread.messages[0].text).toBe('Más detalle')
    expect(r.thread.messages[1].proposals![0].status).toBe('pending')
    expect(r.thread.summary).toBe('Afinamos a la abuela.')
    expect(r.thread.seen).toEqual(bibleSeenOf(st().project!, key))
    expect(JSON.stringify(st().project)).toBe(before)
  })

  it('manda la miniatura de la imagen Canon (no el original)', async () => {
    st().updateCharacter(beto, { imageId: 'img-beto' })
    const consult = vi.fn(async () => JSON.stringify(answer([])))
    const d: GptDeps = { desktop: () => true, diskPath: async (id) => ({ file: `/orig/${id}.png`, icon: `/mini/${id}.jpg` }), consult }
    const key = targetKey('characters', beto)
    expect((await runBibleConsult(st().project!, [], key, newThread(key, 't', undefined, 'bible'), 'x', d)).ok).toBe(true)
    expect((consult.mock.calls[0] as unknown as [Parameters<GptDeps['consult']>[0]])[0].images).toEqual(['/mini/img-beto.jpg'])
    st().updateCharacter(beto, { imageId: undefined })
  })

  it('en la web no consulta; formato malo o apartado borrado: el hilo queda igual', async () => {
    const thread = newThread<BibleProposal, BibleSeen>('style', 't', undefined, 'bible')
    const consult = vi.fn(async () => '{"x":1}')
    expect(await runBibleConsult(st().project!, [], 'style', thread, 'x', deps(consult, false))).toEqual({ ok: false, kind: 'web', message: GPT_ERROR_TEXT.web })
    expect(consult).not.toHaveBeenCalled()
    const bad = await runBibleConsult(st().project!, [], 'style', thread, 'x', deps(consult))
    expect(bad.ok === false && bad.kind).toBe('bad-format')
    const gone = await runBibleConsult(st().project!, [], 'props:nada', thread, 'x', deps(consult))
    expect(gone.ok).toBe(false)
    expect(consult).toHaveBeenCalledTimes(1)
    expect(thread.messages).toEqual([])
  })
})
