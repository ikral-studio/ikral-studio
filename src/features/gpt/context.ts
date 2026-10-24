// Paquete para la revisión de continuidad con GPT: solo lo que GPT necesita, nada más.
// Va: etapas, decisiones APROBADAS, elementos con etapas u otros nombres, escenas en orden con sus planos,
// avisos del auditor local y la lista de imágenes aprobadas (miniaturas, con tope).
// No va: decisiones propuestas o rechazadas, chat, prompts de generación, intentos, videos, música ni rutas.
import type { BibleItem, Project, Scene } from '../../types'
import { approvedDecisions, auditContinuity, phaseOf, phasesOf } from '../continuity/continuity'
import { shotsOf } from '../coverage/shots'

/** Tope de imágenes por consulta (cuida la cuota y el tiempo). */
export const MAX_IMAGES = 12

export interface PacketImage {
  /** Número que GPT usa en «imagen» (empieza en 1). */
  n: number
  mediaId: string
  sceneId: string
  shotId: string
  slot: 'start' | 'end'
}

export interface ContinuityPacket {
  prompt: string
  images: PacketImage[]
  /** Escenas en el orden en que GPT las numera (escena 1 = sceneIds[0]). */
  sceneIds: string[]
  /** Planos de cada escena en el orden en que GPT los numera. */
  shotIds: Record<string, string[]>
  /** Cuántas imágenes aprobadas quedaron fuera por el tope. */
  imagesLeftOut: number
}

const line = (label: string, text?: string) => (text?.trim() ? `  ${label}: ${text.trim().replace(/\s+/g, ' ')}\n` : '')

function itemLines(project: Project): string {
  const phases = phasesOf(project)
  const groups: [string, BibleItem[] | undefined][] = [
    ['Locación', project.locations],
    ['Objeto', project.props],
    ['Vestuario', project.wardrobe],
  ]
  let out = ''
  for (const [kind, items] of groups) {
    for (const it of items ?? []) {
      const only = (it.onlyIn ?? []).map((id) => phases.find((p) => p.id === id)?.name).filter(Boolean)
      if (!only.length && !it.aliases?.length) continue
      out += `- ${kind} «${it.name}»`
      if (only.length) out += ` · solo en: ${only.join(', ')}`
      if (it.aliases?.length) out += ` · otros nombres: ${it.aliases.join(', ')}`
      out += '\n'
    }
  }
  return out
}

/** Arma el paquete de la revisión. `scenes` ya en el orden del proyecto. */
export function buildContinuityPacket(project: Project, scenes: Scene[]): ContinuityPacket {
  const phases = phasesOf(project)
  const number = new Map(scenes.map((s, i) => [s.id, i + 1]))
  const shotIds: Record<string, string[]> = {}
  const allImages: Omit<PacketImage, 'n'>[] = []
  let sceneText = ''

  scenes.forEach((scene, i) => {
    const shots = shotsOf(scene)
    shotIds[scene.id] = shots.map((sh) => sh.id)
    sceneText += `Escena ${i + 1} · «${scene.title}» · etapa: ${phaseOf(project, scene)?.name ?? 'sin etapa'}\n`
    sceneText += line('Acción', scene.script.action)
    sceneText += line('Diálogo', scene.script.dialogue)
    shots.forEach((sh, j) => {
      if (shots.length > 1) sceneText += `  Plano ${j + 1} «${sh.name ?? ''}»\n` + line('  Acción', sh.action) + line('  Continuidad', sh.continuity)
      for (const slot of ['start', 'end'] as const) {
        const mediaId = slot === 'start' ? sh.startImageId : sh.endImageId
        if (mediaId) allImages.push({ mediaId, sceneId: scene.id, shotId: sh.id, slot })
      }
    })
  })

  const images = allImages.slice(0, MAX_IMAGES).map((im, i) => ({ ...im, n: i + 1 }))
  const imageText = images
    .map((im) => {
      const sc = number.get(im.sceneId)!
      const pl = shotIds[im.sceneId].indexOf(im.shotId) + 1
      return `- Imagen ${im.n}: escena ${sc}${shotIds[im.sceneId].length > 1 ? `, plano ${pl}` : ''}, ${im.slot === 'start' ? 'inicial' : 'final'}`
    })
    .join('\n')

  const local = auditContinuity(project, scenes)
    .map((f) => `- ${f.sceneId ? `Escena ${number.get(f.sceneId)}: ` : ''}${f.problem}${f.quote ? ` (dice «${f.quote}»)` : ''}`)
    .join('\n')

  const decisions = approvedDecisions(project)
    .map((d) => `- ${d.text}${d.sceneIds?.length ? ` (escenas ${d.sceneIds.map((id) => number.get(id)).filter(Boolean).join(', ')})` : ''}`)
    .join('\n')

  const prompt = [
    'Eres revisor de continuidad de un storyboard. Revisa texto e imágenes y señala contradicciones de continuidad',
    '(objetos, vestuario, locaciones, luz, posición de personajes, etapas de la historia). No inventes: cita la evidencia.',
    'Respeta las decisiones del director: no las contradigas. Puedes proponer una regla nueva en «regla» (o null).',
    '«escena», «plano» e «imagen» son los números de abajo (o null). Responde en español con el esquema JSON.',
    '',
    `Proyecto: «${project.title}»`,
    `Etapas en orden: ${phases.length ? phases.map((p) => p.name).join(' → ') : '(sin etapas)'}`,
    '',
    'Decisiones aprobadas por el director:',
    decisions || '(ninguna)',
    '',
    'Elementos con etapas u otros nombres:',
    itemLines(project).trimEnd() || '(ninguno)',
    '',
    'Escenas:',
    sceneText.trimEnd() || '(sin escenas)',
    '',
    'Avisos del revisor automático (ya conocidos):',
    local || '(ninguno)',
    '',
    'Imágenes adjuntas (en este orden):',
    imageText || '(ninguna)',
  ].join('\n')

  return { prompt, images, sceneIds: scenes.map((s) => s.id), shotIds, imagesLeftOut: allImages.length - images.length }
}
