// «Consultar GPT» en guion y diálogos: paquete por escena, respuesta validada y propuestas que el director decide.
// Ninguna propuesta cambia la escena sola: al Aceptar, la app la aplica con sus acciones de siempre (deshacer + guardado).
// Si la línea o la acción cambió desde que GPT la vio, se avisa antes de aplicar.
import { z } from 'zod'
import type { Project, Scene } from '../../types'
import { nowIso, uid } from '../../utils'
import { approvedDecisions, phaseOf, phasesOf } from '../continuity/continuity'
import { shotsOf } from '../coverage/shots'
import { parseDialogue, serializeDialogue, type DialogueLine } from '../dialogue/lines'
import { styleSpanish } from '../project-style/style'
import { changesSince, historyForPrompt, patchThread, type GptThread, type ThreadSeen } from './threads'

export type ScriptProposalKind = 'action' | 'line-edit' | 'line-add' | 'line-remove'
export type ScriptProposalStatus = 'pending' | 'accepted' | 'discarded' | 'asked-claude'

export interface ScriptProposal {
  id: string
  kind: ScriptProposalKind
  /** Línea (empieza en 1). En «line-add» es después de cuál va (0 = al principio). */
  line?: number
  speaker?: string
  emotion?: string
  /** Acción completa nueva (action) o lo que dice la línea (diálogos). */
  text: string
  reason: string
  /** Lo que GPT vio: la línea (serializada) o la acción. Si ya no está igual, la propuesta puede ser vieja. */
  before: string
  status: ScriptProposalStatus
  /** Al aceptar: el campo y su valor antes y después (para Deshacer). */
  applied?: { field: 'action' | 'dialogue'; before: string; after: string }
  resolvedAt?: string
}

/** Tope de propuestas por respuesta. */
export const MAX_PROPOSALS = 8
/** Tope de caracteres por personaje y por escena vecina (cuida la cuota). */
const CHAR_DESC = 220
const NEIGHBOR = 200

const clip = (t: string | undefined, max: number) => {
  const s = (t ?? '').trim().replace(/\s+/g, ' ')
  return s.length > max ? `${s.slice(0, max - 1)}…` : s
}

const lineText = (l: DialogueLine) => serializeDialogue([l])
/** Lo que dice un personaje va como «—texto» (formato de siempre), aunque GPT olvide el guion largo. */
const spoken = (speaker: string, text: string) => (speaker.trim() && !/^[—–-]/.test(text.trim()) ? `—${text.trim()}` : text.trim())

/** Lo que GPT ve ahora de la escena (se guarda en el hilo para avisar cambios la próxima vez). */
export const seenOf = (project: Project, scene: Scene): ThreadSeen => ({
  action: scene.script.action,
  dialogue: scene.script.dialogue,
  decisionIds: approvedDecisions(project).map((d) => d.id),
})

export interface ScriptPacket {
  prompt: string
  seen: ThreadSeen
}

/**
 * Paquete para guion y diálogos: proyecto, estilo, etapas, decisiones APROBADAS, personajes,
 * la escena (con líneas numeradas), escenas vecinas, el historial del hilo y el pedido.
 * No va: decisiones propuestas o rechazadas, prompts de generación, chat con Claude, imágenes, rutas.
 */
