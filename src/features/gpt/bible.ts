// «Consultar GPT» en la Biblia: estilo, personajes, locaciones, objetos, vestuario y reglas (etapas y decisiones).
// GPT solo propone. Al Aceptar, la app lo aplica con sus acciones de siempre (deshacer + guardado);
// ningún asistente escribe proyecto.json directo. Una regla nueva entra como decisión de GPT aprobada por el director.
import { z } from 'zod'
import type { BibleAnswers, BibleItem, BibleKind, Character, ItemKind, Project } from '../../types'
import { nowIso, uid } from '../../utils'
import { LOOKS, MOODS, AUDIENCES } from '../bible/bible'
import { approvedDecisions, phasesOf } from '../continuity/continuity'
import { styleSpanish } from '../project-style/style'
import { historyForPrompt, patchThread, type GptProposalStatus, type GptThread } from './threads'

/** Apartado de la Biblia: el estilo, las reglas («rules») o una ficha («characters:<id>», «props:<id>»…). */
export type BibleTarget = { kind: 'style' } | { kind: 'rules' } | { kind: 'characters'; item: Character } | { kind: ItemKind; item: BibleItem }

export type BibleField = 'style-notes' | 'era' | 'place' | 'look' | 'mood' | 'description' | 'role' | 'aliases' | 'onlyIn'
export type BibleProposalKind = 'field' | 'relation' | 'rule'

export interface BibleProposal {
  id: string
  kind: BibleProposalKind
  /** Apartado al que aplica (el mismo del hilo). */
  target: string
  field?: BibleField
  /** Relación: el otro personaje (id). */
  withId?: string
  /** Valor nuevo (en «onlyIn», ids de etapas separados por coma), la etiqueta de la relación o el texto de la regla. */
  text: string
  reason: string
  /** Lo que GPT vio en ese campo. Si ya no está igual, la propuesta puede ser vieja. */
  before: string
  status: GptProposalStatus
  /** Al aceptar: cómo deshacerlo. */
  applied?: { before?: string; after?: string; relationId?: string; decisionId?: string }
  resolvedAt?: string
}

/** Lo que GPT vio del apartado (para avisar «esto cambió desde la última vez»). */
export interface BibleSeen {
  target: string
  context: string
  decisionIds: string[]
}

export type BibleThread = GptThread<BibleProposal, BibleSeen>

export const MAX_BIBLE_PROPOSALS = 8
const DESC = 220
const SHORT = 120

const clip = (t: string | undefined, max: number) => {
  const s = (t ?? '').trim().replace(/\s+/g, ' ')
  return s.length > max ? `${s.slice(0, max - 1)}…` : s
}
const norm = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase()

const ITEM_KINDS: ItemKind[] = ['locations', 'props', 'wardrobe']
const KIND_ES: Record<BibleKind, string> = { characters: 'Personaje', locations: 'Locación', props: 'Objeto', wardrobe: 'Vestuario' }

export const targetKey = (kind: 'style' | 'rules' | BibleKind, id?: string) => (kind === 'style' || kind === 'rules' ? kind : `${kind}:${id}`)

export function resolveBibleTarget(project: Project, key: string): BibleTarget | null {
  if (key === 'style') return { kind: 'style' }
  if (key === 'rules') return { kind: 'rules' }
  const [kind, id] = key.split(':') as [string, string]
  if (kind === 'characters') {
    const item = project.characters?.find((c) => c.id === id)
    return item ? { kind, item } : null
  }
  if (!ITEM_KINDS.includes(kind as ItemKind)) return null
  const item = project[kind as ItemKind]?.find((c) => c.id === id)
  return item ? { kind: kind as ItemKind, item } : null
}

export const targetLabel = (t: BibleTarget) =>
  t.kind === 'style' ? 'Estilo y tono visual' : t.kind === 'rules' ? 'Etapas y decisiones' : `${KIND_ES[t.kind]} «${t.item.name.trim() || 'sin nombre'}»`

