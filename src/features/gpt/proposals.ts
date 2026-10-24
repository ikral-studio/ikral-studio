// Propuestas de GPT: se validan, se guardan aparte (gpt-revisiones.json) y NUNCA cambian el proyecto solas.
// El director decide: Aceptar (si trae regla, entra como decisión de GPT aprobada por él), Editar, Descartar
// o Pedir a Claude. Todo se puede deshacer. Si la escena cambió desde que GPT la vio, se avisa.
import { z } from 'zod'
import type { Scene } from '../../types'
import { nowIso, uid } from '../../utils'
import { shotsOf } from '../coverage/shots'
import type { ContinuityPacket } from './context'

export type GptSeverity = 'alta' | 'media' | 'baja'
export type ProposalStatus = 'pending' | 'accepted' | 'discarded' | 'asked-claude'

export interface GptProposal {
  id: string
  severity: GptSeverity
  problem: string
  evidence: string
  correction: string
  /** Regla que GPT propone para las decisiones del director (si la hay). */
  rule?: string
  sceneId?: string
  shotId?: string
  imageId?: string
  /** Huella de la escena (y el plano) cuando GPT los revisó: si cambia, la propuesta puede ser vieja. */
  stamp?: string
  status: ProposalStatus
  /** Decisión creada al aceptar (para poder deshacer). */
  decisionId?: string
  resolvedAt?: string
}

export interface GptReview {
  id: string
  at: string
  kind: 'continuity'
  summary: string
  imagesSent: number
  proposals: GptProposal[]
}

export interface GptReviewsFile {
  reviews: GptReview[]
}

/** Revisiones que se conservan (las más nuevas). */
export const KEEP_REVIEWS = 20

const responseSchema = z.object({
  resumen: z.string(),
  hallazgos: z.array(
    z.object({
      escena: z.number().int().nullable(),
      plano: z.number().int().nullable(),
      imagen: z.number().int().nullable(),
      gravedad: z.enum(['alta', 'media', 'baja']),
      problema: z.string().min(1),
      evidencia: z.string(),
      correccion: z.string(),
      regla: z.string().nullable(),
    }),
  ),
})
export type ContinuityResponse = z.infer<typeof responseSchema>

/** Lee la respuesta de GPT. Si no trae el formato pedido, no se usa nada. */
export function parseContinuityResponse(raw: string): { ok: true; data: ContinuityResponse } | { ok: false; error: 'bad-format' } {
  try {
    const r = responseSchema.safeParse(JSON.parse(raw))
    return r.success ? { ok: true, data: r.data } : { ok: false, error: 'bad-format' }
  } catch {
    return { ok: false, error: 'bad-format' }
  }
}

/** Huella de la escena y su plano. */
export function stampOf(scene: Scene, shotId?: string): string {
  const shot = shotId ? shotsOf(scene).find((s) => s.id === shotId) : undefined
  return `${scene.updatedAt}|${shot?.updatedAt ?? ''}`
}

/** ¿La escena (o el plano) cambió o ya no existe desde que GPT la vio? */
export function isStale(p: GptProposal, scenes: Record<string, Scene | undefined>): boolean {
  if (!p.sceneId || !p.stamp) return false
  const scene = scenes[p.sceneId]
  if (!scene) return true
  if (p.shotId && !shotsOf(scene).some((s) => s.id === p.shotId)) return true
  return stampOf(scene, p.shotId) !== p.stamp
}