export function buildScriptPacket(project: Project, ordered: Scene[], scene: Scene, thread: GptThread, request: string): ScriptPacket {
  const i = ordered.findIndex((s) => s.id === scene.id)
  const number = new Map(ordered.map((s, k) => [s.id, k + 1]))
  const phases = phasesOf(project)
  const seen = seenOf(project, scene)
  const decisions = approvedDecisions(project)
    .map((d) => `- ${d.text}${d.sceneIds?.length ? ` (escenas ${d.sceneIds.map((id) => number.get(id)).filter(Boolean).join(', ')})` : ''}`)
    .join('\n')
  const characters = (project.characters ?? [])
    .filter((c) => c.name.trim())
    .map((c) => `- ${c.name.trim()}${c.role?.trim() ? ` (${c.role.trim()})` : ''}${c.description.trim() ? `: ${clip(c.description, CHAR_DESC)}` : ''}`)
    .join('\n')
  const lines = parseDialogue(scene.script.dialogue)
  const neighbor = (s: Scene | undefined, label: string) => (s ? `${label}: escena ${number.get(s.id)} «${s.title}» — ${clip(s.script.action, NEIGHBOR) || '(sin acción)'}` : '')
  const shots = shotsOf(scene)
  const changes = changesSince(thread.seen, seen)
  const history = historyForPrompt(thread)

  const prompt = [
    'Eres coguionista de un storyboard. El director te pide ayuda con la acción y los diálogos de UNA escena.',
    'Responde en español. Propón cambios concretos (máximo 8); el director decide cuáles acepta.',
    'Respeta las decisiones aprobadas del director y la etapa de la escena: no las contradigas. No inventes personajes nuevos sin decirlo.',
    'Tipos de propuesta: «accion» (texto = la acción visual completa nueva), «cambiar_linea» (linea = número; personaje y emocion o null para dejarlos igual; texto = lo que dice),',
    '«agregar_linea» (linea = después de cuál, 0 = al principio; personaje, emocion y texto), «quitar_linea» (linea = número; texto vacío).',
    'Los diálogos van como «—texto». En «resumen_hilo» resume en pocas líneas todo lo platicado hasta ahora (para retomarlo otro día).',
    '',
    `Proyecto: «${project.title}»`,
    styleSpanish(project) && `Estilo: ${styleSpanish(project)}`,
    `Etapas en orden: ${phases.length ? phases.map((p) => p.name).join(' → ') : '(sin etapas)'}`,
    '',
    'Decisiones aprobadas por el director:',
    decisions || '(ninguna)',
    '',
    'Personajes:',
    characters || '(sin personajes)',
    '',
    `Escena ${i + 1} de ${ordered.length} · «${scene.title}» · etapa: ${phaseOf(project, scene)?.name ?? 'sin etapa'}`,
    neighbor(ordered[i - 1], 'Anterior'),
    neighbor(ordered[i + 1], 'Siguiente'),
    `Acción visual: ${scene.script.action.trim() || '(vacía)'}`,
    'Diálogos (numerados):',
    lines.length ? lines.map((l, k) => `${k + 1}. ${lineText(l)}`).join('\n') : '(sin diálogos)',
    scene.script.soundDirection.trim() && `Sonido: ${clip(scene.script.soundDirection, NEIGHBOR)}`,
    shots.length > 1 && `Planos: ${shots.map((s, k) => `${k + 1} «${s.name ?? ''}»`).join(', ')}`,
    changes.length ? `\nEsto cambió desde la última vez:\n${changes.map((c) => `- ${c}`).join('\n')}` : '',
    history ? `\n${history}` : '',
    '',
    `Pedido del director: ${request.trim()}`,
  ]
    .filter((x) => x !== false && x !== '')
    .join('\n')

  return { prompt, seen }
}

const responseSchema = z.object({
  respuesta: z.string(),
  resumen_hilo: z.string(),
  propuestas: z.array(
    z.object({
      tipo: z.enum(['accion', 'cambiar_linea', 'agregar_linea', 'quitar_linea']),
      linea: z.number().int().nullable(),
      personaje: z.string().nullable(),
      emocion: z.string().nullable(),
      texto: z.string(),
      motivo: z.string(),
    }),
  ),
})
export type ScriptResponse = z.infer<typeof responseSchema>

/** Lee la respuesta de GPT. Si no trae el formato pedido, no se usa nada. */
export function parseScriptResponse(raw: string): { ok: true; data: ScriptResponse } | { ok: false; error: 'bad-format' } {
  try {
    const r = responseSchema.safeParse(JSON.parse(raw))
    return r.success ? { ok: true, data: r.data } : { ok: false, error: 'bad-format' }
  } catch {
    return { ok: false, error: 'bad-format' }
  }
}

const KIND: Record<ScriptResponse['propuestas'][number]['tipo'], ScriptProposalKind> = {
  accion: 'action',
  cambiar_linea: 'line-edit',
  agregar_linea: 'line-add',
  quitar_linea: 'line-remove',
}