const phaseNames = (project: Project, ids: string[] | undefined) => {
  const phases = phasesOf(project)
  return (ids ?? []).map((id) => phases.find((p) => p.id === id)?.name).filter(Boolean) as string[]
}

/** Valor de hoy de un campo, como texto. `undefined` = el apartado ya no existe. */
export function readBibleField(project: Project, key: string, field: BibleField): string | undefined {
  const t = resolveBibleTarget(project, key)
  if (!t || t.kind === 'rules') return undefined
  if (t.kind === 'style') {
    const b = project.bible ?? {}
    if (field === 'style-notes') return project.style?.notes ?? ''
    if (field === 'era' || field === 'place' || field === 'look' || field === 'mood') return b[field] ?? ''
    return undefined
  }
  if (field === 'description') return t.item.description ?? ''
  if (t.kind === 'characters') return field === 'role' ? (t.item.role ?? '') : undefined
  if (field === 'role') return t.item.note ?? ''
  if (field === 'aliases') return (t.item.aliases ?? []).join(', ')
  if (field === 'onlyIn') return (t.item.onlyIn ?? []).join(',')
  return undefined
}

const splitList = (t: string) => t.split(',').map((x) => x.trim()).filter(Boolean)

const charLine = (c: Character) => `- ${c.name.trim()}${c.role?.trim() ? ` (${c.role.trim()})` : ''}${c.description.trim() ? `: ${clip(c.description, DESC)}` : ''}`

function itemLine(project: Project, it: BibleItem, max = SHORT) {
  const extra = [
    it.note?.trim(),
    it.aliases?.length ? `alias: ${it.aliases.join(', ')}` : '',
    it.onlyIn?.length ? `solo en: ${phaseNames(project, it.onlyIn).join(', ')}` : '',
  ].filter(Boolean)
  return `- ${it.name.trim()}${extra.length ? ` (${extra.join('; ')})` : ''}${it.description.trim() ? `: ${clip(it.description, max)}` : ''}`
}

/** El apartado completo como texto (lo que GPT ve y lo que se compara para avisar cambios). */
function targetText(project: Project, t: BibleTarget): string {
  if (t.kind === 'style') {
    const b: BibleAnswers = project.bible ?? {}
    const look = b.look === 'otro' ? b.lookOther?.trim() : LOOKS.find((x) => x.id === b.look)?.es
    return [
      `Notas de estilo: ${project.style?.notes?.trim() || '(vacío)'}`,
      `Cómo se ve: ${look || '(sin elegir)'}`,
      `Época: ${b.era?.trim() || '(vacío)'}`,
      `Lugar principal: ${b.place?.trim() || '(vacío)'}`,
      `Colores: ${MOODS.find((x) => x.id === b.mood)?.es ?? '(sin elegir)'}`,
      `Público: ${AUDIENCES.find((x) => x.id === b.audience)?.es ?? '(sin elegir)'}`,
    ].join('\n')
  }
  if (t.kind === 'rules') {
    const phases = phasesOf(project).map((p) => `- ${p.name}${p.note?.trim() ? `: ${clip(p.note, SHORT)}` : ''}`)
    const limited = ITEM_KINDS.flatMap((k) => (project[k] ?? []).filter((x) => x.name.trim() && x.onlyIn?.length)).map((x) => `- ${x.name.trim()}: solo en ${phaseNames(project, x.onlyIn).join(', ')}`)
    return [`Etapas:\n${phases.join('\n') || '(sin etapas)'}`, `Elementos que solo existen en algunas etapas:\n${limited.join('\n') || '(ninguno)'}`].join('\n')
  }
  const it = t.item
  if (t.kind === 'characters') {
    const c = it as Character
    const names = new Map((project.characters ?? []).map((x) => [x.id, x.name.trim()]))
    const rel = (project.relations ?? []).filter((r) => r.a === c.id || r.b === c.id).map((r) => `- ${names.get(r.a === c.id ? r.b : r.a) ?? '?'}: ${r.label || '(sin etiqueta)'}`)
    const clothes = (project.wardrobe ?? []).filter((w) => w.characterId === c.id).map((w) => `- ${w.name.trim()}`)
    return [
      `Nombre: ${c.name.trim()}`,
      `Papel: ${c.role?.trim() || '(vacío)'}`,
      `Cómo se ve: ${c.description.trim() || '(vacío)'}`,
      `Relaciones:\n${rel.join('\n') || '(ninguna)'}`,
      clothes.length ? `Vestuario:\n${clothes.join('\n')}` : '',
    ]
      .filter(Boolean)
      .join('\n')
  }
  const b = it as BibleItem
  const owner = b.characterId ? project.characters?.find((c) => c.id === b.characterId)?.name : undefined
  return [
    `Nombre: ${b.name.trim()}`,
    `Nota corta: ${b.note?.trim() || '(vacío)'}`,
    owner ? `Lo usa: ${owner}` : '',
    `Cómo se ve: ${b.description.trim() || '(vacío)'}`,
    `Alias (otros nombres en el guion): ${b.aliases?.join(', ') || '(ninguno)'}`,
    `Etapas donde existe: ${b.onlyIn?.length ? phaseNames(project, b.onlyIn).join(', ') : 'todas'}`,
  ]
    .filter(Boolean)
    .join('\n')
}

