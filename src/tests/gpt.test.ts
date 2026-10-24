import { describe, expect, it, vi } from 'vitest'
import type { Decision, Scene, Shot } from '../types'
import { buildExample } from '../features/continuity/examples'
import { buildContinuityPacket, MAX_IMAGES } from '../features/gpt/context'
import { runContinuityReview, type GptDeps } from '../features/gpt/client'
import {
  acceptProposal,
  addReview,
  classifyGptError,
  discardProposal,
  editProposal,
  GPT_ERROR_TEXT,
  isStale,
  KEEP_REVIEWS,
  markAskedClaude,
  parseContinuityResponse,
  toReview,
  undoProposal,
  type ContinuityResponse,
  type DecisionOps,
  type GptReview,
} from '../features/gpt/proposals'
import schemaText from '../features/gpt/schemas/continuity.json?raw'

const decision = (patch: Partial<Decision>): Decision => ({
  id: 'd1',
  text: 'La plancha siempre a la izquierda.',
  proposedBy: 'director',
  proposedAt: '2026-10-24T00:00:00.000Z',
  status: 'approved',
  approvedBy: 'director',
  updatedAt: '2026-10-24T00:00:00.000Z',
  ...patch,
})

/** Proyecto de ejemplo: escena 1 ANTES, escena 2 DESPUÉS con papelitos (aviso local), con imágenes y planos. */
function sample() {
  const { project, scenes } = buildExample(
    [
      ['Cocina', 'antes', 'Beto lee las comandas de papel.'],
      ['Mostrador', 'despues', 'Beto cuelga los papelitos.'],
    ],
    [
      decision({}),
      decision({ id: 'd2', text: 'PROPUESTA-SECRETA', status: 'proposed', proposedBy: 'claude', approvedBy: undefined }),
      decision({ id: 'd3', text: 'RECHAZADA-SECRETA', status: 'rejected', approvedBy: undefined }),
    ],
  )
  scenes[0].startImageId = 'img-a'
  scenes[0].endImageId = 'img-b'
  scenes[0].script.generationPrompt = 'PROMPT-SECRETO'
  scenes[0].prep = { start: { prompt: 'PREP-SECRETO' } }
  const shot = (id: string, order: number, extra: Partial<Shot> = {}): Shot =>
    ({ id, order, name: `Plano ${order + 1}`, duration: 2, updatedAt: '2026-10-24T00:00:00.000Z', ...extra }) as Shot
  scenes[1].shots = [shot('p1', 0, { action: 'Primer plano de la plancha.', startImageId: 'img-c' }), shot('p2', 1, { continuity: 'Gorra roja.', endImageId: 'img-d' })]
  const map: Record<string, Scene> = Object.fromEntries(scenes.map((s) => [s.id, s]))
  return { project, scenes, map }
}

const answer = (patch: Partial<ContinuityResponse['hallazgos'][number]> = {}): ContinuityResponse => ({
  resumen: 'Un problema.',
  hallazgos: [{ escena: 2, plano: 2, imagen: null, gravedad: 'alta', problema: 'La gorra cambia de color.', evidencia: 'Plano 2: gorra roja.', correccion: 'Usar gorra azul.', regla: 'Beto siempre con gorra azul.', ...patch }],
})

/** Decisiones en memoria para probar Aceptar / Deshacer sin la app. */
function fakeOps() {
  const decisions: Decision[] = []
  const ops: DecisionOps = {
    addDecision: (text, o) => {
      const id = `dec${decisions.length + 1}`
      decisions.push(decision({ id, text, proposedBy: o.proposedBy, status: 'proposed', sceneIds: o.sceneIds }))
      return id
    },
    approveDecision: (id) => {
      const d = decisions.find((x) => x.id === id)!
      d.status = 'approved'
      d.approvedBy = 'director'
    },
    removeDecision: (id) => decisions.splice(decisions.findIndex((x) => x.id === id), 1),
  }
  return { decisions, ops }
}

