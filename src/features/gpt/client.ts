// Consulta a GPT (vía Codex en la app de Mac). En la web no hay Codex: avisa con calma.
// Nada de lo que responde GPT se aplica solo: devuelve una revisión con propuestas pendientes.
import type { Project, Scene } from '../../types'
import { isDesktop, mediaDiskPath } from '../../database/db'
import schemaText from './schemas/continuity.json?raw'
import scriptSchemaText from './schemas/script.json?raw'
import { buildContinuityPacket } from './context'
import { classifyGptError, GPT_ERROR_TEXT, parseContinuityResponse, toReview, type GptErrorKind, type GptReview } from './proposals'
import { buildScriptPacket, parseScriptResponse, toScriptProposals } from './script'
import bibleSchemaText from './schemas/bible.json?raw'
import { buildBiblePacket, parseBibleResponse, toBibleProposals, type BibleThread } from './bible'
import coverageSchemaText from './schemas/coverage.json?raw'
import { buildCoveragePacket, parseCoverageResponse, toCoverageProposals, type CoverageThread } from './coverage'
import editSchemaText from './schemas/edit.json?raw'
import { buildEditPacket, parseEditResponse, toEditProposals, type EditThread } from './edit'
import chatSchemaText from './schemas/chat.json?raw'
import { buildChatPacket, parseChatResponse, type ChatThread } from './chat'
import { addMessage, type GptThread } from './threads'

/** Tiempo máximo de una consulta. */
export const GPT_TIMEOUT_SECS = 240

export interface GptDeps {
  desktop: () => boolean
  diskPath: (mediaId: string) => Promise<{ file: string; icon: string } | null>
  consult: (args: { prompt: string; schema: string; images: string[]; timeoutSecs: number }) => Promise<string>
}

const defaultDeps: GptDeps = {
  desktop: isDesktop,
  diskPath: mediaDiskPath,
  consult: async (args) => {
    const { invoke } = await import('@tauri-apps/api/core')
    return invoke<string>('consultar_gpt', args)
  },
}

export type ReviewResult = { ok: true; review: GptReview; imagesLeftOut: number } | { ok: false; kind: GptErrorKind; message: string }

const fail = (kind: GptErrorKind): ReviewResult => ({ ok: false, kind, message: GPT_ERROR_TEXT[kind] })

/** Revisión de continuidad con GPT: texto + miniaturas de las imágenes aprobadas. */
export async function runContinuityReview(
  project: Project,
  ordered: Scene[],
  scenes: Record<string, Scene | undefined>,
  deps: GptDeps = defaultDeps,
): Promise<ReviewResult> {
  if (!deps.desktop()) return fail('web')
  const packet = buildContinuityPacket(project, ordered)
  try {
    // Miniaturas (no los originales): pesan poco y bastan para ver continuidad.
    const paths = await Promise.all(packet.images.map((im) => deps.diskPath(im.mediaId).catch(() => null)))
    const images = paths.map((p) => p?.icon || p?.file).filter((p): p is string => !!p)
    const raw = await deps.consult({ prompt: packet.prompt, schema: schemaText, images, timeoutSecs: GPT_TIMEOUT_SECS })
    const parsed = parseContinuityResponse(raw)
    if (!parsed.ok) return fail('bad-format')
    return { ok: true, review: toReview(parsed.data, packet, scenes), imagesLeftOut: packet.imagesLeftOut }
  } catch (e) {
    return fail(classifyGptError(e))
  }
}

export type ScriptConsultResult = { ok: true; thread: GptThread } | { ok: false; kind: GptErrorKind; message: string }

/**
 * Un mensaje del director en un hilo de guion y diálogos. Devuelve el hilo con el mensaje del director
 * y la respuesta de GPT (propuestas pendientes). Si falla, no devuelve nada nuevo: el hilo queda igual.
 */
