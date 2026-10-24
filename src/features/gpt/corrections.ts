// «Revisar cambios» → «Aplicar corrección»: los cambios concretos de GPT en fichas se muestran antes y después,
// y solo se aplican si el director lo aprueba. Nunca tocan diálogos, imágenes ni la imagen Canon; lo que no se
// puede corregir solo queda como «faltan estos pasos». Todo se guarda en la revisión para poder deshacer.
import type { BibleItem, ItemKind, ItemState, Project, Scene } from '../../types'
import { nowIso, pad2, uid } from '../../utils'
import { MIXED, mixesMoments, resolveState } from '../bible/itemStates'
import { findProposal, patchProposal, saveRule, type AppliedSnapshot, type DecisionOps, type GptProposal, type GptReview, type ItemOps, type ProposedChange } from './proposals'

const KINDS: ItemKind[] = ['locations', 'props', 'wardrobe']
const KIND_NAME: Record<ItemKind, string> = { locations: 'Locación', props: 'Objeto', wardrobe: 'Vestuario' }
const fold = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[«»"]/g, '').trim().toLowerCase()
const clean = (t?: string) => (t ?? '').trim().replace(/\s+/g, ' ')

/** Busca la ficha por su nombre u otros nombres (sin adivinar: el nombre debe coincidir). */
export function findItem(project: Project, name: string): { kind: ItemKind; item: BibleItem } | undefined {
  const want = fold(name)
  for (const kind of KINDS) {
    const item = (project[kind] ?? []).find((it) => [it.name, ...(it.aliases ?? [])].some((n) => fold(n) === want))
    if (item) return { kind, item }
  }
  return undefined
}

export interface PlannedChange {
  change: ProposedChange
  kind: ItemKind
  itemId: string
  title: string
  before: string
  after: string
  /** Aviso honesto (ej.: la imagen aprobada no cambia). */
  note?: string
}

export interface CorrectionPlan {
  ready: PlannedChange[]
  blocked: { change: ProposedChange; reason: string }[]
  /** Cómo queda cada ficha (para aplicar) y cómo estaba (para deshacer). */
  items: (AppliedSnapshot & { after: Pick<BibleItem, 'states' | 'description'> })[]
}

const sceneName = (project: Project, sceneId: string) => `Escena ${pad2(project.sceneIds.indexOf(sceneId) + 1)}`
const stateText = (s: Pick<ItemState, 'label' | 'shows' | 'hides'>) => `«${s.label}» · Se ve: ${clean(s.shows)}${clean(s.hides) ? ` · No se ve: ${clean(s.hides)}` : ''}`

/** El estado para la escena: si ya hay uno con esa etiqueta, se le suma la escena; si no, se crea. */
function withState(project: Project, item: BibleItem, c: ProposedChange, at: string): ItemState[] {
  const sceneId = c.sceneId!
  const label = c.label ?? sceneName(project, sceneId)
  const states = item.states ?? []
  const same = states.find((s) => fold(s.label) === fold(label))
  // Una escena tiene un solo estado: se quita de los otros que la nombraban.
  const out = states.map((s) =>
    s.id === same?.id
      ? { ...s, sceneIds: [...new Set([...(s.sceneIds ?? []), sceneId])], shows: c.shows!, hides: c.hides ?? s.hides, updatedAt: at }
      : s.sceneIds?.includes(sceneId)
        ? { ...s, sceneIds: s.sceneIds.filter((id) => id !== sceneId), updatedAt: at }
        : s,
  )
  return same ? out : [...out, { id: uid('st'), label, sceneIds: [sceneId], shows: c.shows!, hides: c.hides, updatedAt: at }]
}

/** Vista previa: qué cambiaría en cada ficha y qué no se puede hacer solo (con el motivo). No cambia nada. */
export function planCorrection(project: Project, scenes: Record<string, Scene | undefined>, p: Pick<GptProposal, 'changes'>, at = nowIso()): CorrectionPlan {
  const plan: CorrectionPlan = { ready: [], blocked: [], items: [] }
  const work = new Map<string, CorrectionPlan['items'][number]>()
  for (const change of p.changes ?? []) {
    const found = findItem(project, change.item)
    if (!found) {
      plan.blocked.push({ change, reason: `No encontré la ficha «${change.item}» en la Biblia.` })
      continue
    }
    const { kind, item } = found
    const key = `${kind}:${item.id}`
    const entry = work.get(key) ?? { kind, itemId: item.id, before: { states: item.states, description: item.description }, after: { states: item.states, description: item.description } }
    const current: BibleItem = { ...item, ...entry.after }
    const title = `${KIND_NAME[kind]} «${item.name}»`
    const note = item.imageId ? 'La imagen aprobada (Canon) no cambia.' : undefined
    if (change.kind === 'item-state') {
      const scene = change.sceneId ? scenes[change.sceneId] : undefined
      const shows = clean(change.shows)
      const mixed = mixesMoments(shows)
      if (!scene || !project.sceneIds.includes(scene.id)) {
        plan.blocked.push({ change, reason: `GPT no dijo para qué escena es el estado de «${item.name}»: no lo adivino.` })
        continue
      }
      if (!shows) {
        plan.blocked.push({ change, reason: `GPT no dijo qué se ve en «${item.name}» en la ${sceneName(project, scene.id)}.` })
        continue
      }
      if (mixed) {
        plan.blocked.push({ change, reason: MIXED(mixed) })
        continue
      }
      const r = resolveState(current, scene)
      const fixed = { ...change, shows, hides: clean(change.hides) || undefined }
      entry.after = { ...entry.after, states: withState(project, current, fixed, at) }
      plan.ready.push({
        change: fixed,
        kind,
        itemId: item.id,
        title: `${title} · ${sceneName(project, scene.id)}`,
        before: r.kind === 'state' ? stateText(r.state) : r.kind === 'ambiguous' ? 'Estado sin decidir' : 'Sin estado para esta escena',
        after: stateText({ label: fixed.label ?? sceneName(project, scene.id), shows, hides: fixed.hides }),
        note,
      })
    } else {
      const text = clean(change.text)
      const mixed = mixesMoments(text)
      if (!text) {
        plan.blocked.push({ change, reason: `GPT no dio la descripción nueva de «${item.name}».` })
        continue
      }
      if (mixed) {
        plan.blocked.push({ change, reason: MIXED(mixed) })
        continue
      }
      entry.after = { ...entry.after, description: text }
      plan.ready.push({ change: { ...change, text }, kind, itemId: item.id, title: `${title} · descripción fija`, before: clean(current.description) || '(vacía)', after: text, note })
    }
    work.set(key, entry)
  }
  plan.items = [...work.values()]
  return plan
}

/**
 * «Aplicar corrección» (solo con el clic del director): cambia las fichas como en la vista previa, guarda la
 * regla si la hay y anota lo que faltó. Guarda cómo estaban para poder deshacer. Nunca toca imágenes.
 */
export function applyCorrection(
  reviews: GptReview[],
  reviewId: string,
  proposalId: string,
  project: Project,
  scenes: Record<string, Scene | undefined>,
  ops: DecisionOps & ItemOps,
  at = nowIso(),
): GptReview[] {
  const p = findProposal(reviews, reviewId, proposalId)
  if (!p || p.status !== 'pending') return reviews
  const plan = planCorrection(project, scenes, p, at)
  if (!plan.ready.length) return reviews
  for (const it of plan.items) ops.updateItem(it.kind, it.itemId, it.after)
  const decisionId = saveRule(p, ops)
  const applied = plan.items.map(({ kind, itemId, before }) => ({ kind, itemId, before }))
  const missing = plan.blocked.map((b) => b.reason)
  return patchProposal(reviews, reviewId, proposalId, (x) => ({
    ...x,
    status: 'accepted',
    outcome: 'applied',
    decisionId,
    applied,
    ...(missing.length ? { missing } : {}),
    resolvedAt: at,
  }))
}

/** Escenas cuyo fotograma de ficha se puede regenerar tras aplicar (solo si el director lo pide). */
export function regenTargets(project: Project, p: GptProposal): { kind: ItemKind; itemId: string; sceneId: string; label: string }[] {
  if (p.outcome !== 'applied') return []
  const out = new Map<string, { kind: ItemKind; itemId: string; sceneId: string; label: string }>()
  for (const c of p.changes ?? []) {
    const found = c.kind === 'item-state' && c.sceneId && project.sceneIds.includes(c.sceneId) ? findItem(project, c.item) : undefined
    if (found) out.set(`${found.item.id}:${c.sceneId}`, { kind: found.kind, itemId: found.item.id, sceneId: c.sceneId!, label: sceneName(project, c.sceneId!) })
  }
  return [...out.values()]
}

/** Lo que de verdad pasó, dicho con honestidad. */
export function outcomeText(p: GptProposal): string {
  if (p.status === 'discarded') return 'Descartada'
  if (p.status === 'asked-claude') return 'Enviada a Claude'
  const outcome = p.outcome ?? (p.decisionId ? 'rule' : 'reviewed')
  if (outcome === 'rule') return `${p.correction ? `✓ Se guardó la regla; faltan estos pasos: ${p.correction}` : '✓ Regla guardada.'} No cambió fichas, diálogos ni imágenes.`
  if (outcome === 'reviewed') return '✓ Marcado como revisado. No se cambió nada.'
  const n = p.applied?.length ?? 0
  const missing = p.missing?.length ? ` ${p.decisionId ? 'Se guardó la regla; faltan' : 'Faltan'} estos pasos: ${p.missing.join(' ')}` : ''
  return `✓ Corrección aplicada en ${n} ${n === 1 ? 'ficha' : 'fichas'}${p.decisionId ? ' y se guardó la regla' : ''}. Las imágenes no cambiaron.${missing}`
}