describe('revisión con GPT · paquete', () => {
  it('trae etapas, decisiones aprobadas, objetos con etapas, escenas, planos y avisos locales', () => {
    const { project, scenes } = sample()
    const { prompt, images, sceneIds, shotIds } = buildContinuityPacket(project, scenes)
    expect(prompt).toContain('ANTES → TRANSICIÓN → DESPUÉS')
    expect(prompt).toContain('La plancha siempre a la izquierda.')
    expect(prompt).toContain('«Comandas de papel» · solo en: ANTES, TRANSICIÓN · otros nombres: papelitos, tickets')
    expect(prompt).toContain('Escena 2 · «Mostrador» · etapa: DESPUÉS')
    expect(prompt).toContain('Plano 2 «Plano 2»')
    expect(prompt).toContain('Gorra roja.')
    expect(prompt).toContain('(dice «papelitos»)')
    expect(prompt).toContain('Imagen 3: escena 2, plano 1, inicial')
    expect(images.map((i) => [i.n, i.mediaId])).toEqual([
      [1, 'img-a'],
      [2, 'img-b'],
      [3, 'img-c'],
      [4, 'img-d'],
    ])
    expect(sceneIds).toEqual(scenes.map((s) => s.id))
    expect(shotIds[scenes[1].id]).toEqual(['p1', 'p2'])
  })

  it('nada de más: sin decisiones propuestas o rechazadas, sin prompts de generación ni ids', () => {
    const { project, scenes } = sample()
    const { prompt } = buildContinuityPacket(project, scenes)
    for (const secret of ['PROPUESTA-SECRETA', 'RECHAZADA-SECRETA', 'PROMPT-SECRETO', 'PREP-SECRETO', 'img-a', scenes[0].id, project.id]) {
      expect(prompt).not.toContain(secret)
    }
  })

  it('pone tope a las imágenes', () => {
    const { project } = sample()
    const many = buildExample(Array.from({ length: 10 }, (_, i): [string, string, string] => [`E${i}`, 'antes', '']))
    many.scenes.forEach((s, i) => Object.assign(s, { startImageId: `s${i}`, endImageId: `e${i}` }))
    const p = buildContinuityPacket({ ...project, sceneIds: many.project.sceneIds }, many.scenes)
    expect(p.images).toHaveLength(MAX_IMAGES)
    expect(p.imagesLeftOut).toBe(20 - MAX_IMAGES)
  })

  it('el esquema pide todos los campos (formato estricto de Codex)', () => {
    const schema = JSON.parse(schemaText)
    const item = schema.properties.hallazgos.items
    expect(item.additionalProperties).toBe(false)
    expect([...item.required].sort()).toEqual(Object.keys(item.properties).sort())
  })
})

describe('revisión con GPT · propuestas', () => {
  it('un formato malo no rompe nada', () => {
    for (const raw of ['', 'no es json', '{}', '{"resumen":"x","hallazgos":[{"gravedad":"terrible"}]}', 'null']) {
      expect(parseContinuityResponse(raw)).toEqual({ ok: false, error: 'bad-format' })
    }
    expect(parseContinuityResponse(JSON.stringify(answer())).ok).toBe(true)
  })

  it('los números de GPT pasan a ids reales; los que no existen se ignoran', () => {
    const { project, scenes, map } = sample()
    const packet = buildContinuityPacket(project, scenes)
    const r = toReview({ resumen: 'x', hallazgos: [...answer().hallazgos, { ...answer().hallazgos[0], escena: 99, plano: 7, imagen: 1 }, { ...answer().hallazgos[0], escena: null, plano: null, imagen: 77 }] }, packet, map)
    expect(r.proposals[0]).toMatchObject({ sceneId: scenes[1].id, shotId: 'p2', status: 'pending', rule: 'Beto siempre con gorra azul.' })
    // escena 99 no existe: se usa la de la imagen 1
    expect(r.proposals[1]).toMatchObject({ sceneId: scenes[0].id, imageId: 'img-a' })
    expect(r.proposals[2].sceneId).toBeUndefined()
    expect(r.imagesSent).toBe(4)
  })

  it('Aceptar con regla crea la decisión de GPT aprobada por el director; Deshacer la quita', () => {
    const { project, scenes, map } = sample()
    const review = toReview(answer(), buildContinuityPacket(project, scenes), map)
    const { decisions, ops } = fakeOps()
    let reviews = acceptProposal([review], review.id, review.proposals[0].id, ops)
    expect(reviews[0].proposals[0]).toMatchObject({ status: 'accepted', decisionId: 'dec1' })
    expect(decisions).toEqual([expect.objectContaining({ text: 'Beto siempre con gorra azul.', proposedBy: 'gpt', status: 'approved', approvedBy: 'director', sceneIds: [scenes[1].id] })])
    // Aceptar dos veces no duplica
    expect(acceptProposal(reviews, review.id, review.proposals[0].id, ops)).toBe(reviews)
    reviews = undoProposal(reviews, review.id, review.proposals[0].id, ops)
    expect(reviews[0].proposals[0]).toMatchObject({ status: 'pending', decisionId: undefined })
    expect(decisions).toEqual([])
  })

  it('Aceptar sin regla no cambia el proyecto', () => {
    const { project, scenes, map } = sample()
    const review = toReview(answer({ regla: null }), buildContinuityPacket(project, scenes), map)
    const { decisions, ops } = fakeOps()
    const reviews = acceptProposal([review], review.id, review.proposals[0].id, ops)
    expect(reviews[0].proposals[0].status).toBe('accepted')
    expect(decisions).toEqual([])
  })

  it('Editar, Descartar y Pedir a Claude se pueden deshacer', () => {
    const { project, scenes, map } = sample()
    const review = toReview(answer(), buildContinuityPacket(project, scenes), map)
    const pid = review.proposals[0].id
    const { decisions, ops } = fakeOps()
    let reviews = editProposal([review], review.id, pid, { rule: '  Gorra azul en el mostrador.  ' })
    expect(reviews[0].proposals[0].rule).toBe('Gorra azul en el mostrador.')
    reviews = acceptProposal(reviews, review.id, pid, ops)
    expect(decisions[0].text).toBe('Gorra azul en el mostrador.')
    reviews = undoProposal(reviews, review.id, pid, ops)
    reviews = discardProposal(reviews, review.id, pid)
    expect(reviews[0].proposals[0].status).toBe('discarded')
    reviews = undoProposal(reviews, review.id, pid, ops)
    reviews = markAskedClaude(reviews, review.id, pid)
    expect(reviews[0].proposals[0].status).toBe('asked-claude')
    expect(undoProposal(reviews, review.id, pid, ops)[0].proposals[0].status).toBe('pending')
  })

  it('avisa si la escena o el plano cambiaron o ya no existen', () => {
    const { project, scenes, map } = sample()
    const [p] = toReview(answer(), buildContinuityPacket(project, scenes), map).proposals
    expect(isStale(p, map)).toBe(false)
    expect(isStale(p, { ...map, [scenes[1].id]: { ...scenes[1], updatedAt: '2030-01-01T00:00:00.000Z' } })).toBe(true)
    expect(isStale(p, { ...map, [scenes[1].id]: { ...scenes[1], shots: [scenes[1].shots![0]] } })).toBe(true)
    expect(isStale(p, { ...map, [scenes[1].id]: undefined })).toBe(true)
  })

  it('guarda solo las revisiones más nuevas', () => {
    let reviews: GptReview[] = []
    for (let i = 0; i < KEEP_REVIEWS + 5; i++) reviews = addReview(reviews, { id: `r${i}`, at: '', kind: 'continuity', summary: '', imagesSent: 0, proposals: [] })
    expect(reviews).toHaveLength(KEEP_REVIEWS)
    expect(reviews[0].id).toBe(`r${KEEP_REVIEWS + 4}`)
  })
})

