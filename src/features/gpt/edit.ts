// «Consultar GPT» en Edición: ritmo, orden y duración de la película.
// GPT ve todas las escenas en orden (con sus planos y duraciones) y propone mover escenas o planos
// o cambiar duraciones. Solo propone: al Aceptar, la app usa sus acciones de siempre (deshacer + guardado).
// Si el orden o la duración cambió desde que GPT lo vio, se avisa antes de aplicar.
import { z } from 'zod'
import type { Project, Scene, Shot } from '../../types'
import { nowIso, uid } from '../../utils'
import { approvedDecisions, phaseOf, phasesOf } from '../continuity/continuity'
import { hasCoverage, shotsOf } from '../coverage/shots'
import { styleSpanish } from '../project-style/style'
import { activeVideo, effectiveDuration, shotVideo } from '../script-sync/derive'
import { suggestDuration } from '../timing/suggest'
import { parseDuration } from './coverage'
import { historyForPrompt, patchThread, type GptThread } from './threads'

export type EditProposalKind = 'move-scene' | 'scene-duration' | 'move-shot' | 'shot-duration'
export type EditProposalStatus = 'pending' | 'accepted' | 'discarded' | 'asked-claude'

export interface EditProposal {
  id: string
  kind: EditProposalKind
  sceneId: string
  /** Número de la escena cuando GPT la vio (empieza en 1). */
  scene: number
  /** Solo planos. */
  shotId?: string
  shot?: number
  /** Mover: la posición nueva (empieza en 1). Duración: los segundos nuevos. */
  value: number
  reason: string
  /** Lo que GPT vio: el orden (al mover) o la duración de hoy. */
  before: string
  /** La escena o el plano ya tiene video: en la línea de tiempo manda el largo del video. */
  hasVideo?: boolean
  status: EditProposalStatus
  /** Al aceptar: cómo estaba y cómo quedó (posición desde 0, o segundos), para Deshacer. */
  applied?: { before: string; after: string }
  resolvedAt?: string
}

/** Lo que GPT vio la última vez (para avisar «esto cambió desde la última vez»). */
export interface EditSeen {
  order: string
  durations: string
  decisionIds: string[]
}

export type EditThread = GptThread<EditProposal, EditSeen>

/** Un solo apartado: la edición de toda la película. */
export const EDIT_KEY = 'project'
export const MAX_EDIT_PROPOSALS = 10
const CLIP = 160

const clip = (t: string | undefined, max: number) => {
  const s = (t ?? '').trim().replace(/\s+/g, ' ')
  return s.length > max ? `${s.slice(0, max - 1)}…` : s
}

const secs = (n: number) => `${Math.round(n * 10) / 10} s`

/** Firma del orden de escenas. */
export const orderSignature = (ordered: Scene[]) => ordered.map((s) => s.id).join(',')
/** Firma del orden de planos de una escena. */
export const shotOrderSignature = (scene: Scene) => shotsOf(scene).map((s) => s.id).join(',')

const durationsSignature = (ordered: Scene[]) =>
  ordered.map((s) => (hasCoverage(s) ? shotsOf(s).map((x) => `${x.id}:${x.duration ?? ''}`).join('+') : `${s.id}:${s.plannedDuration}`)).join(' | ')

export const editSeenOf = (project: Project, ordered: Scene[]): EditSeen => ({
  order: orderSignature(ordered),
  durations: durationsSignature(ordered),
  decisionIds: approvedDecisions(project).map((d) => d.id),
})

export function editChangesSince(seen: EditSeen | undefined, now: EditSeen): string[] {
  if (!seen) return []
  const out: string[] = []
  if (seen.order !== now.order) out.push('El orden de las escenas cambió.')
  if (seen.durations !== now.durations) out.push('Las duraciones (o los planos) cambiaron.')
  const added = now.decisionIds.filter((id) => !seen.decisionIds.includes(id)).length
  const removed = seen.decisionIds.filter((id) => !now.decisionIds.includes(id)).length
  if (added || removed) out.push('Las decisiones aprobadas del director cambiaron.')
  return out
}

