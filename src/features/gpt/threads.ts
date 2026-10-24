// Conversaciones con GPT por apartado (hilos con historial). Codex corre `--ephemeral`:
// el historial lo guarda IKRAL en gpt-hilos.json, no OpenAI. Se pueden abrir varios hilos, retomar y archivar.
import { nowIso, uid } from '../../utils'
import type { ScriptProposal } from './script'

export type GptSection = 'script'

export interface GptMessage {
  id: string
  from: 'director' | 'gpt'
  at: string
  text: string
  /** Solo en mensajes de GPT: propuestas concretas que el director acepta o no. */
  proposals?: ScriptProposal[]
}

/** Lo que GPT vio la última vez (para decirle «esto cambió desde la última vez»). */
export interface ThreadSeen {
  action: string
  dialogue: string
  decisionIds: string[]
}

export interface GptThread {
  id: string
  section: GptSection
  sceneId: string
  title: string
  createdAt: string
  updatedAt: string
  archived?: boolean
  /** Resumen de lo platicado (lo actualiza GPT en cada respuesta). */
  summary?: string
  seen?: ThreadSeen
  messages: GptMessage[]
}

export interface GptThreadsFile {
  threads: GptThread[]
}

/** Mensajes que van completos; lo anterior va como resumen. */
export const KEEP_RECENT = 6
/** Tope de caracteres por mensaje viejo cuando no hay resumen de GPT. */
const OLD_CHARS = 160

const oneLine = (t: string, max: number) => {
  const s = t.trim().replace(/\s+/g, ' ')
  return s.length > max ? `${s.slice(0, max - 1)}…` : s
}

export function newThread(sceneId: string, title: string, at = nowIso()): GptThread {
  return { id: uid('gh'), section: 'script', sceneId, title: title.trim() || 'Conversación', createdAt: at, updatedAt: at, messages: [] }
}

export function threadsFor(threads: GptThread[], sceneId: string, archived = false) {
  return threads.filter((t) => t.section === 'script' && t.sceneId === sceneId && !!t.archived === archived).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export const upsertThread = (threads: GptThread[], t: GptThread) => (threads.some((x) => x.id === t.id) ? threads.map((x) => (x.id === t.id ? t : x)) : [t, ...threads])

export const patchThread = (threads: GptThread[], id: string, fn: (t: GptThread) => GptThread) => threads.map((t) => (t.id === id ? fn(t) : t))

export const setArchived = (threads: GptThread[], id: string, archived: boolean) => patchThread(threads, id, (t) => ({ ...t, archived: archived || undefined }))

export function addMessage(t: GptThread, msg: Omit<GptMessage, 'id' | 'at'> & { at?: string }): GptThread {
  const m: GptMessage = { id: uid('gm'), ...msg, at: msg.at ?? nowIso() }
  return { ...t, updatedAt: m.at, messages: [...t.messages, m] }
}

const STATUS_WORD: Record<ScriptProposal['status'], string> = {
  pending: 'pendiente',
  accepted: 'aceptada',
  discarded: 'descartada',
  'asked-claude': 'enviada a Claude',
}

/** Historial para el paquete: resumen de lo viejo + los últimos mensajes completos. */
export function historyForPrompt(t: GptThread): string {
  const recent = t.messages.slice(-KEEP_RECENT)
  const old = t.messages.slice(0, -KEEP_RECENT)
  const who = (m: GptMessage) => (m.from === 'director' ? 'Director' : 'GPT')
  let out = ''
  if (old.length) {
    out += 'Resumen de lo platicado antes:\n'
    out += t.summary?.trim() ? `${t.summary.trim()}\n` : old.map((m) => `- ${who(m)}: ${oneLine(m.text, OLD_CHARS)}`).join('\n') + '\n'
    out += '\n'
  }
  if (recent.length) {
    out += 'Últimos mensajes:\n'
    out += recent
      .map((m) => {
        const props = m.proposals?.length ? `\n  (propuso ${m.proposals.length}: ${m.proposals.map((p) => STATUS_WORD[p.status]).join(', ')})` : ''
        return `${who(m)}: ${m.text.trim()}${props}`
      })
      .join('\n')
  }
  return out.trimEnd()
}

/** ¿Qué cambió desde la última respuesta de GPT? Lista vacía = nada. */
export function changesSince(seen: ThreadSeen | undefined, now: ThreadSeen): string[] {
  if (!seen) return []
  const out: string[] = []
  if (seen.action !== now.action) out.push('La acción visual de la escena cambió.')
  if (seen.dialogue !== now.dialogue) out.push('Los diálogos de la escena cambiaron.')
  const added = now.decisionIds.filter((id) => !seen.decisionIds.includes(id)).length
  const removed = seen.decisionIds.filter((id) => !now.decisionIds.includes(id)).length
  if (added || removed) out.push('Las decisiones aprobadas del director cambiaron.')
  return out
}
