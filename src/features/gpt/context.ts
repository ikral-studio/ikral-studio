// Paquete para la revisión de continuidad con GPT: solo lo que GPT necesita, nada más.
// Va: reglas de guionista, instrucciones del director, etapas, decisiones APROBADAS, fichas de la Biblia (nombre y
// descripción corta), escenas en orden con sus planos, avisos del auditor local y las imágenes aprobadas (con tope).
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

/** Lo que GPT revisa como guionista, además de la continuidad visual. */
export const SCRIPT_RULES = [
  'Revisa también la coherencia del guion como guionista:',
  '- Lógica de la historia: cada escena debe seguir de la anterior; nada aparece, se resuelve o se sabe antes de tiempo.',
  '- Antes y después: si la historia tiene un cambio (por ejemplo, de papel a una app), una misma escena, locación o',
  '  imagen no debe mezclar lo de antes y lo de después, salvo que el guion lo muestre a propósito como transición.',
  '  Papel en unas escenas y app en otras NO es mezcla: es la historia. Solo es mezcla si UNA escena o imagen muestra los dos.',
  '- Objetos, personajes y lugares: que no cambien de nombre, de dueño ni de lugar sin explicación.',
  '- Locación: que lo que pasa en la escena quepa en esa locación (por ejemplo, un food truck no es un restaurante con mesas adentro).',
  '- Diálogos: que suenen al personaje y no contradigan lo que ya se dijo o se vio.',
  '- Fichas de la Biblia: si una descripción mezcla etapas, dilo y propone separarla.',
  'Si el proyecto no tiene etapas y la historia tiene un antes y un después, propone las etapas como «regla».',
].join('\n')

const short = (text: string | undefined, max = 220) => {
  const t = (text ?? '').trim().replace(/\s+/g, ' ')
  return t.length > max ? t.slice(0, max - 1) + '…' : t
}

/** Todas las fichas de la Biblia con su descripción corta (sin prompts ni imágenes). */
export function bibleLines(project: Project): string {
  const groups: [string, { name: string; description?: string }[] | undefined][] = [
    ['Personaje', project.characters],
    ['Locación', project.locations],
    ['Objeto', project.props],
    ['Vestuario', project.wardrobe],
  ]
  let out = ''
  for (const [kind, items] of groups) {
    for (const it of items ?? []) {
      const d = short(it.description)
      out += `- ${kind} «${it.name}»${d ? `: ${d}` : ''}\n`
    }
  }
  return out
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
      if (!only.length && !it.aliases?.length && !it.states?.length) continue
      out += `- ${kind} «${it.name}»`
      if (only.length) out += ` · solo en: ${only.join(', ')}`
      if (it.aliases?.length) out += ` · otros nombres: ${it.aliases.join(', ')}`
      if (it.states?.length) out += ` · estados: ${it.states.map((s) => `«${s.label}» (se ve: ${short(s.shows, 80)})`).join('; ')}`
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

  const notes = project.bible?.reviewNotes?.trim()
  const prompt = [
    'Eres revisor de continuidad y guionista de un storyboard. Revisa texto e imágenes y señala contradicciones de continuidad',
    '(objetos, vestuario, locaciones, luz, posición de personajes, etapas de la historia). No inventes: cita la evidencia.',
    SCRIPT_RULES,
    'Respeta las decisiones del director: no las contradigas. Puedes proponer una regla nueva en «regla» (o null).',
    'Si una ficha de la Biblia se puede corregir, pon los cambios concretos en «cambios» (o []):',
    '- «estado-ficha»: lo que se ve en esa ficha en UNA escena («escena», «etiqueta» corta como «Antes: papel», «se_ve», «no_se_ve»).',
    '  Un estado por escena: nunca antes y después juntos. Si no sabes la escena, no lo pongas.',
    '- «descripcion-ficha»: la descripción fija nueva en «texto» (solo lo que nunca cambia: espacio, materiales, luz).',
    '  «ficha» es el nombre exacto de la ficha. No cambies diálogos, imágenes ni decisiones del director.',
    'Si falta una decisión del director (por ejemplo, ¿restaurante con comedor o food truck?), no la adivines:',
    'ponla en «pregunta» con 2 a 4 «opciones», en un hallazgo aparte, y no reescribas esa ficha. Si no hay, null.',
    'Si el guion dice un lugar y la Biblia otro, las opciones son: «Adaptar historia a <lugar de la Biblia>»,',
    '«Mantener <lugar del guion>» y «Definir transformación dentro de la historia». No asumas ninguna.',
    '«escena», «plano» e «imagen» son los números de abajo (o null). Responde en español con el esquema JSON.',
    '',
    'Instrucciones de guionismo del director (síguelas):',
    notes || '(ninguna)',
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
    'Fichas de la Biblia:',
    bibleLines(project).trimEnd() || '(ninguna)',
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
