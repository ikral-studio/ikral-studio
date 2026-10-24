// Fase 3d: «Consultar GPT» en cobertura y planos. GPT simulado (sin gastar cuota); el store es el real.
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { useProject } from '../stores/projectStore'
import { runCoverageConsult, type GptDeps } from '../features/gpt/client'
import {
  acceptCoverageProposal,
  buildCoveragePacket,
  coverageChangesSince,
  coverageClaudeText,
  coverageKey,
  coverageSeenOf,
  describeCoverageProposal,
  discardCoverageProposal,
  editCoverageProposal,
  isCoverageStale,
  markCoverageAskedClaude,
  parseCoverageKey,
  parseCoverageResponse,
  toCoverageProposals,
  undoCoverageProposal,
  type CoverageOps,
  type CoverageProposal,
  type CoverageProposalRef,
  type CoverageResponse,
  type CoverageSeen,
  type CoverageThread,
} from '../features/gpt/coverage'
import { hasCoverage, shotsOf } from '../features/coverage/shots'
import { orderedScenes } from '../features/script-sync/derive'
import { addMessage, mergeSection, newThread, threadsFor, type StoredThread } from '../features/gpt/threads'
import { GPT_ERROR_TEXT } from '../features/gpt/proposals'
import schemaText from '../features/gpt/schemas/coverage.json?raw'

const st = useProject.getState
const ops = (): CoverageOps => ({
  scene: (id) => st().scenes[id],
  addShot: st().addShot,
  moveShot: st().moveShot,
  updateShot: st().updateShot,
  updateShotFramePlan: st().updateShotFramePlan,
  removeShot: st().removeShot,
})
const ordered = () => orderedScenes(st().project!, st().scenes)

beforeAll(async () => {
  await st().init()
  await st().newProject('Caldo')
  const abuela = st().addCharacter('Abuela')!
  st().updateCharacter(abuela, { description: 'Señora de 70 años, rebozo azul.' })
  st().setStyle({ notes: 'Luz cálida de tarde.' })
  st().addDecision('La abuela nunca grita.', { proposedBy: 'director', approve: true })
  st().addDecision('PROPUESTA-SECRETA', { proposedBy: 'claude' })
})

/** Escena nueva con acción y diálogo. `covered` = con cobertura de 2 planos. */
async function scene(covered: boolean) {
  const id = st().addScene()!
  const sc = st().scenes[id]
  st().updateScene(id, { title: 'Cocina', script: { ...sc.script, action: 'La abuela sirve el caldo.', dialogue: 'Abuela: —Siéntate.', cameraDirection: 'General' } })
  if (covered) {
    await st().convertToCoverage(id)
    const first = st().scenes[id].shots![0].id
    st().updateShot(id, first, { name: 'General', duration: 4, cameraDirection: 'Plano general fijo' })
    const second = st().addShot(id)!
    st().updateShot(id, second, { name: 'Detalle', duration: 2, action: 'El caldo humea.' })
  }
  return id
}

const answer = (propuestas: CoverageResponse['propuestas']): CoverageResponse => ({ respuesta: 'Ideas.', resumen_hilo: 'Armamos la cobertura.', propuestas })
const prop = (p: Partial<CoverageResponse['propuestas'][number]>): CoverageResponse['propuestas'][number] => ({
  tipo: 'cambiar',
  plano: 1,
  campo: 'camara',
  texto: 'Plano medio con dolly lento',
  nombre: null,
  duracion: null,
  camara: null,
  accion: null,
  sonido: null,
  motivo: 'Más íntimo.',
  ...p,
})
const add = (p: Partial<CoverageResponse['propuestas'][number]> = {}) =>
  prop({ tipo: 'agregar_plano', plano: 2, campo: null, texto: 'Reacción', nombre: 'Reacción de Beto', duracion: 2.5, camara: 'Primer plano', accion: 'Beto sonríe.', sonido: 'Cuchara', ...p })

function withProposals(sceneId: string, key: string, propuestas: CoverageResponse['propuestas']) {
  let t = newThread<CoverageProposal, CoverageSeen>(key, 'Prueba', '2026-10-24T00:00:00.000Z', 'coverage')
  t = addMessage(t, { from: 'gpt', text: 'Ideas', proposals: toCoverageProposals(answer(propuestas), st().scenes[sceneId], key) })
  const m = t.messages[0]
  const ref = (k = 0): CoverageProposalRef => ({ threadId: t.id, messageId: m.id, proposalId: m.proposals![k].id })
  return { threads: [t] as CoverageThread[], ref, proposals: m.proposals! }
}