/** Convierte las propuestas de GPT en propuestas pendientes. Las que apuntan a líneas que no existen se ignoran. */
export function toScriptProposals(data: ScriptResponse, scene: Scene): ScriptProposal[] {
  const lines = parseDialogue(scene.script.dialogue)
  const out: ScriptProposal[] = []
  for (const g of data.propuestas.slice(0, MAX_PROPOSALS)) {
    const kind = KIND[g.tipo]
    const text = g.texto.trim()
    const base = { id: uid('gs'), kind, text, reason: g.motivo.trim(), status: 'pending' as const }
    if (kind === 'action') {
      if (text) out.push({ ...base, before: scene.script.action })
      continue
    }
    const n = g.linea ?? -1
    if (kind === 'line-add') {
      if (n < 0 || n > lines.length || !text) continue
      out.push({ ...base, line: n, speaker: g.personaje?.trim() ?? '', emotion: g.emocion?.trim() ?? '', before: n ? lineText(lines[n - 1]) : '' })
      continue
    }
    if (n < 1 || n > lines.length) continue
    if (kind === 'line-edit' && !text) continue
    out.push({ ...base, line: n, speaker: g.personaje?.trim() || undefined, emotion: g.emocion?.trim() ?? undefined, before: lineText(lines[n - 1]) })
  }
  return out
}

/** Dónde cae la propuesta hoy. Si la línea se movió pero sigue igual, se sigue. Si cambió, es vieja. */
export function resolveTarget(p: ScriptProposal, scene: Scene): { index: number; stale: boolean } {
  if (p.kind === 'action') return { index: 0, stale: scene.script.action !== p.before }
  const lines = parseDialogue(scene.script.dialogue).map(lineText)
  const n = p.line ?? 0
  if (p.kind === 'line-add' && n === 0) return { index: -1, stale: false }
  if (lines[n - 1] === p.before) return { index: n - 1, stale: false }
  const moved = lines.indexOf(p.before)
  if (moved >= 0) return { index: moved, stale: false }
  if (p.kind === 'line-add') return { index: Math.min(n, lines.length) - 1, stale: true }
  return { index: n - 1 < lines.length ? n - 1 : -2, stale: true }
}

export const isScriptStale = (p: ScriptProposal, scene: Scene | undefined) => !scene || (p.status === 'pending' && resolveTarget(p, scene).stale)

/** Valor nuevo del campo si se acepta. `missing` = la línea ya no existe. */
export function applyScriptProposal(p: ScriptProposal, scene: Scene): { ok: true; field: 'action' | 'dialogue'; value: string } | { ok: false; error: 'missing' } {
  if (p.kind === 'action') return { ok: true, field: 'action', value: p.text }
  const lines = parseDialogue(scene.script.dialogue)
  const { index } = resolveTarget(p, scene)
  if (p.kind === 'line-add') {
    const next = [...lines]
    next.splice(index + 1, 0, { speaker: p.speaker ?? '', emotion: p.emotion ?? '', text: spoken(p.speaker ?? '', p.text) })
    return { ok: true, field: 'dialogue', value: serializeDialogue(next) }
  }
  if (index < 0 || index >= lines.length) return { ok: false, error: 'missing' }
  if (p.kind === 'line-remove') return { ok: true, field: 'dialogue', value: serializeDialogue(lines.filter((_, k) => k !== index)) }
  const cur = lines[index]
  const speaker = p.speaker ?? cur.speaker
  const edited = { speaker, emotion: p.emotion ?? cur.emotion, text: spoken(speaker, p.text) }
  return { ok: true, field: 'dialogue', value: serializeDialogue(lines.map((l, k) => (k === index ? edited : l))) }
}

// ---- acciones del director sobre las propuestas (cada una se puede deshacer) ----
export interface ScriptOps {
  /** Cambia un campo del guion con la acción de siempre (deshacer + guardado). */
  setScriptField: (sceneId: string, field: 'action' | 'dialogue', value: string) => void
}

export interface ProposalRef {
  threadId: string
  messageId: string
  proposalId: string
}

function patchProposal(threads: GptThread[], ref: ProposalRef, fn: (p: ScriptProposal) => ScriptProposal): GptThread[] {
  return patchThread(threads, ref.threadId, (t) => ({
    ...t,
    messages: t.messages.map((m) => (m.id !== ref.messageId ? m : { ...m, proposals: m.proposals?.map((p) => (p.id === ref.proposalId ? fn(p) : p)) })),
  }))
}

