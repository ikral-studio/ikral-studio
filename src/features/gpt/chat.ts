// Ventanita flotante de GPT: plática libre sobre todo el proyecto, desde cualquier vista.
// GPT solo platica: no propone cambios que se apliquen solos. Lo que el director decida lo hace él (o Claude).
import { z } from 'zod'
import type { Project, Scene } from '../../types'
import { approvedDecisions, phaseOf, phasesOf } from '../continuity/continuity'
import { styleSpanish } from '../project-style/style'
import { bibleLines } from './context'
import { historyForPrompt, type GptThread } from './threads'

/** Un solo apartado: todo el proyecto. */
export const CHAT_KEY = 'project'
export type ChatThread = GptThread<never, never>

const CLIP = 220

const clip = (t: string | undefined, max: number) => {
  const s = (t ?? '').trim().replace(/\s+/g, ' ')
  return s.length > max ? `${s.slice(0, max - 1)}…` : s
}

/**
 * Paquete del chat: proyecto, estilo, etapas, decisiones APROBADAS, fichas de la Biblia y escenas en orden
 * (acción y diálogos recortados). `current` = la escena que el director tiene abierta, si hay.
 * No va: decisiones propuestas o rechazadas, prompts de generación, chat con Claude, imágenes ni rutas de archivos.
 */
export function buildChatPacket(project: Project, ordered: Scene[], thread: ChatThread, request: string, current?: string | null): string {
  const number = new Map(ordered.map((s, n) => [s.id, n + 1]))
  const phases = phasesOf(project)
  const decisions = approvedDecisions(project)
    .map((d) => `- ${d.text}${d.sceneIds?.length ? ` (escenas ${d.sceneIds.map((id) => number.get(id)).filter(Boolean).join(', ')})` : ''}`)
    .join('\n')
  const scenes = ordered
    .map((s, n) =>
      [
        `${n + 1}. «${s.title}» · etapa: ${phaseOf(project, s)?.name ?? 'sin etapa'}`,
        s.script.action.trim() && `   Acción: ${clip(s.script.action, CLIP)}`,
        s.script.dialogue.trim() && `   Diálogos: ${clip(s.script.dialogue, CLIP)}`,
      ]
        .filter(Boolean)
        .join('\n'),
    )
    .join('\n')
  const open = current ? number.get(current) : undefined
  const history = historyForPrompt(thread)

  return [
    'Eres asistente creativo de un storyboard animado (guion, Biblia, cobertura y edición). El director platica contigo desde una ventanita.',
    'Responde en español, claro y corto (frases simples). Si te pide cambios, explica qué cambiarías y dónde; tú no cambias nada.',
    'Respeta las decisiones aprobadas del director: no las contradigas. En «resumen_hilo» resume en pocas líneas todo lo platicado (para retomarlo otro día).',
    '',
    `Proyecto: «${project.title}»`,
    styleSpanish(project) && `Estilo: ${styleSpanish(project)}`,
    `Etapas en orden: ${phases.length ? phases.map((p) => p.name).join(' → ') : '(sin etapas)'}`,
    '',
    'Decisiones aprobadas por el director:',
    decisions || '(ninguna)',
    '',
    'Biblia:',
    bibleLines(project) || '(vacía)',
    '',
    `Escenas en orden (${ordered.length}):`,
    scenes || '(sin escenas)',
    open ? `\nEl director tiene abierta la escena ${open}.` : '',
    history ? `\n${history}` : '',
    '',
    `Mensaje del director: ${request.trim()}`,
  ]
    .filter((x): x is string => typeof x === 'string' && x !== '')
    .join('\n')
}

const responseSchema = z.object({ respuesta: z.string(), resumen_hilo: z.string() })
export type ChatResponse = z.infer<typeof responseSchema>

/** Lee la respuesta de GPT. Si no trae el formato pedido, no se usa nada. */
export function parseChatResponse(raw: string): { ok: true; data: ChatResponse } | { ok: false; error: 'bad-format' } {
  try {
    const r = responseSchema.safeParse(JSON.parse(raw))
    return r.success && r.data.respuesta.trim() ? { ok: true, data: r.data } : { ok: false, error: 'bad-format' }
  } catch {
    return { ok: false, error: 'bad-format' }
  }
}