describe('paquete de cobertura y planos', () => {
  it('cobertura: lleva la escena, sus planos y solo decisiones aprobadas', async () => {
    const id = await scene(true)
    const sc = st().scenes[id]
    const r = buildCoveragePacket(st().project!, ordered(), sc, coverageKey(id), newThread(id, 't', undefined, 'coverage'), 'Propón planos')!
    expect(r.prompt).toContain('cobertura de UNA escena')
    expect(r.prompt).toContain('La abuela sirve el caldo.')
    expect(r.prompt).toContain('Siéntate')
    expect(r.prompt).toContain('1. «General» · 4 s')
    expect(r.prompt).toContain('Plano general fijo')
    expect(r.prompt).toContain('2. «Detalle» · 2 s')
    expect(r.prompt).toContain('Luz cálida de tarde.')
    expect(r.prompt).toContain('rebozo azul')
    expect(r.prompt).toContain('La abuela nunca grita.')
    expect(r.prompt).not.toContain('PROPUESTA-SECRETA')
    expect(r.prompt).not.toContain('Prompt de video')
    expect(r.prompt).toContain('Pedido del director: Propón planos')
    expect(r.prompt).not.toContain('Esto cambió desde la última vez')
    expect(r.seen).toEqual(coverageSeenOf(st().project!, sc))
  })

  it('plano: lleva sus prompts de hoy y pide cámara, imagen y video', async () => {
    const id = await scene(true)
    const shot = st().scenes[id].shots![1]
    st().updateShotFramePlan(id, shot.id, 'start', { prompt: 'PROMPT-INICIAL' })
    st().updateShot(id, shot.id, { generationPrompt: 'PROMPT-VIDEO' })
    const key = coverageKey(id, shot.id)
    expect(parseCoverageKey(key)).toEqual({ sceneId: id, shotId: shot.id })
    const r = buildCoveragePacket(st().project!, ordered(), st().scenes[id], key, newThread(key, 't', undefined, 'coverage'), 'Diseña la cámara')!
    expect(r.prompt).toContain('diseñar UN plano')
    expect(r.prompt).toContain('Plano a diseñar: 2 «Detalle»')
    expect(r.prompt).toContain('Prompt de imagen inicial: PROMPT-INICIAL')
    expect(r.prompt).toContain('Prompt de imagen final: (vacío)')
    expect(r.prompt).toContain('Prompt de video: PROMPT-VIDEO')
    // Un plano que ya no existe: no hay paquete.
    expect(buildCoveragePacket(st().project!, ordered(), st().scenes[id], coverageKey(id, 'no-existe'), newThread(key, 't'), 'x')).toBeNull()
  })

  it('escena sin cobertura: va como un solo plano', async () => {
    const id = await scene(false)
    const r = buildCoveragePacket(st().project!, ordered(), st().scenes[id], id, newThread(id, 't', undefined, 'coverage'), 'Propón planos')!
    expect(r.prompt).toContain('aún es un solo plano')
    expect(r.prompt).toContain('1. «Cocina»')
  })

  it('historial y cambios desde la última vez', async () => {
    const id = await scene(true)
    let t = newThread<CoverageProposal, CoverageSeen>(id, 't', undefined, 'coverage')
    t = { ...t, seen: coverageSeenOf(st().project!, st().scenes[id]), summary: 'Hablamos de la cocina.' }
    for (let k = 0; k < 8; k++) t = addMessage(t, { from: k % 2 ? 'gpt' : 'director', text: `Mensaje ${k}` })
    st().addShot(id)
    const sc = st().scenes[id]
    expect(coverageChangesSince(t.seen, coverageSeenOf(st().project!, sc))).toEqual(['La lista de planos cambió.'])
    const r = buildCoveragePacket(st().project!, ordered(), sc, id, t, 'Sigue')!
    expect(r.prompt).toContain('Esto cambió desde la última vez')
    expect(r.prompt).toContain('Hablamos de la cocina.')
    expect(r.prompt).toContain('Mensaje 7')
    expect(r.prompt).not.toContain('Mensaje 1\n')
  })
})

