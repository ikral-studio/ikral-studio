// Continuidad narrativa: etapas de la historia (ANTES / DESPUÉS), decisiones del director
// y un auditor sin IA que avisa contradicciones en el guion. Solo avisa: nunca cambia nada.
import type { BibleItem, Decision, Phase, Project, Scene } from '../../types'
import { fold } from '../script-search/find'

export type Severity = 'high' | 'review' | 'low'

/** Texto de la escena que revisa el auditor. */
export type AuditField =
  | 'action'
  | 'dialogue'
  | 'cameraDirection'
  | 'soundDirection'
  | 'generationPrompt'
  | 'startPrompt'
  | 'endPrompt'

export interface Finding {
  id: string
  /** 1 fuera de etapa · 2 fuera de etapa pero negado · 3 escena sin etapa · 4 retrocede de etapa · 5 etapa que ya no existe. */
  rule: 1 | 2 | 3 | 4 | 5
  severity: Severity
  sceneId?: string
  itemId?: string
  field?: AuditField
  /** Pedacito exacto del texto donde aparece. */
  quote?: string
  problem: string
  suggestion: string
}

export interface Mention {
  start: number
  end: number
  quote: string
  /** La mención está negada («ya no hay comandas», «sin papelitos»). */
  negated: boolean
}

const FIELDS: { field: AuditField; get: (s: Scene) => string | undefined }[] = [
  { field: 'action', get: (s) => s.script.action },
  { field: 'dialogue', get: (s) => s.script.dialogue },
  { field: 'cameraDirection', get: (s) => s.script.cameraDirection },
  { field: 'soundDirection', get: (s) => s.script.soundDirection },
  { field: 'generationPrompt', get: (s) => s.script.generationPrompt },
  { field: 'startPrompt', get: (s) => s.prep?.start?.prompt },
  { field: 'endPrompt', get: (s) => s.prep?.end?.prompt },
]

const FIELD_LABEL: Record<AuditField, string> = {
  action: 'acción',
  dialogue: 'diálogo',
  cameraDirection: 'cámara',
  soundDirection: 'sonido',
  generationPrompt: 'prompt de generación',
  startPrompt: 'prompt de imagen inicial',
  endPrompt: 'prompt de imagen final',
}

/** Palabras que niegan lo que viene después («ya no hay», «sin», «ningún»…). */
const NEGATIONS = new Set(['no', 'sin', 'ningun', 'ninguna', 'ninguno', 'ningunos', 'ningunas', 'nunca', 'jamas', 'ni', 'adios'])
/** Cuántas palabras antes de la mención se revisan para buscar una negación. */
const NEGATION_WINDOW = 4

const isWordChar = (ch: string | undefined) => !!ch && /[\p{L}\p{N}]/u.test(ch)

const bibleItems = (p: Project): BibleItem[] => [...(p.locations ?? []), ...(p.props ?? []), ...(p.wardrobe ?? [])]

/** Las etapas en orden (vacío si el proyecto no tiene). */
export const phasesOf = (p: Project): Phase[] => p.phases ?? []

/** Etapa de la escena, o nada si no tiene o si ya no existe. */
export function phaseOf(p: Project, s: Scene): Phase | undefined {
  return s.phaseId ? phasesOf(p).find((ph) => ph.id === s.phaseId) : undefined
}

/** Solo las decisiones que el director aprobó. Las propuestas o rechazadas no cuentan. */
export function approvedDecisions(p: Project): Decision[] {
  return (p.decisions ?? []).filter((d) => d.status === 'approved' && d.approvedBy === 'director')
}

/** ¿Hay una palabra de negación en la misma frase, poco antes de la mención? */
function negatedBefore(folded: string, start: number): boolean {
  let from = start
  while (from > 0 && !/[.!?¡¿\n;:]/.test(folded[from - 1])) from--
  const words = folded.slice(from, start).split(/[^\p{L}\p{N}]+/u).filter(Boolean)
  return words.slice(-NEGATION_WINDOW).some((w) => NEGATIONS.has(w))
}

/** Dónde se menciona el elemento (por nombre o alias), sin importar mayúsculas ni acentos. Solo palabras completas. */
export function itemMentions(text: string, item: Pick<BibleItem, 'name' | 'aliases'>): Mention[] {
  if (!text) return []
  const folded = fold(text)
  const names = [item.name, ...(item.aliases ?? [])].map((n) => fold(n.trim())).filter(Boolean)
  const found: Mention[] = []
  for (const n of names) {
    for (let i = folded.indexOf(n); i !== -1; i = folded.indexOf(n, i + 1)) {
      const end = i + n.length
      if (isWordChar(folded[i - 1]) || isWordChar(folded[end])) continue
      // Si un nombre más largo ya cubre este pedazo, no se cuenta dos veces.
      if (found.some((m) => i < m.end && end > m.start)) continue
      found.push({ start: i, end, quote: text.slice(i, end), negated: negatedBefore(folded, i) })
    }
  }
  return found.sort((a, b) => a.start - b.start)
}

/**
 * Quita las referencias a etapas que ya no existen (en escenas y elementos de la Biblia).
 * Si no hay nada que limpiar, devuelve los mismos objetos. No cambia `updatedAt`.
 */