export async function runScriptConsult(
  project: Project,
  ordered: Scene[],
  scene: Scene,
  thread: GptThread,
  request: string,
  deps: GptDeps = defaultDeps,
): Promise<ScriptConsultResult> {
  if (!deps.desktop()) return { ok: false, kind: 'web', message: GPT_ERROR_TEXT.web }
  const packet = buildScriptPacket(project, ordered, scene, thread, request)
  try {
    const raw = await deps.consult({ prompt: packet.prompt, schema: scriptSchemaText, images: [], timeoutSecs: GPT_TIMEOUT_SECS })
    const parsed = parseScriptResponse(raw)
    if (!parsed.ok) return { ok: false, kind: 'bad-format', message: GPT_ERROR_TEXT['bad-format'] }
    let next = addMessage(thread, { from: 'director', text: request.trim() })
    next = addMessage(next, { from: 'gpt', text: parsed.data.respuesta.trim(), proposals: toScriptProposals(parsed.data, scene) })
    return { ok: true, thread: { ...next, summary: parsed.data.resumen_hilo.trim() || thread.summary, seen: packet.seen } }
  } catch (e) {
    const kind = classifyGptError(e)
    return { ok: false, kind, message: GPT_ERROR_TEXT[kind] }
  }
}

export type BibleConsultResult = { ok: true; thread: BibleThread } | { ok: false; kind: GptErrorKind; message: string }

/**
 * Un mensaje del director en un hilo de la Biblia (estilo o una ficha). `scenes`: el guion guardado, en orden. Devuelve el hilo con el mensaje
 * y la respuesta de GPT (propuestas pendientes). Si falla, el hilo queda igual.
 */
export async function runBibleConsult(
  project: Project,
  scenes: Scene[],
  key: string,
  thread: BibleThread,
  request: string,
  deps: GptDeps = defaultDeps,
): Promise<BibleConsultResult> {
  if (!deps.desktop()) return { ok: false, kind: 'web', message: GPT_ERROR_TEXT.web }
  const packet = buildBiblePacket(project, key, thread, request, scenes)
  if (!packet) return { ok: false, kind: 'bad-format', message: 'Ese apartado ya no existe en la Biblia. No se cambió nada.' }
  try {
    // Solo la miniatura de la imagen Canon de la ficha (si no está en disco, va sin imagen).
    const paths = await Promise.all(packet.images.map((id) => deps.diskPath(id).catch(() => null)))
    const images = paths.map((p) => p?.icon || p?.file).filter((p): p is string => !!p)
    const raw = await deps.consult({ prompt: packet.prompt, schema: bibleSchemaText, images, timeoutSecs: GPT_TIMEOUT_SECS })
    const parsed = parseBibleResponse(raw)
    if (!parsed.ok) return { ok: false, kind: 'bad-format', message: GPT_ERROR_TEXT['bad-format'] }
    let next = addMessage(thread, { from: 'director', text: request.trim() })
    next = addMessage(next, { from: 'gpt', text: parsed.data.respuesta.trim(), proposals: toBibleProposals(parsed.data, project, key) })
    return { ok: true, thread: { ...next, summary: parsed.data.resumen_hilo.trim() || thread.summary, seen: packet.seen } }
  } catch (e) {
    const kind = classifyGptError(e)
    return { ok: false, kind, message: GPT_ERROR_TEXT[kind] }
  }
}

export type CoverageConsultResult = { ok: true; thread: CoverageThread } | { ok: false; kind: GptErrorKind; message: string }

/**
 * Un mensaje del director en un hilo de cobertura (la escena) o de un plano (`key` = «<escena>#<plano>»).
 * Devuelve el hilo con el mensaje y la respuesta de GPT (propuestas pendientes). Si falla, el hilo queda igual.
 */