describe('respuesta de GPT', () => {
  it('el esquema es estricto y el formato malo no se usa', () => {
    const schema = JSON.parse(schemaText)
    expect(schema.additionalProperties).toBe(false)
    expect(schema.required).toEqual(['respuesta', 'resumen_hilo', 'propuestas'])
    const item = schema.properties.propuestas.items
    expect(item.required.sort()).toEqual(Object.keys(item.properties).sort())
    expect(parseCoverageResponse('no es json')).toEqual({ ok: false, error: 'bad-format' })
    expect(parseCoverageResponse(JSON.stringify({ respuesta: 'x' }))).toEqual({ ok: false, error: 'bad-format' })
    expect(parseCoverageResponse(JSON.stringify(answer([prop({ campo: 'inventado' as 'camara' })]))).ok).toBe(false)
    expect(parseCoverageResponse(JSON.stringify(answer([prop({}), add()]))).ok).toBe(true)
  })

  it('ignora lo que no vale en el apartado, planos que no existen, iguales y duraciones malas', async () => {
    const id = await scene(true)
    const sc = st().scenes[id]
    const shot = sc.shots![0].id
    const cov = toCoverageProposals(
      answer([
        prop({ plano: 9 }),
        prop({ campo: 'prompt_video' }),
        prop({ texto: 'Plano general fijo' }),
        prop({ campo: 'duracion', texto: 'mucho' }),
        prop({ campo: 'duracion', texto: '5,5' }),
        add({ plano: 7 }),
        add(),
      ]),
      sc,
      id,
    )
    expect(cov.map((p) => [p.kind, p.field, p.text])).toEqual([
      ['edit', 'duration', '5.5'],
      ['add-shot', undefined, 'Reacción de Beto'],
    ])
    // En un plano: no se agregan planos y el plano es siempre el suyo (aunque GPT diga otro número).
    const one = toCoverageProposals(answer([add(), prop({ plano: 2, campo: 'prompt_imagen_inicial', texto: 'Cuadro fijo' }), prop({ campo: 'accion', texto: 'x' })]), sc, coverageKey(id, shot))
    expect(one.map((p) => [p.field, p.shotId, p.shot])).toEqual([['imageStart', shot, 1]])
  })
})