export function cleanContinuity(project: Project, scenes: Scene[]): { project: Project; scenes: Scene[] } {
  const ids = new Set(phasesOf(project).map((ph) => ph.id))
  const fixItems = (list?: BibleItem[]) => {
    if (!list?.some((it) => it.onlyIn?.some((id) => !ids.has(id)))) return list
    return list.map((it) => (it.onlyIn?.some((id) => !ids.has(id)) ? { ...it, onlyIn: it.onlyIn.filter((id) => ids.has(id)) } : it))
  }
  const locations = fixItems(project.locations)
  const props = fixItems(project.props)
  const wardrobe = fixItems(project.wardrobe)
  const nextProject =
    locations === project.locations && props === project.props && wardrobe === project.wardrobe
      ? project
      : { ...project, locations, props, wardrobe }
  let changed = false
  const nextScenes = scenes.map((s) => {
    if (!s.phaseId || ids.has(s.phaseId)) return s
    changed = true
    const { phaseId: _gone, ...rest } = s
    return rest
  })
  return { project: nextProject, scenes: changed ? nextScenes : scenes }
}

/** Revisa la continuidad del guion. Los hallazgos no se guardan: se calculan cada vez. */
export function auditContinuity(project: Project, scenes: Scene[]): Finding[] {
  const phases = phasesOf(project)
  const out: Finding[] = []
  const add = (f: Omit<Finding, 'id'>) =>
    out.push({ ...f, id: [f.rule, f.sceneId ?? '', f.itemId ?? '', f.field ?? ''].join(':') })

  const phaseIds = new Set(phases.map((ph) => ph.id))
  const phaseIndex = new Map(phases.map((ph, i) => [ph.id, i]))
  const phaseName = (id: string) => phases.find((ph) => ph.id === id)?.name ?? id
  const items = bibleItems(project)
  const decisions = approvedDecisions(project)

  // Regla 5: referencias a etapas que ya no existen (se limpian solas al cargar).
  for (const it of items) {
    const gone = (it.onlyIn ?? []).filter((id) => !phaseIds.has(id))
    if (gone.length)
      add({
        rule: 5,
        severity: 'low',
        itemId: it.id,
        problem: `«${it.name}» apunta a una etapa que ya no existe.`,
        suggestion: 'Se limpia sola al abrir el proyecto. Revisa en qué etapas aparece.',
      })
  }
  for (const s of scenes) {
    if (s.phaseId && !phaseIds.has(s.phaseId))
      add({
        rule: 5,
        severity: 'low',
        sceneId: s.id,
        problem: `La escena «${s.title}» apunta a una etapa que ya no existe.`,
        suggestion: 'Se limpia sola al abrir el proyecto. Escoge su etapa otra vez.',
      })
  }

  // Proyecto sin etapas: no hay nada más que revisar.
  if (!phases.length) return out

  const order = new Map(project.sceneIds.map((id, i) => [id, i]))
  const ordered = [...scenes].sort((a, b) => (order.get(a.id) ?? Infinity) - (order.get(b.id) ?? Infinity))
  let prev: { scene: Scene; index: number } | undefined

  for (const s of ordered) {
    const ph = phaseOf(project, s)

    // Regla 3: hay etapas y la escena no tiene.
    if (!ph) {
      if (!s.phaseId)
        add({
          rule: 3,
          severity: 'low',
          sceneId: s.id,
          problem: `La escena «${s.title}» no tiene etapa.`,
          suggestion: 'Escoge en qué etapa ocurre para poder revisar su continuidad.',
        })
      continue
    }

    // Regla 4: el orden retrocede de etapa sin una decisión que lo permita.
    const index = phaseIndex.get(ph.id)!
    if (prev && index < prev.index) {
      const allowed = decisions.some((d) => d.allowsBackstep && d.sceneIds?.includes(s.id))
      if (!allowed)
        add({
          rule: 4,
          severity: 'review',
          sceneId: s.id,
          problem: `La escena «${s.title}» (${ph.name}) va después de «${prev.scene.title}» (${phaseName(prev.scene.phaseId!)}): la historia regresa de etapa.`,
          suggestion: '¿Es un flashback? Si sí, apruébalo como decisión. Si no, revisa el orden o la etapa.',
        })
    }
    prev = { scene: s, index }

    // Reglas 1 y 2: un elemento aparece en una etapa donde no debería.
    for (const it of items) {
      const allowed = (it.onlyIn ?? []).filter((id) => phaseIds.has(id))
      if (!allowed.length || allowed.includes(ph.id)) continue
      for (const { field, get } of FIELDS) {
        const mentions = itemMentions(get(s) ?? '', it)
        if (!mentions.length) continue
        const plain = mentions.find((m) => !m.negated)
        const where = allowed.map(phaseName).join(', ')
        if (plain)
          add({
            rule: 1,
            severity: 'high',
            sceneId: s.id,
            itemId: it.id,
            field,
            quote: plain.quote,
            problem: `«${it.name}» aparece en la escena «${s.title}» (${ph.name}), pero solo va en: ${where}.`,
            suggestion: `Quítalo del ${FIELD_LABEL[field]} o cambia la etapa de la escena.`,
          })
        else
          add({
            rule: 2,
            severity: 'review',
            sceneId: s.id,
            itemId: it.id,
            field,
            quote: mentions[0].quote,
            problem: `«${it.name}» se menciona negado en la escena «${s.title}» (${ph.name}), y solo va en: ${where}.`,
            suggestion: 'Si solo dice que ya no está, puede estar bien. Revisa que no se vea en la imagen.',
          })
      }
    }
  }
  return out
}