/** Lo que GPT ve del resto de la Biblia (para avisar si cambió). */
function bibleContext(project: Project, key: string) {
  const chars = (project.characters ?? []).filter((c) => c.name.trim() && `characters:${c.id}` !== key)
  const rels = new Map((project.characters ?? []).map((c) => [c.id, c.name.trim()]))
  const parts = [
    `Estilo: ${styleSpanish(project) || '(sin estilo)'}`,
    `Personajes:\n${chars.map(charLine).join('\n') || '(ninguno)'}`,
    (project.relations ?? []).length ? `Relaciones:\n${project.relations!.map((r) => `- ${rels.get(r.a) ?? '?'} y ${rels.get(r.b) ?? '?'}: ${r.label}`).join('\n')}` : '',
    ...ITEM_KINDS.map((k) => {
      const list = (project[k] ?? []).filter((x) => x.name.trim() && `${k}:${x.id}` !== key)
      return list.length ? `${KIND_ES[k]}s:\n${list.map((x) => itemLine(project, x)).join('\n')}` : ''
    }),
  ]
  return parts.filter(Boolean).join('\n')
}

/** Qué tipos de propuesta valen en cada apartado. */
export type BibleGroup = 'style' | 'rules' | 'characters' | 'item'
const ALLOWED: Record<BibleGroup, string[]> = {
  style: ['notas_estilo', 'epoca', 'lugar', 'aspecto', 'colores', 'regla'],
  rules: ['regla'],
  characters: ['descripcion', 'papel', 'relacion', 'regla'],
  item: ['descripcion', 'papel', 'alias', 'etapas', 'regla'],
}
export const bibleGroup = (t: BibleTarget): BibleGroup => (t.kind === 'style' || t.kind === 'rules' || t.kind === 'characters' ? t.kind : 'item')
const group = bibleGroup

const KIND_HELP: Record<BibleGroup, string> = {
  rules: '«regla» (una regla de continuidad: qué no puede cambiar entre escenas o etapas, o qué solo existe en una etapa; el director la aprueba). No repitas reglas que ya están aprobadas.',
  style: `«notas_estilo» (texto = las notas de estilo completas nuevas), «epoca», «lugar», «aspecto» (texto = ${LOOKS.filter((l) => l.id !== 'otro').map((l) => l.id).join(' | ')}), «colores» (texto = ${MOODS.map((m) => m.id).join(' | ')}), «regla» (una regla de continuidad para que el director la apruebe).`,
  characters: '«descripcion» (texto = cómo se ve, completo: apariencia y personalidad visible), «papel», «relacion» (con = nombre del otro personaje; texto = la relación, ej.: «hermana mayor»), «regla».',
  item: '«descripcion» (texto = cómo se ve, completo), «papel» (la nota corta), «alias» (texto = todos los alias separados por coma), «etapas» (texto = nombres de etapas separados por coma; vacío = todas), «regla».',
}

