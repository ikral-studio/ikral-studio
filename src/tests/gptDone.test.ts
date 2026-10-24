import { describe, expect, it } from 'vitest'
import { doneText, NOTHING_CHANGED } from '../features/gpt/done'

// «Aceptada» solo si de verdad cambió algo. Una propuesta vieja aceptada sin cambio guardado no se presenta como corregida.
describe('doneText: texto honesto de una propuesta resuelta', () => {
  it('cambio real de un campo', () => {
    expect(doneText({ status: 'accepted', kind: 'field', applied: { before: 'papel y luego tablet', after: 'papel' } })).toBe('✓ Cambio aplicado. Las imágenes no cambiaron.')
  })

  it('aceptada sin cambio guardado (versión vieja): no dice que corrigió', () => {
    expect(doneText({ status: 'accepted', kind: 'field' })).toBe(NOTHING_CHANGED)
    expect(doneText({ status: 'accepted' })).toBe(NOTHING_CHANGED)
  })

  it('aceptada pero igual que antes: no cambió nada', () => {
    expect(doneText({ status: 'accepted', kind: 'action', applied: { before: 'x', after: 'x' } })).toBe(NOTHING_CHANGED)
  })

  it('regla: solo se guarda la regla', () => {
    expect(doneText({ status: 'accepted', kind: 'rule', applied: { decisionId: 'd1' } })).toBe('✓ Regla guardada. No cambió fichas ni imágenes.')
    expect(doneText({ status: 'accepted', kind: 'rule' })).toBe(NOTHING_CHANGED)
  })

  it('relación agregada, descartada y enviada a Claude', () => {
    expect(doneText({ status: 'accepted', kind: 'relation', applied: { relationId: 'r1' } })).toContain('Relación agregada')
    expect(doneText({ status: 'discarded' })).toBe('Descartada')
    expect(doneText({ status: 'asked-claude' })).toBe('Enviada a Claude')
  })

  it('plano nuevo de cobertura cuenta como cambio', () => {
    expect(doneText({ status: 'accepted', kind: 'shot-add', applied: { shotId: 's1', before: '', after: 'P1' } })).toContain('Cambio aplicado')
  })
})