describe('Aceptar, Editar, Descartar, Pedir a Claude y Deshacer', () => {
  it('cambiar la cámara de un plano y deshacerlo', async () => {
    const id = await scene(true)
    const shot = st().scenes[id].shots![0].id
    const { threads, ref } = withProposals(id, id, [prop({})])
    const r = acceptCoverageProposal(threads, ref(), id, ops())
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(st().scenes[id].shots![0].cameraDirection).toBe('Plano medio con dolly lento')
    expect(r.threads[0].messages[0].proposals![0].status).toBe('accepted')
    // Aceptar dos veces no hace nada.
    expect(acceptCoverageProposal(r.threads, ref(), id, ops())).toEqual({ ok: false, error: 'not-pending' })
    const u = undoCoverageProposal(r.threads, ref(), id, ops())
    expect(u.ok).toBe(true)
    expect(st().scenes[id].shots!.find((s) => s.id === shot)!.cameraDirection).toBe('Plano general fijo')
    if (u.ok) expect(u.threads[0].messages[0].proposals![0].status).toBe('pending')
  })

  it('prompts de imagen inicial/final y de video de un plano', async () => {
    const id = await scene(true)
    const shot = st().scenes[id].shots![1].id
    const key = coverageKey(id, shot)
    const { threads, ref } = withProposals(id, key, [
      prop({ campo: 'prompt_imagen_inicial', texto: 'Caldo humeando, luz cálida' }),
      prop({ campo: 'prompt_imagen_final', texto: 'Plato vacío' }),
      prop({ campo: 'prompt_video', texto: 'Dolly in lento al plato' }),
    ])
    let cur = threads
    for (const k of [0, 1, 2]) {
      const r = acceptCoverageProposal(cur, ref(k), id, ops())
      expect(r.ok).toBe(true)
      if (r.ok) cur = r.threads
    }
    const sh = st().scenes[id].shots!.find((s) => s.id === shot)!
    expect(sh.prep?.start?.prompt).toBe('Caldo humeando, luz cálida')
    expect(sh.prep?.end?.prompt).toBe('Plato vacío')
    expect(sh.generationPrompt).toBe('Dolly in lento al plato')
    const u = undoCoverageProposal(cur, ref(2), id, ops())
    expect(u.ok).toBe(true)
    expect(st().scenes[id].shots!.find((s) => s.id === shot)!.generationPrompt).toBeUndefined()
  })

  it('agregar un plano en su lugar; Deshacer lo manda a la papelera', async () => {
    const id = await scene(true)
    const { threads, ref } = withProposals(id, id, [add({ plano: 1 }), add({ plano: 0, nombre: 'Apertura' })])
    const r = acceptCoverageProposal(threads, ref(), id, ops())
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const names = () => shotsOf(st().scenes[id]).map((s) => s.name)
    expect(names()).toEqual(['General', 'Reacción de Beto', 'Detalle'])
    const added = shotsOf(st().scenes[id])[1]
    expect([added.duration, added.cameraDirection, added.action, added.sound]).toEqual([2.5, 'Primer plano', 'Beto sonríe.', 'Cuchara'])
    // La segunda era sobre la lista vieja: ahora avisa.
    expect(isCoverageStale(r.threads[0].messages[0].proposals![1], st().scenes[id])).toBe(true)
    const r2 = acceptCoverageProposal(r.threads, ref(1), id, ops())
    expect(r2.ok).toBe(true)
    expect(names()).toEqual(['Apertura', 'General', 'Reacción de Beto', 'Detalle'])
    if (!r2.ok) return
    const trash = st().project!.trash?.length ?? 0
    const u = undoCoverageProposal(r2.threads, ref(), id, ops())
    expect(u.ok).toBe(true)
    expect(names()).toEqual(['Apertura', 'General', 'Detalle'])
    expect(st().project!.trash!.length).toBe(trash + 1)
  })

  it('no deshace si el plano se editó después', async () => {
    const id = await scene(true)
    const { threads, ref } = withProposals(id, id, [prop({}), add()])
    let r = acceptCoverageProposal(threads, ref(), id, ops())
    if (!r.ok) throw new Error('no aceptó')
    r = acceptCoverageProposal(r.threads, ref(1), id, ops())
    if (!r.ok) throw new Error('no aceptó')
    const sh = st().scenes[id].shots!
    st().updateShot(id, sh[0].id, { cameraDirection: 'Lo cambié yo' })
    st().updateShot(id, r.shotId, { name: 'Mío' })
    expect(undoCoverageProposal(r.threads, ref(), id, ops())).toEqual({ ok: false, error: 'changed' })
    expect(undoCoverageProposal(r.threads, ref(1), id, ops())).toEqual({ ok: false, error: 'changed' })
    expect(st().scenes[id].shots!.length).toBe(3)
  })

  it('escena sin cobertura: hay que pasar a cobertura antes (con respaldo) y sigue al plano', async () => {
    const id = await scene(false)
    const { threads, ref, proposals } = withProposals(id, id, [prop({ texto: 'Cenital' })])
    expect(proposals[0].shotId).toBe(`${id}~1`)
    expect(acceptCoverageProposal(threads, ref(), id, ops())).toEqual({ ok: false, error: 'needs-coverage' })
    expect(st().scenes[id].script.cameraDirection).toBe('General')
    await st().convertToCoverage(id)
    expect(hasCoverage(st().scenes[id])).toBe(true)
    // El plano cambió de id al pasar a cobertura, pero sigue igual en su lugar: no es vieja.
    expect(isCoverageStale(proposals[0], st().scenes[id])).toBe(false)
    const r = acceptCoverageProposal(threads, ref(), id, ops())
    expect(r.ok).toBe(true)
    expect(st().scenes[id].shots![0].cameraDirection).toBe('Cenital')
  })

  it('propuesta vieja avisa; Editar, Descartar y Pedir a Claude', async () => {
    const id = await scene(true)
    const { threads, ref, proposals } = withProposals(id, id, [prop({}), prop({ campo: 'duracion', texto: '6' }), prop({ plano: 2, campo: 'sonido', texto: 'Burbujeo' })])
    expect(isCoverageStale(proposals[0], st().scenes[id])).toBe(false)
    st().updateShot(id, st().scenes[id].shots![0].id, { cameraDirection: 'Otra' })
    expect(isCoverageStale(proposals[0], st().scenes[id])).toBe(true)
    expect(isCoverageStale(proposals[0], undefined)).toBe(true)

    let cur = editCoverageProposal(threads, ref(1), 'no es número')
    expect(cur[0].messages[0].proposals![1].text).toBe('6')
    cur = editCoverageProposal(cur, ref(1), '7')
    const r = acceptCoverageProposal(cur, ref(1), id, ops())
    expect(r.ok).toBe(true)
    expect(st().scenes[id].shots![0].duration).toBe(7)

    cur = discardCoverageProposal(cur, ref(2), '2026-10-24T01:00:00.000Z')
    expect(cur[0].messages[0].proposals![2].status).toBe('discarded')
    const back = undoCoverageProposal(cur, ref(2), id, ops())
    expect(back.ok && back.threads[0].messages[0].proposals![2].status).toBe('pending')

    const asked = markCoverageAskedClaude(cur, ref(0))
    expect(asked[0].messages[0].proposals![0].status).toBe('asked-claude')
    const text = coverageClaudeText(proposals[2], 3)
    expect(text).toContain('cobertura de la escena 03')
    expect(text).toContain('Cambiar el sonido del plano 2 a: «Burbujeo»')
    expect(text).toContain('sin tocar el Canon')
    expect(describeCoverageProposal(proposals[1])).toBe('Cambiar la duración del plano 1 a: 6 s')
  })
})