export interface BiblePacket {
  prompt: string
  seen: BibleSeen
  /** La imagen Canon (aprobada) de la ficha, si tiene: va en miniatura. */
  images: string[]
}

export const bibleSeenOf = (project: Project, key: string): BibleSeen => {
  const t = resolveBibleTarget(project, key)
  return { target: t ? targetText(project, t) : '', context: bibleContext(project, key), decisionIds: approvedDecisions(project).map((d) => d.id) }
}

export function bibleChangesSince(seen: BibleSeen | undefined, now: BibleSeen): string[] {
  if (!seen) return []
  const out: string[] = []
  if (seen.target !== now.target) out.push('Este apartado cambió.')
  if (seen.context !== now.context) out.push('Otras partes de la Biblia cambiaron.')
  const same = seen.decisionIds.length === now.decisionIds.length && seen.decisionIds.every((id) => now.decisionIds.includes(id))
  if (!same) out.push('Las decisiones aprobadas del director cambiaron.')
  return out
}

/**
 * Paquete para la Biblia: proyecto, estilo, etapas, decisiones APROBADAS, el apartado completo,
 * el resto de la Biblia en corto, la imagen Canon de la ficha en miniatura, el historial del hilo y el pedido.
 * No va: decisiones propuestas o rechazadas, prompts de generación, intentos de imagen, chat con Claude, rutas.
 */
export function buildBiblePacket(project: Project, key: string, thread: BibleThread, request: string): BiblePacket | null {
  const t = resolveBibleTarget(project, key)
  if (!t) return null
  const seen = bibleSeenOf(project, key)
  const phases = phasesOf(project)
  const decisions = approvedDecisions(project)
    .map((d) => `- ${d.text}`)
    .join('\n')
  const changes = bibleChangesSince(thread.seen, seen)
  const history = historyForPrompt(thread)
  const g = group(t)
  const images = 'item' in t && t.item.imageId ? [t.item.imageId] : []
  const prompt = [
    'Eres director de arte y guionista de un storyboard. El director te pide ayuda con UN apartado de la Biblia del proyecto.',
    'Responde en español. Propón cambios concretos (máximo 8); el director decide cuáles acepta.',
    'Respeta las decisiones aprobadas del director, las etapas y lo que ya está en la Biblia: no lo contradigas. No inventes personajes nuevos.',
    `Tipos de propuesta para este apartado: ${KIND_HELP[g]} Pon «con» en null salvo en «relacion».`,
    'En «resumen_hilo» resume en pocas líneas todo lo platicado hasta ahora (para retomarlo otro día).',
    '',
    `Proyecto: «${project.title}»`,
    `Etapas en orden: ${phases.length ? phases.map((p) => p.name).join(' → ') : '(sin etapas)'}`,
    '',
    'Decisiones aprobadas por el director:',
    decisions || '(ninguna)',
    '',
    'Resto de la Biblia:',
    seen.context,
    '',
    `Apartado: ${targetLabel(t)}`,
    seen.target,
    images.length ? 'Va adjunta su imagen Canon (aprobada por el director): respeta lo que se ve en ella.' : '',
    changes.length ? `\nEsto cambió desde la última vez:\n${changes.map((c) => `- ${c}`).join('\n')}` : '',
    history ? `\n${history}` : '',
    '',
    `Pedido del director: ${request.trim()}`,
  ]
    .filter((x) => x !== '')
    .join('\n')
  return { prompt, seen, images }
}

const responseSchema = z.object({
  respuesta: z.string(),
  resumen_hilo: z.string(),
  propuestas: z.array(
    z.object({
      tipo: z.enum(['notas_estilo', 'epoca', 'lugar', 'aspecto', 'colores', 'descripcion', 'papel', 'alias', 'etapas', 'relacion', 'regla']),
      con: z.string().nullable(),
      texto: z.string(),
      motivo: z.string(),
    }),
  ),
})
export type BibleResponse = z.infer<typeof responseSchema>