/** Convierte la respuesta en una revisión: los números de GPT pasan a ids reales; los que no existen se ignoran. */
export function toReview(data: ContinuityResponse, packet: ContinuityPacket, scenes: Record<string, Scene | undefined>, at = nowIso()): GptReview {
  const proposals = data.hallazgos.map((h): GptProposal => {
    const image = h.imagen ? packet.images.find((im) => im.n === h.imagen) : undefined
    const sceneId = (h.escena ? packet.sceneIds[h.escena - 1] : undefined) ?? image?.sceneId
    const shotId = (sceneId && h.plano ? packet.shotIds[sceneId]?.[h.plano - 1] : undefined) ?? (image?.sceneId === sceneId ? image?.shotId : undefined)
    const scene = sceneId ? scenes[sceneId] : undefined
    return {
      id: uid('gp'),
      severity: h.gravedad,
      problem: h.problema.trim(),
      evidence: h.evidencia.trim(),
      correction: h.correccion.trim(),
      rule: h.regla?.trim() || undefined,
      sceneId: scene ? sceneId : undefined,
      shotId: scene ? shotId : undefined,
      imageId: image?.mediaId,
      stamp: scene ? stampOf(scene, shotId) : undefined,
      status: 'pending',
    }
  })
  return { id: uid('gr'), at, kind: 'continuity', summary: data.resumen.trim(), imagesSent: packet.images.length, proposals }
}

/** Agrega una revisión al principio y se queda con las más nuevas. */
export const addReview = (reviews: GptReview[], r: GptReview) => [r, ...reviews].slice(0, KEEP_REVIEWS)

// ---- errores: siempre con calma ----
export type GptErrorKind = 'web' | 'no-codex' | 'no-login' | 'quota' | 'timeout' | 'bad-format' | 'unknown'

export const GPT_ERROR_TEXT: Record<GptErrorKind, string> = {
  web: 'GPT está disponible en la app de Mac.',
  'no-codex': 'No encontré Codex en esta Mac. Cuando esté instalado, puedes volver a intentarlo. No se cambió nada.',
  'no-login': 'Codex necesita iniciar sesión con tu cuenta de ChatGPT. Cuando esté listo, vuelve a intentarlo. No se cambió nada.',
  quota: 'Por ahora se acabó la cuota de GPT. Puedes intentarlo más tarde. No se cambió nada.',
  timeout: 'GPT tardó demasiado y se detuvo la consulta. Puedes intentarlo otra vez. No se cambió nada.',
  'bad-format': 'GPT respondió en un formato que no entiendo, así que no usé su respuesta. No se cambió nada.',
  unknown: 'No se pudo consultar a GPT. No se cambió nada.',
}

/** Traduce el error del comando (o de la validación) a un tipo con mensaje amable. */
export function classifyGptError(err: unknown): GptErrorKind {
  const s = String((err as { message?: string })?.message ?? err ?? '')
  if (s === 'web') return 'web'
  if (s === 'bad-format') return 'bad-format'
  if (s.startsWith('NO_CODEX')) return 'no-codex'
  if (s.startsWith('TIMEOUT')) return 'timeout'
  if (/quota|usage limit|rate.?limit|limit reached|429|too many requests/i.test(s)) return 'quota'
  if (/log ?in|logged|auth|unauthori[sz]ed|401|credential/i.test(s)) return 'no-login'
  return 'unknown'
}

// ---- acciones del director (cada una se puede deshacer) ----
export interface DecisionOps {
  addDecision: (text: string, opts: { proposedBy: 'gpt'; sceneIds?: string[] }) => string | undefined
  approveDecision: (id: string) => void
  removeDecision: (id: string) => void
}

function patchProposal(reviews: GptReview[], reviewId: string, proposalId: string, fn: (p: GptProposal) => GptProposal): GptReview[] {
  return reviews.map((r) => (r.id !== reviewId ? r : { ...r, proposals: r.proposals.map((p) => (p.id === proposalId ? fn(p) : p)) }))
}

export const findProposal = (reviews: GptReview[], reviewId: string, proposalId: string) =>
  reviews.find((r) => r.id === reviewId)?.proposals.find((p) => p.id === proposalId)