describe('consulta con GPT simulado', () => {
  it('en la web avisa «Disponible en la app de Mac» y no llama a GPT', async () => {
    const id = await scene(true)
    const consult = vi.fn()
    const deps: GptDeps = { desktop: () => false, diskPath: async () => null, consult }
    const r = await runCoverageConsult(st().project!, ordered(), st().scenes[id], id, newThread(id, 't', undefined, 'coverage'), 'x', deps)
    expect(r).toEqual({ ok: false, kind: 'web', message: GPT_ERROR_TEXT.web })
    expect(consult).not.toHaveBeenCalled()
  })

  it('agrega el mensaje y la respuesta con propuestas pendientes, sin cambiar nada', async () => {
    const id = await scene(true)
    const before = JSON.stringify(st().scenes[id])
    const consult = vi.fn(async () => JSON.stringify(answer([add()])))
    const deps: GptDeps = { desktop: () => true, diskPath: async () => null, consult }
    const r = await runCoverageConsult(st().project!, ordered(), st().scenes[id], id, newThread(id, 't', undefined, 'coverage'), 'Propón planos', deps)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const args = (consult.mock.calls[0] as unknown as [Parameters<GptDeps['consult']>[0]])[0]
    expect(args.schema).toBe(schemaText)
    expect(args.images).toEqual([])
    expect(r.thread.section).toBe('coverage')
    expect(r.thread.messages.map((m) => m.from)).toEqual(['director', 'gpt'])
    expect(r.thread.messages[1].proposals![0].status).toBe('pending')
    expect(r.thread.summary).toBe('Armamos la cobertura.')
    expect(JSON.stringify(st().scenes[id])).toBe(before)
  })

  it('formato malo, plano que no existe y errores: el hilo queda igual', async () => {
    const id = await scene(true)
    const t = newThread<CoverageProposal, CoverageSeen>(id, 't', undefined, 'coverage')
    const bad: GptDeps = { desktop: () => true, diskPath: async () => null, consult: async () => '{"nada":1}' }
    expect(await runCoverageConsult(st().project!, ordered(), st().scenes[id], id, t, 'x', bad)).toMatchObject({ ok: false, kind: 'bad-format' })
    const gone = await runCoverageConsult(st().project!, ordered(), st().scenes[id], coverageKey(id, 'no'), t, 'x', bad)
    expect(gone).toMatchObject({ ok: false, kind: 'bad-format' })
    const boom: GptDeps = { desktop: () => true, diskPath: async () => null, consult: async () => Promise.reject(new Error('timeout')) }
    const r = await runCoverageConsult(st().project!, ordered(), st().scenes[id], id, t, 'x', boom)
    expect(r.ok).toBe(false)
    expect(t.messages).toEqual([])
  })

  it('los hilos de cobertura no pisan los del guion ni de la Biblia', async () => {
    const id = await scene(true)
    const script = newThread(id, 'guion')
    const bible = newThread('style', 'biblia', undefined, 'bible')
    const cov = newThread(id, 'cobertura', undefined, 'coverage')
    const shot = newThread(coverageKey(id, 'sh'), 'plano', undefined, 'coverage')
    const disk = [script, bible] as unknown as StoredThread[]
    const merged = mergeSection(disk, [cov, shot] as unknown as StoredThread[], 'coverage')
    expect(merged.map((t) => t.title).sort()).toEqual(['biblia', 'cobertura', 'guion', 'plano'])
    expect(threadsFor(merged, id, false, 'coverage').map((t) => t.title)).toEqual(['cobertura'])
    expect(threadsFor(merged, id).map((t) => t.title)).toEqual(['guion'])
  })
})