describe('revisión con GPT · consulta (con mocks, sin Codex real)', () => {
  const deps = (consult: GptDeps['consult'], desktop = true): GptDeps => ({
    desktop: () => desktop,
    diskPath: async (id) => (id === 'img-b' ? null : { file: `/f/${id}.png`, icon: `/m/${id}.jpg` }),
    consult,
  })

  it('en la web avisa «Disponible en la app de Mac» y no consulta', async () => {
    const consult = vi.fn()
    const { project, scenes, map } = sample()
    const r = await runContinuityReview(project, scenes, map, deps(consult, false))
    expect(r).toEqual({ ok: false, kind: 'web', message: GPT_ERROR_TEXT.web })
    expect(GPT_ERROR_TEXT.web).toContain('app de Mac')
    expect(consult).not.toHaveBeenCalled()
  })

  it('manda prompt, esquema y miniaturas; devuelve propuestas pendientes', async () => {
    const consult = vi.fn(async () => JSON.stringify(answer()))
    const { project, scenes, map } = sample()
    const r = await runContinuityReview(project, scenes, map, deps(consult))
    expect(r.ok && r.review.proposals[0].status).toBe('pending')
    const args = (consult.mock.calls[0] as unknown as [Parameters<GptDeps['consult']>[0]])[0]
    expect(args.schema).toBe(schemaText)
    expect(args.images).toEqual(['/m/img-a.jpg', '/m/img-c.jpg', '/m/img-d.jpg'])
    expect(args.prompt).toContain('Escena 1')
  })

  it('sin Codex, sin sesión, sin cuota, tiempo agotado o formato malo: aviso claro y no cambia nada', async () => {
    const { project, scenes, map } = sample()
    const cases: [() => Promise<string>, string][] = [
      [() => Promise.reject('NO_CODEX'), 'no-codex'],
      [() => Promise.reject('CODEX: Error: Not logged in. Run codex login'), 'no-login'],
      [() => Promise.reject('CODEX: You have hit your usage limit'), 'quota'],
      [() => Promise.reject('CODEX: 429 Too Many Requests'), 'quota'],
      [() => Promise.reject('TIMEOUT'), 'timeout'],
      [() => Promise.resolve('{"nada":1}'), 'bad-format'],
      [() => Promise.reject(new Error('algo raro')), 'unknown'],
    ]
    for (const [consult, kind] of cases) {
      const r = await runContinuityReview(project, scenes, map, deps(consult))
      expect(r).toMatchObject({ ok: false, kind })
      if (!r.ok) expect(r.message).toContain('No se cambió nada')
    }
    expect(classifyGptError({ message: 'NO_CODEX' })).toBe('no-codex')
  })
})