function sceneLines(project: Project, scene: Scene, n: number): string {
  const v = activeVideo(scene)
  const hint = suggestDuration(scene)
  const length = hasCoverage(scene)
    ? `dura ${secs(effectiveDuration(scene))} (suma de sus planos)`
    : `dura ${secs(effectiveDuration(scene))}${v && v.duration > 0 ? ` (largo del video; planeada ${secs(scene.plannedDuration)})` : ' (planeada)'}`
  const shotLine = (s: Shot, k: number) => {
    const sv = shotVideo(s)
    return `   Plano ${k + 1} «${s.name ?? ''}» · ${s.duration ?? '?'} s${sv && sv.duration > 0 ? ' · ya tiene video' : ''}`
  }
  return [
    `${n}. «${scene.title}» · etapa: ${phaseOf(project, scene)?.name ?? 'sin etapa'} · ${length}`,
    hint && `   Duración sugerida por el guion: ≈ ${hint.seconds} s (${hint.reasons.join(', ')})`,
    scene.script.action.trim() && `   Acción: ${clip(scene.script.action, CLIP)}`,
    scene.script.dialogue.trim() && `   Diálogos: ${clip(scene.script.dialogue, CLIP)}`,
    ...(hasCoverage(scene) ? shotsOf(scene).map(shotLine) : []),
  ]
    .filter(Boolean)
    .join('\n')
}

export interface EditPacket {
  prompt: string
  seen: EditSeen
}

/**
 * Paquete para Edición: proyecto, estilo, etapas, decisiones APROBADAS y todas las escenas en orden
 * (etapa, duración, si ya tienen video, duración sugerida por el guion, acción y diálogos recortados, planos).
 * No va: decisiones propuestas o rechazadas, prompts de generación, chat con Claude, imágenes ni rutas de archivos.
 */
export function buildEditPacket(project: Project, ordered: Scene[], thread: EditThread, request: string): EditPacket {
  const number = new Map(ordered.map((s, n) => [s.id, n + 1]))
  const phases = phasesOf(project)
  const seen = editSeenOf(project, ordered)
  const decisions = approvedDecisions(project)
    .map((d) => `- ${d.text}${d.sceneIds?.length ? ` (escenas ${d.sceneIds.map((id) => number.get(id)).filter(Boolean).join(', ')})` : ''}`)
    .join('\n')
  const total = ordered.reduce((a, s) => a + effectiveDuration(s), 0)
  const changes = editChangesSince(thread.seen, seen)
  const history = historyForPrompt(thread)

  const prompt = [
    'Eres editor de un storyboard animado. El director te pide ayuda con el ritmo, el orden y la duración de la película.',
    'Tipos de propuesta: «mover_escena» (escena = número; posicion = número nuevo), «duracion_escena» (escena; duracion en segundos; solo escenas sin planos),',
    '«mover_plano» (escena; plano = número; posicion = número nuevo dentro de la escena), «duracion_plano» (escena; plano; duracion en segundos).',
    'Si la escena o el plano ya tiene video, en la línea de tiempo manda el largo del video: dilo en el motivo.',
    `Responde en español. Propón cambios concretos (máximo ${MAX_EDIT_PROPOSALS}); el director decide cuáles acepta.`,
    'Respeta las decisiones aprobadas del director y el orden de las etapas: no las contradigas. En «resumen_hilo» resume en pocas líneas todo lo platicado (para retomarlo otro día).',
    '',
    `Proyecto: «${project.title}»`,
    styleSpanish(project) && `Estilo: ${styleSpanish(project)}`,
    `Etapas en orden: ${phases.length ? phases.map((p) => p.name).join(' → ') : '(sin etapas)'}`,
    '',
    'Decisiones aprobadas por el director:',
    decisions || '(ninguna)',
    '',
    `Escenas en orden (${ordered.length}) · duración total ${secs(total)}:`,
    ordered.map((s, n) => sceneLines(project, s, n + 1)).join('\n') || '(sin escenas)',
    changes.length ? `\nEsto cambió desde la última vez:\n${changes.map((c) => `- ${c}`).join('\n')}` : '',
    history ? `\n${history}` : '',
    '',
    `Pedido del director: ${request.trim()}`,
  ]
    .filter((x): x is string => typeof x === 'string' && x !== '')
    .join('\n')

  return { prompt, seen }
}

