// Conversaciones con GPT por apartado (hilos con historial). Codex corre `--ephemeral`:
// el historial lo guarda IKRAL en gpt-hilos.json, no OpenAI. Se pueden abrir varios hilos, retomar y archivar.
import { nowIso, uid } from '../../utils'
import type { ScriptProposal } from './script'

/**
 * «script» = guion de una escena (sceneId = la escena). «bible» = Biblia (sceneId = el apartado: «style» o «<tipo>:<id>»).
 * «coverage» = cobertura de una escena (sceneId = la escena) o un plano (sceneId = «<escena>#<plano>»).
 * «edit» = edición de toda la película: ritmo, orden y duración (sceneId = «project»).
 */
export type GptSection = 'script' | 'bible' | 'coverage' | 'edit'

export type GptProposalStatus = 'pending' | 'accepted' | 'discarded' | 'asked-claude'

export interface GptMessage<P = ScriptProposal> {
  id: string
  from: 'director' | 'gpt'
  at: string
  text: string
  /** Solo en mensajes de GPT: propuestas concretas que el director acepta o no. */
  proposals?: P[]
}

/** Lo que GPT vio la última vez (para decirle «esto cambió desde la última vez»). */
export interface ThreadSeen {
  action: string
  dialogue: string
  decisionIds: string[]
}

export interface GptThread<P = ScriptProposal, S = ThreadSeen> {
  id: string
  section: GptSection
  /** Escena (guion) o apartado de la Biblia. */
  sceneId: string
  title: string
  createdAt: string
  updatedAt: string
  archived?: boolean
  /** Resumen de lo platicado (lo actualiza GPT en cada respuesta). */
  summary?: string
  seen?: S
  messages: GptMessage<P>[]
}

export interface GptThreadsFile {
  threads: GptThread[]
}

/** Cualquier hilo guardado (guion o Biblia): para leer y guardar el archivo completo sin perder ninguno. */
export type StoredThread = GptThread<{ status: GptProposalStatus }, unknown>

/** Mensajes que van completos; lo anterior va como resumen. */
export const KEEP_RECENT = 6
/** Tope de caracteres por mensaje viejo cuando no hay resumen de GPT. */
const OLD_CHARS = 160

const oneLine = (t: string, max: number) => {
  const s = t.trim().replace(/\s+/g, ' ')
  return s.length > max ? `${s.slice(0, max - 1)}…` : s
}

export function newThread<P = ScriptProposal, S = ThreadSeen>(sceneId: string, title: string, at = nowIso(), section: GptSection = 'script'): GptThread<P, S> {
  return { id: uid('gh'), section, sceneId, title: title.trim() || 'Conversación', createdAt: at, updatedAt: at, messages: [] }
}

type Listed = { section: GptSection; sceneId: string; archived?: boolean; updatedAt: string }

export function threadsFor<T extends Listed>(threads: T[], sceneId: string, archived = false, section: GptSection = 'script') {
  return threads.filter((t) => t.section === section && t.sceneId === sceneId && !!t.archived === archived).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

type Keyed = { id: string }

export const upsertThread = <T extends Keyed>(threads: T[], t: T) => (threads.some((x) => x.id === t.id) ? threads.map((x) => (x.id === t.id ? t : x)) : [t, ...threads])

export const patchThread = <T extends Keyed>(threads: T[], id: string, fn: (t: T) => T) => threads.map((t) => (t.id === id ? fn(t) : t))

export const setArchived = <T extends Keyed & { archived?: boolean }>(threads: T[], id: string, archived: boolean) =>
  patchThread(threads, id, (t) => ({ ...t, archived: archived || undefined }))

export function addMessage<P, S>(t: GptThread<P, S>, msg: Omit<GptMessage<P>, 'id' | 'at'> & { at?: string }): GptThread<P, S> {
  const m: GptMessage<P> = { id: uid('gm'), ...msg, at: msg.at ?? nowIso() }
  return { ...t, updatedAt: m.at, messages: [...t.messages, m] }
}

const STATUS_WORD: Record<GptProposalStatus, string> = {
  pending: 'pendiente',
  accepted: 'aceptada',
  discarded: 'descartada',
  'asked-claude': 'enviada a Claude',
}

/**
 * Une el archivo de hilos al guardar: cada panel solo manda los hilos de SU apartado;
 * los de los otros apartados se toman del archivo como están (para no pisar lo que guardó otro panel).
 */
export function mergeSection<T extends { section: GptSection }>(onDisk: T[], mine: T[], section: GptSection): T[] {
  return [...mine.filter((t) => t.section === section), ...onDisk.filter((t) => t.section !== section)]
}

/** Historial para el paquete: resumen de lo viejo + los últimos mensajes completos. */
export function historyForPrompt(t: { summary?: string; messages: GptMessage<{ status: GptProposalStatus }>[] }): string {
  const recent = t.messages.slice(-KEEP_RECENT)
  const old = t.messages.slice(0, -KEEP_RECENT)
  const who = (m: { from: GptMessage['from'] }) => (m.from === 'director' ? 'Director' : 'GPT')
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
