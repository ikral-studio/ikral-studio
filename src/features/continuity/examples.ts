// Casos de ejemplo de continuidad (correctos, incorrectos y ambiguos), con el resultado esperado.
// Los usan las pruebas del auditor y, más adelante, la revisión con GPT (Fase 3).
import type { BibleItem, Decision, Phase, Project, Scene } from '../../types'
import { createProjectData, createScene } from '../scene-management/factory'
import type { Severity } from './continuity'

export interface ContinuityExample {
  name: string
  kind: 'correcto' | 'incorrecto' | 'ambiguo'
  project: Project
  scenes: Scene[]
  /** Hallazgos esperados (regla, gravedad y cita), en cualquier orden. */
  expected: { rule: number; severity: Severity; quote?: string }[]
}

export const PHASES: Phase[] = [
  { id: 'antes', name: 'ANTES', note: 'comandas de papel' },
  { id: 'transicion', name: 'TRANSICIÓN' },
  { id: 'despues', name: 'DESPUÉS', note: 'con la app' },
]

export const COMANDAS: BibleItem = {
  id: 'comandas',
  name: 'Comandas de papel',
  description: 'Papelitos colgados arriba de la plancha.',
  aliases: ['papelitos', 'tickets'],
  onlyIn: ['antes', 'transicion'],
}

export const TABLET: BibleItem = {
  id: 'tablet',
  name: 'Tablet de pedidos',
  description: 'Tablet con la app LISTO ✓.',
  onlyIn: ['transicion', 'despues'],
}

/** Arma un proyecto de ejemplo con las etapas y los dos objetos. Cada escena: [título, etapa, acción]. */
export function buildExample(rows: [string, string | undefined, string][], decisions: Decision[] = []) {
  const project = createProjectData('Sin cebolla (ejemplo)')
  project.phases = PHASES.map((ph) => ({ ...ph }))
  project.props = [structuredClone(COMANDAS), structuredClone(TABLET)]
  project.decisions = decisions
  const scenes = rows.map(([title, phaseId, action], i) => {
    const s = createScene(project.id, title, 5, { order: i })
    if (phaseId) s.phaseId = phaseId
    s.script.action = action
    return s
  })
  project.sceneIds = scenes.map((s) => s.id)
  return { project, scenes }
}

export function continuityExamples(): ContinuityExample[] {
  return [
    {
      name: 'Papelitos en una escena DESPUÉS',
      kind: 'incorrecto',
      ...buildExample([
        ['Escena 1', 'antes', 'Beto lee las comandas de papel.'],
        ['Escena 8', 'despues', 'Beto cuelga los papelitos junto a la plancha.'],
      ]),
      expected: [{ rule: 1, severity: 'high', quote: 'papelitos' }],
    },
    {
      name: 'Tablet en una escena ANTES',
      kind: 'incorrecto',
      ...buildExample([['Escena 1', 'antes', 'Doña Chuy revisa la Tablet de pedidos.']]),
      expected: [{ rule: 1, severity: 'high', quote: 'Tablet de pedidos' }],
    },
    {
      name: 'Cada cosa en su etapa',
      kind: 'correcto',
      ...buildExample([
        ['Escena 1', 'antes', 'Beto cuelga los papelitos.'],
        ['Escena 8', 'despues', 'Beto toca la tablet de pedidos y sonríe.'],
      ]),
      expected: [],
    },
    {
      name: 'En TRANSICIÓN se permiten las dos',
      kind: 'correcto',
      ...buildExample([['Escena 4', 'transicion', 'Beto deja los tickets y prueba la Tablet de pedidos.']]),
      expected: [],
    },
    {
      name: '«Ya no hay comandas de papel» en DESPUÉS',
      kind: 'ambiguo',
      ...buildExample([['Escena 8', 'despues', 'Ya no hay comandas de papel: todo llega a la tablet de pedidos.']]),
      expected: [{ rule: 2, severity: 'review', quote: 'comandas de papel' }],
    },
    {
      name: '«Servilleta de papel» no es una comanda',
      kind: 'ambiguo',
      ...buildExample([['Escena 8', 'despues', 'Doña Chuy se limpia con una servilleta de papel.']]),
      expected: [],
    },
  ]
}