// ---- respuesta de GPT ----

const responseSchema = z.object({
  respuesta: z.string(),
  resumen_hilo: z.string(),
  propuestas: z.array(
    z.object({
      tipo: z.enum(['mover_escena', 'duracion_escena', 'mover_plano', 'duracion_plano']),
      escena: z.number().int(),
      plano: z.number().int().nullable(),
      posicion: z.number().int().nullable(),
      duracion: z.number().nullable(),
      motivo: z.string(),
    }),
  ),
})
export type EditResponse = z.infer<typeof responseSchema>

/** Lee la respuesta de GPT. Si no trae el formato pedido, no se usa nada. */
export function parseEditResponse(raw: string): { ok: true; data: EditResponse } | { ok: false; error: 'bad-format' } {
  try {
    const r = responseSchema.safeParse(JSON.parse(raw))
    return r.success ? { ok: true, data: r.data } : { ok: false, error: 'bad-format' }
  } catch {
    return { ok: false, error: 'bad-format' }
  }
}

const hasSceneVideo = (s: Scene) => !hasCoverage(s) && (activeVideo(s)?.duration ?? 0) > 0
const hasShotVideo = (s: Shot) => (shotVideo(s)?.duration ?? 0) > 0

/** Convierte las propuestas de GPT en propuestas pendientes. Las que apuntan a escenas o planos que no existen, o no cambian nada, se ignoran. */
export function toEditProposals(data: EditResponse, ordered: Scene[]): EditProposal[] {
  const out: EditProposal[] = []
  for (const g of data.propuestas.slice(0, MAX_EDIT_PROPOSALS)) {
    const scene = ordered[g.escena - 1]
    if (!scene) continue
    const base = { id: uid('ge'), sceneId: scene.id, scene: g.escena, reason: g.motivo.trim(), status: 'pending' as const }
    if (g.tipo === 'mover_escena') {
      const to = g.posicion
      if (to == null || to < 1 || to > ordered.length || to === g.escena) continue
      out.push({ ...base, kind: 'move-scene', value: to, before: orderSignature(ordered) })
      continue
    }
    if (g.tipo === 'duracion_escena') {
      const d = parseDuration(g.duracion)
      if (d == null || hasCoverage(scene) || d === scene.plannedDuration) continue
      out.push({ ...base, kind: 'scene-duration', value: d, before: String(scene.plannedDuration), hasVideo: hasSceneVideo(scene) || undefined })
      continue
    }
    if (!hasCoverage(scene)) continue
    const shots = shotsOf(scene)
    const shot = shots[(g.plano ?? 0) - 1]
    if (!shot) continue
    const shotBase = { ...base, shotId: shot.id, shot: g.plano! }
    if (g.tipo === 'mover_plano') {
      const to = g.posicion
      if (to == null || to < 1 || to > shots.length || to === g.plano) continue
      out.push({ ...shotBase, kind: 'move-shot', value: to, before: shotOrderSignature(scene) })
      continue
    }
    const d = parseDuration(g.duracion)
    if (d == null || d === shot.duration) continue
    out.push({ ...shotBase, kind: 'shot-duration', value: d, before: String(shot.duration ?? ''), hasVideo: hasShotVideo(shot) || undefined })
  }
  return out
}

/** ¿La propuesta sigue sobre lo mismo que GPT vio? */
export function isEditStale(p: EditProposal, ordered: Scene[]): boolean {
  if (p.status !== 'pending') return false
  const scene = ordered.find((s) => s.id === p.sceneId)
  if (!scene) return true
  switch (p.kind) {
    case 'move-scene':
      return orderSignature(ordered) !== p.before
    case 'scene-duration':
      return hasCoverage(scene) || String(scene.plannedDuration) !== p.before
    case 'move-shot':
      return shotOrderSignature(scene) !== p.before
    case 'shot-duration': {
      const shot = scene.shots?.find((s) => s.id === p.shotId)
      return !shot || String(shot.duration ?? '') !== p.before
    }
  }
}