/** Lee la respuesta de GPT. Si no trae el formato pedido, no se usa nada. */
export function parseBibleResponse(raw: string): { ok: true; data: BibleResponse } | { ok: false; error: 'bad-format' } {
  try {
    const r = responseSchema.safeParse(JSON.parse(raw))
    return r.success ? { ok: true, data: r.data } : { ok: false, error: 'bad-format' }
  } catch {
    return { ok: false, error: 'bad-format' }
  }
}

const FIELD: Partial<Record<BibleResponse['propuestas'][number]['tipo'], BibleField>> = {
  notas_estilo: 'style-notes',
  epoca: 'era',
  lugar: 'place',
  aspecto: 'look',
  colores: 'mood',
  descripcion: 'description',
  papel: 'role',
  alias: 'aliases',
  etapas: 'onlyIn',
}

const pickChoice = (list: { id: string; es: string }[], text: string) => {
  const n = norm(text)
  return list.find((c) => c.id !== 'otro' && (norm(c.id) === n || norm(c.es).includes(n)))?.id
}

/** Convierte las propuestas de GPT en pendientes. Las que no valen para este apartado se ignoran. */
export function toBibleProposals(data: BibleResponse, project: Project, key: string): BibleProposal[] {
  const t = resolveBibleTarget(project, key)
  if (!t) return []
  const allowed = ALLOWED[group(t)]
  const out: BibleProposal[] = []
  for (const g of data.propuestas) {
    if (out.length >= MAX_BIBLE_PROPOSALS) break
    if (!allowed.includes(g.tipo)) continue
    let text = g.texto.trim()
    const base = { id: uid('gb'), target: key, reason: g.motivo.trim(), status: 'pending' as const }
    if (g.tipo === 'regla') {
      if (text) out.push({ ...base, kind: 'rule', text, before: '' })
      continue
    }
    if (g.tipo === 'relacion') {
      const other = (project.characters ?? []).find((c) => norm(c.name) === norm(g.con ?? ''))
      if (!other || other.id === (t as { item: Character }).item.id || !text) continue
      out.push({ ...base, kind: 'relation', withId: other.id, text, before: '' })
      continue
    }
    const field = FIELD[g.tipo]!
    if (field === 'look') text = pickChoice(LOOKS, text) ?? ''
    if (field === 'mood') text = pickChoice(MOODS, text) ?? ''
    if (field === 'aliases') text = splitList(text).join(', ')
    if (field === 'onlyIn') {
      const names = splitList(text)
      const phases = phasesOf(project)
      const ids = names.map((n) => phases.find((p) => norm(p.name) === norm(n))?.id).filter(Boolean) as string[]
      if (names.length && ids.length !== names.length) continue
      text = ids.join(',')
    }
    if (!text && field !== 'onlyIn' && field !== 'aliases') continue
    const before = readBibleField(project, key, field) ?? ''
    if (text === before) continue
    out.push({ ...base, kind: 'field', field, text, before })
  }
  return out
}

/** ¿Cambió el campo desde que GPT lo vio? (o ya no existe el apartado). */
export function isBibleStale(p: BibleProposal, project: Project): boolean {
  if (p.status !== 'pending') return false
  if (!resolveBibleTarget(project, p.target)) return true
  if (p.kind === 'field') return readBibleField(project, p.target, p.field!) !== p.before
  if (p.kind === 'relation') return !project.characters?.some((c) => c.id === p.withId)
  return false
}

// ---- acciones del director sobre las propuestas (cada una se puede deshacer) ----
/** Las acciones de siempre del store (deshacer + guardado). */
export interface BibleOps {
  project: () => Project | null
  setStyle: (patch: { notes?: string }) => void
  setBible: (patch: Partial<BibleAnswers>) => void
  updateCharacter: (id: string, patch: Partial<Omit<Character, 'id'>>) => void
  updateItem: (kind: BibleKind, id: string, patch: Partial<Omit<BibleItem, 'id'>>) => void
  addRelation: (a: string, b: string, label: string) => void
  removeRelation: (id: string) => void
  addDecision: (text: string, opts: { proposedBy: 'gpt'; itemIds?: string[] }) => string | undefined
  approveDecision: (id: string) => void
  removeDecision: (id: string) => void
}