export const findScriptProposal = (threads: GptThread[], ref: ProposalRef) =>
  threads.find((t) => t.id === ref.threadId)?.messages.find((m) => m.id === ref.messageId)?.proposals?.find((p) => p.id === ref.proposalId)

export type AcceptResult = { ok: true; threads: GptThread[] } | { ok: false; error: 'missing' | 'not-pending' }

/** Aceptar: aplica el cambio en la escena con las acciones de siempre y guarda cómo deshacerlo. */
export function acceptScriptProposal(threads: GptThread[], ref: ProposalRef, scene: Scene, ops: ScriptOps, at = nowIso()): AcceptResult {
  const p = findScriptProposal(threads, ref)
  if (!p || p.status !== 'pending') return { ok: false, error: 'not-pending' }
  const r = applyScriptProposal(p, scene)
  if (!r.ok) return r
  const before = scene.script[r.field]
  ops.setScriptField(scene.id, r.field, r.value)
  return { ok: true, threads: patchProposal(threads, ref, (x) => ({ ...x, status: 'accepted', applied: { field: r.field, before, after: r.value }, resolvedAt: at })) }
}

export type UndoResult = { ok: true; threads: GptThread[] } | { ok: false; error: 'changed' }

/** Deshacer: vuelve a «pendiente». Si se había aplicado, regresa el campo como estaba, salvo que se haya editado después. */
export function undoScriptProposal(threads: GptThread[], ref: ProposalRef, scene: Scene | undefined, ops: ScriptOps): UndoResult {
  const p = findScriptProposal(threads, ref)
  if (!p || p.status === 'pending') return { ok: true, threads }
  if (p.applied) {
    if (!scene || scene.script[p.applied.field] !== p.applied.after) return { ok: false, error: 'changed' }
    ops.setScriptField(scene.id, p.applied.field, p.applied.before)
  }
  return { ok: true, threads: patchProposal(threads, ref, (x) => ({ ...x, status: 'pending', applied: undefined, resolvedAt: undefined })) }
}

export const discardScriptProposal = (threads: GptThread[], ref: ProposalRef, at = nowIso()) =>
  patchProposal(threads, ref, (x) => (x.status === 'pending' ? { ...x, status: 'discarded', resolvedAt: at } : x))

/** Editar la propuesta antes de aceptarla. */
export const editScriptProposal = (threads: GptThread[], ref: ProposalRef, patch: Partial<Pick<ScriptProposal, 'text' | 'speaker' | 'emotion'>>) =>
  patchProposal(threads, ref, (x) => (x.status === 'pending' ? { ...x, ...patch } : x))

export const markScriptAskedClaude = (threads: GptThread[], ref: ProposalRef, at = nowIso()) =>
  patchProposal(threads, ref, (x) => (x.status === 'pending' ? { ...x, status: 'asked-claude', resolvedAt: at } : x))

/** Texto corto de la propuesta para la interfaz y para Claude. */
export function describeScriptProposal(p: ScriptProposal): string {
  const who = [p.speaker, p.emotion && `(${p.emotion})`].filter(Boolean).join(' ')
  switch (p.kind) {
    case 'action':
      return `Cambiar la acción visual a: «${p.text}»`
    case 'line-edit':
      return `Cambiar la línea ${p.line}${who ? ` (${who})` : ''} a: «${p.text}»`
    case 'line-add':
      return `${p.line ? `Agregar después de la línea ${p.line}` : 'Agregar al principio'}: ${who ? `${who}: ` : ''}«${p.text}»`
    case 'line-remove':
      return `Quitar la línea ${p.line}: «${p.before}»`
  }
}

/** Mensaje para el chat con Claude: qué propone GPT. Claude decide cómo aplicarlo. */
export function scriptClaudeText(p: ScriptProposal, sceneNumber?: number): string {
  return [
    `GPT propone para el guion${sceneNumber ? ` de la escena ${String(sceneNumber).padStart(2, '0')}` : ''}:`,
    describeScriptProposal(p),
    p.reason && `Motivo: ${p.reason}`,
    '¿Puedes revisarlo y aplicarlo si tiene sentido, sin tocar el Canon ni lo aprobado? Avísame qué cambiaste.',
  ]
    .filter(Boolean)
    .join('\n')
}