// ---- acciones del director sobre las propuestas (cada una se puede deshacer) ----
export interface EditOps {
  /** Escenas en el orden de hoy. */
  ordered: () => Scene[]
  moveScene: (id: string, toIndex: number) => void
  updateScene: (id: string, patch: Partial<Scene>) => void
  moveShot: (sceneId: string, shotId: string, dir: -1 | 1) => void
  updateShot: (sceneId: string, shotId: string, patch: Partial<Omit<Shot, 'id' | 'order'>>) => void
}

export interface EditProposalRef {
  threadId: string
  messageId: string
  proposalId: string
}

function patchProposal(threads: EditThread[], ref: EditProposalRef, fn: (p: EditProposal) => EditProposal): EditThread[] {
  return patchThread(threads, ref.threadId, (t) => ({
    ...t,
    messages: t.messages.map((m) => (m.id !== ref.messageId ? m : { ...m, proposals: m.proposals?.map((p) => (p.id === ref.proposalId ? fn(p) : p)) })),
  }))
}

export const findEditProposal = (threads: EditThread[], ref: EditProposalRef) =>
  threads.find((t) => t.id === ref.threadId)?.messages.find((m) => m.id === ref.messageId)?.proposals?.find((p) => p.id === ref.proposalId)

const sceneOf = (ops: EditOps, id: string) => ops.ordered().find((s) => s.id === id)
const sceneIndex = (ops: EditOps, id: string) => ops.ordered().findIndex((s) => s.id === id)
const shotIndex = (ops: EditOps, sceneId: string, shotId: string) => {
  const s = sceneOf(ops, sceneId)
  return s ? shotsOf(s).findIndex((x) => x.id === shotId) : -1
}

/** Mueve un plano a una posición (desde 0) paso a paso, con la acción de siempre. */
function placeShot(ops: EditOps, sceneId: string, shotId: string, to: number) {
  let k = shotIndex(ops, sceneId, shotId)
  while (k >= 0 && k !== to) {
    ops.moveShot(sceneId, shotId, k < to ? 1 : -1)
    const next = shotIndex(ops, sceneId, shotId)
    if (next === k) break
    k = next
  }
}

export type EditAcceptResult = { ok: true; threads: EditThread[] } | { ok: false; error: 'missing' | 'not-pending' }

/** Aceptar: aplica el cambio con las acciones de siempre y guarda cómo deshacerlo. */
export function acceptEditProposal(threads: EditThread[], ref: EditProposalRef, ops: EditOps, at = nowIso()): EditAcceptResult {
  const p = findEditProposal(threads, ref)
  if (!p || p.status !== 'pending') return { ok: false, error: 'not-pending' }
  const scene = sceneOf(ops, p.sceneId)
  if (!scene) return { ok: false, error: 'missing' }
  let applied: { before: string; after: string }

  if (p.kind === 'move-scene') {
    const from = sceneIndex(ops, p.sceneId)
    ops.moveScene(p.sceneId, p.value - 1)
    applied = { before: String(from), after: String(sceneIndex(ops, p.sceneId)) }
  } else if (p.kind === 'scene-duration') {
    if (hasCoverage(scene)) return { ok: false, error: 'missing' }
    const before = String(scene.plannedDuration)
    ops.updateScene(p.sceneId, { plannedDuration: p.value })
    applied = { before, after: String(sceneOf(ops, p.sceneId)!.plannedDuration) }
  } else {
    const k = shotIndex(ops, p.sceneId, p.shotId!)
    if (k < 0 || !hasCoverage(scene)) return { ok: false, error: 'missing' }
    if (p.kind === 'move-shot') {
      placeShot(ops, p.sceneId, p.shotId!, Math.min(p.value, shotsOf(scene).length) - 1)
      applied = { before: String(k), after: String(shotIndex(ops, p.sceneId, p.shotId!)) }
    } else {
      const before = String(shotsOf(scene)[k].duration ?? '')
      ops.updateShot(p.sceneId, p.shotId!, { duration: p.value })
      const now = shotsOf(sceneOf(ops, p.sceneId)!).find((x) => x.id === p.shotId)!
      applied = { before, after: String(now.duration ?? '') }
    }
  }
  return { ok: true, threads: patchProposal(threads, ref, (x) => ({ ...x, status: 'accepted', applied, resolvedAt: at })) }
}

export type EditUndoResult = { ok: true; threads: EditThread[] } | { ok: false; error: 'changed' }

