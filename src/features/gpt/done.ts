/**
 * Texto honesto de una propuesta ya resuelta: dice lo que de verdad cambió.
 * Una propuesta «aceptada» sin cambio guardado (por ejemplo, de una versión vieja) no se presenta como corregida.
 */
export interface ResolvedLike {
  status: 'pending' | 'accepted' | 'discarded' | 'asked-claude'
  kind?: string
  applied?: { before?: string; after?: string; relationId?: string; decisionId?: string; shotId?: string }
}

export const NOTHING_CHANGED = '✓ Marcada, pero no cambió nada. Pulsa Deshacer para revisarla otra vez.'

export function doneText(p: ResolvedLike): string {
  if (p.status === 'discarded') return 'Descartada'
  if (p.status === 'asked-claude') return 'Enviada a Claude'
  if (p.status === 'pending') return ''
  const a = p.applied
  if (p.kind === 'rule' || (a?.decisionId && a.before === undefined)) return a?.decisionId ? '✓ Regla guardada. No cambió fichas ni imágenes.' : NOTHING_CHANGED
  if (a?.relationId) return '✓ Relación agregada. Las imágenes no cambiaron.'
  if (a && a.before !== undefined && a.after !== undefined && a.before !== a.after) return '✓ Cambio aplicado. Las imágenes no cambiaron.'
  return NOTHING_CHANGED
}
