// Consulta a GPT (vía Codex en la app de Mac). En la web no hay Codex: avisa con calma.
// Nada de lo que responde GPT se aplica solo: devuelve una revisión con propuestas pendientes.
import type { Project, Scene } from '../../types'
import { isDesktop, mediaDiskPath } from '../../database/db'
import schemaText from './schemas/continuity.json?raw'
import { buildContinuityPacket } from './context'
import { classifyGptError, GPT_ERROR_TEXT, parseContinuityResponse, toReview, type GptErrorKind, type GptReview } from './proposals'

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