function writeField(ops: BibleOps, key: string, field: BibleField, value: string) {
  if (field === 'style-notes') return ops.setStyle({ notes: value })
  if (field === 'era' || field === 'place') return ops.setBible({ [field]: value })
  if (field === 'look' || field === 'mood') return ops.setBible({ [field]: value || undefined })
  const [kind, id] = key.split(':') as [BibleKind, string]
  if (kind === 'characters') return ops.updateCharacter(id, field === 'role' ? { role: value } : { description: value })
  if (field === 'role') return ops.updateItem(kind, id, { note: value })
  if (field === 'description') return ops.updateItem(kind, id, { description: value })
  if (field === 'aliases') return ops.updateItem(kind, id, { aliases: splitList(value).length ? splitList(value) : undefined })
  if (field === 'onlyIn') return ops.updateItem(kind, id, { onlyIn: splitList(value).length ? splitList(value) : undefined })
}

export interface BibleProposalRef {
  threadId: string
  messageId: string
  proposalId: string
}

function patchProposal(threads: BibleThread[], ref: BibleProposalRef, fn: (p: BibleProposal) => BibleProposal): BibleThread[] {
  return patchThread(threads, ref.threadId, (t) => ({
    ...t,
    messages: t.messages.map((m) => (m.id !== ref.messageId ? m : { ...m, proposals: m.proposals?.map((p) => (p.id === ref.proposalId ? fn(p) : p)) })),
  }))
}

export const findBibleProposal = (threads: BibleThread[], ref: BibleProposalRef) =>
  threads.find((t) => t.id === ref.threadId)?.messages.find((m) => m.id === ref.messageId)?.proposals?.find((p) => p.id === ref.proposalId)

export type BibleAcceptResult = { ok: true; threads: BibleThread[] } | { ok: false; error: 'missing' | 'not-pending' }

/** Aceptar: aplica el cambio con las acciones de siempre y guarda cómo deshacerlo. */
export function acceptBibleProposal(threads: BibleThread[], ref: BibleProposalRef, ops: BibleOps, at = nowIso()): BibleAcceptResult {
  const p = findBibleProposal(threads, ref)
  if (!p || p.status !== 'pending') return { ok: false, error: 'not-pending' }
  const project = ops.project()
  const t = project && resolveBibleTarget(project, p.target)
  if (!project || !t) return { ok: false, error: 'missing' }
  let applied: BibleProposal['applied']
  if (p.kind === 'field') {
    const before = readBibleField(project, p.target, p.field!)
    if (before === undefined) return { ok: false, error: 'missing' }
    writeField(ops, p.target, p.field!, p.text)
    applied = { before, after: readBibleField(ops.project()!, p.target, p.field!) ?? p.text }
  } else if (p.kind === 'relation') {
    if (t.kind !== 'characters' || !project.characters?.some((c) => c.id === p.withId)) return { ok: false, error: 'missing' }
    const had = new Set((project.relations ?? []).map((r) => r.id))
    ops.addRelation(t.item.id, p.withId!, p.text)
    const added = ops.project()?.relations?.find((r) => !had.has(r.id))
    applied = { relationId: added?.id }
  } else {
    const decisionId = ops.addDecision(p.text, { proposedBy: 'gpt', itemIds: 'item' in t ? [t.item.id] : undefined })
    if (!decisionId) return { ok: false, error: 'missing' }
    // Aceptar es la aprobación del director.
    ops.approveDecision(decisionId)
    applied = { decisionId }
  }
  return { ok: true, threads: patchProposal(threads, ref, (x) => ({ ...x, status: 'accepted', applied, resolvedAt: at })) }
}

export type BibleUndoResult = { ok: true; threads: BibleThread[] } | { ok: false; error: 'changed' }