export async function runCoverageConsult(
  project: Project,
  ordered: Scene[],
  scene: Scene,
  key: string,
  thread: CoverageThread,
  request: string,
  deps: GptDeps = defaultDeps,
): Promise<CoverageConsultResult> {
  if (!deps.desktop()) return { ok: false, kind: 'web', message: GPT_ERROR_TEXT.web }
  const packet = buildCoveragePacket(project, ordered, scene, key, thread, request)
  if (!packet) return { ok: false, kind: 'bad-format', message: 'Ese plano ya no existe. No se cambió nada.' }
  try {
    const raw = await deps.consult({ prompt: packet.prompt, schema: coverageSchemaText, images: [], timeoutSecs: GPT_TIMEOUT_SECS })
    const parsed = parseCoverageResponse(raw)
    if (!parsed.ok) return { ok: false, kind: 'bad-format', message: GPT_ERROR_TEXT['bad-format'] }
    let next = addMessage(thread, { from: 'director', text: request.trim() })
    next = addMessage(next, { from: 'gpt', text: parsed.data.respuesta.trim(), proposals: toCoverageProposals(parsed.data, scene, key) })
    return { ok: true, thread: { ...next, summary: parsed.data.resumen_hilo.trim() || thread.summary, seen: packet.seen } }
  } catch (e) {
    const kind = classifyGptError(e)
    return { ok: false, kind, message: GPT_ERROR_TEXT[kind] }
  }
}

export type EditConsultResult = { ok: true; thread: EditThread } | { ok: false; kind: GptErrorKind; message: string }

/**
 * Un mensaje del director en un hilo de Edición (ritmo, orden y duración de toda la película).
 * Devuelve el hilo con el mensaje y la respuesta de GPT (propuestas pendientes). Si falla, el hilo queda igual.
 */
export async function runEditConsult(project: Project, ordered: Scene[], thread: EditThread, request: string, deps: GptDeps = defaultDeps): Promise<EditConsultResult> {
  if (!deps.desktop()) return { ok: false, kind: 'web', message: GPT_ERROR_TEXT.web }
  const packet = buildEditPacket(project, ordered, thread, request)
  try {
    const raw = await deps.consult({ prompt: packet.prompt, schema: editSchemaText, images: [], timeoutSecs: GPT_TIMEOUT_SECS })
    const parsed = parseEditResponse(raw)
    if (!parsed.ok) return { ok: false, kind: 'bad-format', message: GPT_ERROR_TEXT['bad-format'] }
    let next = addMessage(thread, { from: 'director', text: request.trim() })
    next = addMessage(next, { from: 'gpt', text: parsed.data.respuesta.trim(), proposals: toEditProposals(parsed.data, ordered) })
    return { ok: true, thread: { ...next, summary: parsed.data.resumen_hilo.trim() || thread.summary, seen: packet.seen } }
  } catch (e) {
    const kind = classifyGptError(e)
    return { ok: false, kind, message: GPT_ERROR_TEXT[kind] }
  }
}

export type ChatConsultResult = { ok: true; thread: ChatThread } | { ok: false; kind: GptErrorKind; message: string }

/** Un mensaje del director en la ventanita flotante. Devuelve el hilo con el mensaje y la respuesta. Si falla, el hilo queda igual. */
export async function runChatConsult(project: Project, ordered: Scene[], thread: ChatThread, request: string, current?: string | null, deps: GptDeps = defaultDeps): Promise<ChatConsultResult> {
  if (!deps.desktop()) return { ok: false, kind: 'web', message: GPT_ERROR_TEXT.web }
  const prompt = buildChatPacket(project, ordered, thread, request, current)
  try {
    const raw = await deps.consult({ prompt, schema: chatSchemaText, images: [], timeoutSecs: GPT_TIMEOUT_SECS })
    const parsed = parseChatResponse(raw)
    if (!parsed.ok) return { ok: false, kind: 'bad-format', message: GPT_ERROR_TEXT['bad-format'] }
    let next = addMessage(thread, { from: 'director', text: request.trim() })
    next = addMessage(next, { from: 'gpt', text: parsed.data.respuesta.trim() })
    return { ok: true, thread: { ...next, summary: parsed.data.resumen_hilo.trim() || thread.summary } }
  } catch (e) {
    const kind = classifyGptError(e)
    return { ok: false, kind, message: GPT_ERROR_TEXT[kind] }
  }
}