/** Aceptar: si trae regla, entra a las decisiones como propuesta de GPT y el director (tú) la aprueba. */
export function acceptProposal(reviews: GptReview[], reviewId: string, proposalId: string, ops: DecisionOps, at = nowIso()): GptReview[] {
  const p = findProposal(reviews, reviewId, proposalId)
  if (!p || p.status === 'accepted') return reviews
  let decisionId: string | undefined
  if (p.rule) {
    decisionId = ops.addDecision(p.rule, { proposedBy: 'gpt', sceneIds: p.sceneId ? [p.sceneId] : undefined })
    if (decisionId) ops.approveDecision(decisionId)
  }
  return patchProposal(reviews, reviewId, proposalId, (x) => ({ ...x, status: 'accepted', decisionId, resolvedAt: at }))
}

/** Deshacer: vuelve a «pendiente» y quita la decisión que se había creado al aceptar. */
export function undoProposal(reviews: GptReview[], reviewId: string, proposalId: string, ops: Pick<DecisionOps, 'removeDecision'>): GptReview[] {
  const p = findProposal(reviews, reviewId, proposalId)
  if (!p || p.status === 'pending') return reviews
  if (p.decisionId) ops.removeDecision(p.decisionId)
  return patchProposal(reviews, reviewId, proposalId, (x) => ({ ...x, status: 'pending', decisionId: undefined, resolvedAt: undefined }))
}

export const discardProposal = (reviews: GptReview[], reviewId: string, proposalId: string, at = nowIso()) =>
  patchProposal(reviews, reviewId, proposalId, (x) => (x.status === 'pending' ? { ...x, status: 'discarded', resolvedAt: at } : x))

/** Editar la regla o la corrección antes de aceptar. */
export const editProposal = (reviews: GptReview[], reviewId: string, proposalId: string, patch: Partial<Pick<GptProposal, 'rule' | 'correction'>>) =>
  patchProposal(reviews, reviewId, proposalId, (x) => (x.status === 'pending' ? { ...x, ...patch, rule: (patch.rule ?? x.rule)?.trim() || undefined } : x))

export const markAskedClaude = (reviews: GptReview[], reviewId: string, proposalId: string, at = nowIso()) =>
  patchProposal(reviews, reviewId, proposalId, (x) => ({ ...x, status: 'asked-claude', resolvedAt: at }))

/** Mensaje para el chat con Claude: qué vio GPT y qué propone. Claude decide cómo corregir. */
export function claudeRequestText(p: GptProposal, sceneNumber?: number): string {
  return [
    `GPT revisó la continuidad${sceneNumber ? ` de la escena ${String(sceneNumber).padStart(2, '0')}` : ''} y propone:`,
    `Problema: ${p.problem}`,
    p.evidence && `Evidencia: ${p.evidence}`,
    p.correction && `Corrección sugerida: ${p.correction}`,
    '¿Puedes revisarlo y corregir lo que haga falta, sin tocar el Canon ni lo aprobado? Avísame qué cambiaste.',
  ]
    .filter(Boolean)
    .join('\n')
}

/** Texto completo de un hallazgo para escucharlo (problema, evidencia, corrección y regla: nada se salta). */
export function proposalSpeechText(p: GptProposal, sceneNumber?: number): string {
  const end = (s: string) => (/[.!?…]$/.test(s.trim()) ? s.trim() : `${s.trim()}.`)
  return [
    `Hallazgo de prioridad ${p.severity}${sceneNumber ? `, escena ${String(sceneNumber).padStart(2, '0')}` : ''}.`,
    `Problema: ${end(p.problem)}`,
    p.evidence && `Evidencia: ${end(p.evidence)}`,
    p.correction && `Corrección: ${end(p.correction)}`,
    p.rule && `Regla propuesta: ${end(p.rule)}`,
  ]
    .filter(Boolean)
    .join(' ')
}

/** Texto del resumen inicial de una revisión para escucharlo. */
export function reviewSummarySpeechText(r: Pick<GptReview, 'summary' | 'proposals'>): string {
  const n = r.proposals.length
  const count = n ? `GPT propone ${n} ${n === 1 ? 'cambio' : 'cambios'}.` : 'GPT no encontró problemas.'
  return `Resumen de la revisión de GPT. ${r.summary.trim()} ${count}`.replace(/\s+/g, ' ').trim()
}