/** Deshacer: vuelve a «pendiente». Si se había aplicado, lo regresa, salvo que se haya editado después. */
export function undoBibleProposal(threads: BibleThread[], ref: BibleProposalRef, ops: BibleOps): BibleUndoResult {
  const p = findBibleProposal(threads, ref)
  if (!p || p.status === 'pending') return { ok: true, threads }
  const project = ops.project()
  if (p.applied && project) {
    if (p.kind === 'field') {
      if (readBibleField(project, p.target, p.field!) !== p.applied.after) return { ok: false, error: 'changed' }
      writeField(ops, p.target, p.field!, p.applied.before ?? '')
    }
    if (p.applied.relationId && project.relations?.some((r) => r.id === p.applied!.relationId)) ops.removeRelation(p.applied.relationId)
    if (p.applied.decisionId && project.decisions?.some((d) => d.id === p.applied!.decisionId)) ops.removeDecision(p.applied.decisionId)
  }
  return { ok: true, threads: patchProposal(threads, ref, (x) => ({ ...x, status: 'pending', applied: undefined, resolvedAt: undefined })) }
}

export const discardBibleProposal = (threads: BibleThread[], ref: BibleProposalRef, at = nowIso()) =>
  patchProposal(threads, ref, (x) => (x.status === 'pending' ? { ...x, status: 'discarded', resolvedAt: at } : x))

/** Editar el texto antes de aceptarlo (en «aspecto», «colores» y «etapas» no: son opciones fijas). */
export const canEditBible = (p: BibleProposal) => !(p.kind === 'field' && (p.field === 'look' || p.field === 'mood' || p.field === 'onlyIn'))

export const editBibleProposal = (threads: BibleThread[], ref: BibleProposalRef, text: string) =>
  patchProposal(threads, ref, (x) => (x.status === 'pending' && canEditBible(x) ? { ...x, text: x.field === 'aliases' ? splitList(text).join(', ') : text.trim() } : x))

export const markBibleAskedClaude = (threads: BibleThread[], ref: BibleProposalRef, at = nowIso()) =>
  patchProposal(threads, ref, (x) => (x.status === 'pending' ? { ...x, status: 'asked-claude', resolvedAt: at } : x))

const FIELD_ES: Record<BibleField, string> = {
  'style-notes': 'las notas de estilo',
  era: 'la época',
  place: 'el lugar principal',
  look: 'cómo se ve',
  mood: 'los colores',
  description: 'cómo se ve',
  role: 'el papel',
  aliases: 'los alias',
  onlyIn: 'las etapas donde existe',
}

/** Texto corto de la propuesta para la interfaz y para Claude. */
export function describeBibleProposal(p: BibleProposal, project: Project): string {
  if (p.kind === 'rule') return `Nueva regla: «${p.text}»`
  if (p.kind === 'relation') return `Relación con ${project.characters?.find((c) => c.id === p.withId)?.name ?? 'otro personaje'}: «${p.text}»`
  const f = p.field!
  const value =
    f === 'look' ? LOOKS.find((x) => x.id === p.text)?.es : f === 'mood' ? MOODS.find((x) => x.id === p.text)?.es : f === 'onlyIn' ? phaseNames(project, splitList(p.text)).join(', ') || 'todas' : p.text
  const isItem = p.target.split(':')[0] !== 'characters' && p.target !== 'style'
  const label = f === 'role' && isItem ? 'la nota corta' : FIELD_ES[f]
  return `Cambiar ${label} a: «${value || '(vacío)'}»`
}

/** Mensaje para el chat con Claude: qué propone GPT. Claude decide cómo aplicarlo. */
export function bibleClaudeText(p: BibleProposal, project: Project): string {
  const t = resolveBibleTarget(project, p.target)
  return [
    `GPT propone para la Biblia (${t ? targetLabel(t) : 'apartado'}):`,
    describeBibleProposal(p, project),
    p.reason && `Motivo: ${p.reason}`,
    '¿Puedes revisarlo y aplicarlo si tiene sentido, sin tocar el Canon ni lo aprobado? Avísame qué cambiaste.',
  ]
    .filter(Boolean)
    .join('\n')
}
