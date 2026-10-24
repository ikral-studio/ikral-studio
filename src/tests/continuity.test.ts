import { describe, expect, it } from 'vitest'
import type { Decision } from '../types'
import { createProjectData, createScene } from '../features/scene-management/factory'
import { approvedDecisions, auditContinuity, cleanContinuity, itemMentions, phaseOf } from '../features/continuity/continuity'
import { buildExample, COMANDAS, continuityExamples } from '../features/continuity/examples'

const decision = (patch: Partial<Decision>): Decision => ({
  id: 'd1',
  text: 'La escena 3 es un flashback.',
  proposedBy: 'director',
  proposedAt: '2026-10-23T00:00:00.000Z',
  status: 'approved',
  approvedBy: 'director',
  approvedAt: '2026-10-23T00:00:00.000Z',
  updatedAt: '2026-10-23T00:00:00.000Z',
  ...patch,
})

describe('auditor de continuidad', () => {
  for (const ex of continuityExamples()) {
    it(`${ex.kind}: ${ex.name}`, () => {
      const got = auditContinuity(ex.project, ex.scenes).map((f) => ({ rule: f.rule, severity: f.severity, quote: f.quote }))
      expect(got).toEqual(ex.expected.map((e) => ({ quote: undefined, ...e })))
    })
  }

  it('el hallazgo trae escena, objeto, campo y cita', () => {
    const { project, scenes } = buildExample([['Escena 8', 'despues', 'Beto cuelga los papelitos.']])
    const [f] = auditContinuity(project, scenes)
    expect(f).toMatchObject({ sceneId: scenes[0].id, itemId: 'comandas', field: 'action', quote: 'papelitos' })
    expect(f.problem).toContain('ANTES, TRANSICIÓN')
  })

  it('revisa también diálogo y prompts de imagen', () => {
    const { project, scenes } = buildExample([['Escena 8', 'despues', '']])
    scenes[0].script.dialogue = 'Beto: —¿Dónde quedaron mis tickets?'
    scenes[0].prep = { start: { prompt: 'Kitchen with comandas de papel hanging' } }
    const fields = auditContinuity(project, scenes).map((f) => [f.field, f.severity])
    expect(fields).toEqual([
      ['dialogue', 'high'],
      ['startPrompt', 'high'],
    ])
  })

  it('mayúsculas y acentos se detectan igual', () => {
    for (const t of ['COMANDAS DE PAPEL', 'Comándas de papél', 'comandas de papel']) {
      expect(itemMentions(`Ahí están las ${t}.`, COMANDAS)).toHaveLength(1)
    }
  })

  it('solo palabras completas: «papelitosx» no cuenta', () => {
    expect(itemMentions('unos papelitosx raros', COMANDAS)).toEqual([])
    expect(itemMentions('los papelitos, ya', COMANDAS)[0].quote).toBe('papelitos')
  })

  it('la negación solo cuenta en la misma frase', () => {
    expect(itemMentions('Sin papelitos.', COMANDAS)[0].negated).toBe(true)
    expect(itemMentions('No llegó nadie. Beto cuelga los papelitos.', COMANDAS)[0].negated).toBe(false)
  })

  it('si en el mismo texto hay una mención negada y otra no, gana la alta', () => {
    const { project, scenes } = buildExample([['Escena 8', 'despues', 'Ya no hay papelitos. Bueno, Beto cuelga los tickets.']])
    expect(auditContinuity(project, scenes).map((f) => [f.rule, f.quote])).toEqual([[1, 'tickets']])
  })

  it('escena sin etapa, cuando sí hay etapas, da aviso bajo', () => {
    const { project, scenes } = buildExample([['Escena 2', undefined, 'Beto cocina.']])
    expect(auditContinuity(project, scenes).map((f) => [f.rule, f.severity])).toEqual([[3, 'low']])
  })

  it('regresar de DESPUÉS a ANTES pide revisar; con flashback aprobado, no', () => {
    const rows: [string, string, string][] = [
      ['Escena 1', 'antes', ''],
      ['Escena 2', 'despues', ''],
      ['Escena 3', 'antes', ''],
      ['Escena 4', 'antes', ''],
    ]
    const a = buildExample(rows)
    expect(auditContinuity(a.project, a.scenes).map((f) => [f.rule, f.severity, f.sceneId])).toEqual([
      [4, 'review', a.scenes[2].id],
    ])
    const b = buildExample(rows)
    b.project.decisions = [decision({ sceneIds: [b.scenes[2].id], allowsBackstep: true })]
    expect(auditContinuity(b.project, b.scenes)).toEqual([])
  })

  it('una decisión propuesta por Claude o GPT no cuenta hasta que el director la aprueba', () => {
    const { project, scenes } = buildExample([
      ['Escena 1', 'despues', ''],
      ['Escena 2', 'antes', ''],
    ])
    project.decisions = [
      decision({ id: 'p', proposedBy: 'gpt', status: 'proposed', approvedBy: undefined, sceneIds: [scenes[1].id], allowsBackstep: true }),
      decision({ id: 'r', proposedBy: 'claude', status: 'rejected', approvedBy: undefined, sceneIds: [scenes[1].id], allowsBackstep: true }),
    ]
    expect(approvedDecisions(project)).toEqual([])
    expect(auditContinuity(project, scenes).map((f) => f.rule)).toEqual([4])
  })

  it('usa el orden del proyecto, no el de la lista', () => {
    const { project, scenes } = buildExample([
      ['Escena 1', 'antes', ''],
      ['Escena 2', 'despues', ''],
    ])
    expect(auditContinuity(project, [...scenes].reverse())).toEqual([])
  })

  it('proyecto viejo sin etapas: ningún aviso y no falla', () => {
    const p = createProjectData('Viejo')
    const s = createScene(p.id, 'Llegada', 5)
    s.script.action = 'Beto cuelga los papelitos.'
    p.props = [{ id: 'x', name: 'Papelitos', description: '' }]
    p.sceneIds = [s.id]
    expect(auditContinuity(p, [s])).toEqual([])
    expect(phaseOf(p, s)).toBeUndefined()
  })

  it('un objeto sin «Aparece en» puede ir en cualquier etapa', () => {
    const { project, scenes } = buildExample([['Escena 8', 'despues', 'Beto cuelga los papelitos.']])
    project.props![0].onlyIn = []
    expect(auditContinuity(project, scenes)).toEqual([])
  })

  it('etapas que ya no existen dan aviso bajo y cleanContinuity las limpia', () => {
    const { project, scenes } = buildExample([['Escena 8', 'despues', 'Beto cuelga los papelitos.']])
    project.phases = project.phases!.filter((ph) => ph.id !== 'despues')
    project.props![1].onlyIn = ['transicion', 'despues']
    const before = auditContinuity(project, scenes).map((f) => [f.rule, f.severity])
    expect(before).toEqual([
      [5, 'low'],
      [5, 'low'],
    ])

    const updatedAt = scenes[0].updatedAt
    const clean = cleanContinuity(project, scenes)
    expect(clean.scenes[0].phaseId).toBeUndefined()
    expect(clean.scenes[0].updatedAt).toBe(updatedAt)
    expect(clean.project.props!.map((it) => it.onlyIn)).toEqual([
      ['antes', 'transicion'],
      ['transicion'],
    ])
    // Lo original no se toca (funciones puras).
    expect(scenes[0].phaseId).toBe('despues')
    expect(project.props![1].onlyIn).toEqual(['transicion', 'despues'])
    // Ya limpio: solo queda el aviso de escena sin etapa.
    expect(auditContinuity(clean.project, clean.scenes).map((f) => f.rule)).toEqual([3])
  })

  it('cleanContinuity no crea objetos nuevos si no hay nada que limpiar', () => {
    const { project, scenes } = buildExample([['Escena 1', 'antes', '']])
    const clean = cleanContinuity(project, scenes)
    expect(clean.project).toBe(project)
    expect(clean.scenes).toBe(scenes)
  })
})