/** Deshacer: vuelve a «pendiente». Si se había aplicado, regresa el orden o la duración, salvo que se haya cambiado después. */
export function undoEditProposal(threads: EditThread[], ref: EditProposalRef, ops: EditOps): EditUndoResult {
  const p = findEditProposal(threads, ref)
  if (!p || p.status === 'pending') return { ok: true, threads }
  const a = p.applied
  if (a) {
    const scene = sceneOf(ops, p.sceneId)
    if (!scene) return { ok: false, error: 'changed' }
    if (p.kind === 'move-scene') {
      if (String(sceneIndex(ops, p.sceneId)) !== a.after) return { ok: false, error: 'changed' }
      ops.moveScene(p.sceneId, Number(a.before))
    } else if (p.kind === 'scene-duration') {
      if (hasCoverage(scene) || String(scene.plannedDuration) !== a.after) return { ok: false, error: 'changed' }
      ops.updateScene(p.sceneId, { plannedDuration: Number(a.before) })
    } else if (p.kind === 'move-shot') {
      if (String(shotIndex(ops, p.sceneId, p.shotId!)) !== a.after) return { ok: false, error: 'changed' }
      placeShot(ops, p.sceneId, p.shotId!, Number(a.before))
    } else {
      const shot = scene.shots?.find((x) => x.id === p.shotId)
      if (!shot || String(shot.duration ?? '') !== a.after) return { ok: false, error: 'changed' }
      ops.updateShot(p.sceneId, shot.id, { duration: a.before ? Number(a.before) : undefined })
    }
  }
  return { ok: true, threads: patchProposal(threads, ref, (x) => ({ ...x, status: 'pending', applied: undefined, resolvedAt: undefined })) }
}

export const discardEditProposal = (threads: EditThread[], ref: EditProposalRef, at = nowIso()) =>
  patchProposal(threads, ref, (x) => (x.status === 'pending' ? { ...x, status: 'discarded', resolvedAt: at } : x))

/** Editar la propuesta antes de aceptarla: la posición nueva o los segundos. */
export const editEditProposal = (threads: EditThread[], ref: EditProposalRef, text: string) =>
  patchProposal(threads, ref, (x) => {
    if (x.status !== 'pending') return x
    if (x.kind === 'scene-duration' || x.kind === 'shot-duration') {
      const d = parseDuration(text)
      return d == null ? x : { ...x, value: d }
    }
    const n = parseInt(text, 10)
    return Number.isInteger(n) && n >= 1 ? { ...x, value: n } : x
  })

export const markEditAskedClaude = (threads: EditThread[], ref: EditProposalRef, at = nowIso()) =>
  patchProposal(threads, ref, (x) => (x.status === 'pending' ? { ...x, status: 'asked-claude', resolvedAt: at } : x))

const pad = (n: number) => String(n).padStart(2, '0')

/** Texto corto de la propuesta para la interfaz y para Claude. */
export function describeEditProposal(p: EditProposal): string {
  const video = p.hasVideo ? ' (ya tiene video: en la línea de tiempo manda el largo del video)' : ''
  switch (p.kind) {
    case 'move-scene':
      return `Mover la escena ${pad(p.scene)} al lugar ${p.value}`
    case 'scene-duration':
      return `Duración de la escena ${pad(p.scene)}: ${p.value} s (hoy ${p.before} s)${video}`
    case 'move-shot':
      return `Mover el plano ${p.shot} de la escena ${pad(p.scene)} al lugar ${p.value}`
    case 'shot-duration':
      return `Duración del plano ${p.shot} de la escena ${pad(p.scene)}: ${p.value} s (hoy ${p.before || '?'} s)${video}`
  }
}

/** Mensaje para el chat con Claude: qué propone GPT. Claude decide cómo aplicarlo. */
export function editClaudeText(p: EditProposal): string {
  return [
    'GPT propone para la edición:',
    describeEditProposal(p),
    p.reason && `Motivo: ${p.reason}`,
    '¿Puedes revisarlo y aplicarlo si tiene sentido, sin tocar el Canon ni lo aprobado? Avísame qué cambiaste.',
  ]
    .filter(Boolean)
    .join('\n')
}
