// Antes de generar imágenes de escenas: qué referencias faltan (personajes, lugares u objetos sin imagen, y
// pantallas que el guion menciona sin ninguna ficha con imagen). Sin referencia, ChatGPT inventa o deja en blanco.
import type { Project, Scene } from '../../types'
import { fold } from '../script-search/find'
import { sceneUsesItem } from '../bible/itemStates'
import { charactersInScene } from '../project-style/style'

/** Cosas con pantalla o impresas que salen en blanco si no hay imagen de cómo se ven. */
const SCREENS: [string, RegExp][] = [
  ['pantalla del celular', /\b(celular|telefono|movil|smartphone)\b/],
  ['pantalla de la tablet', /\b(tablet|tableta|ipad)\b/],
  ['pantalla del monitor', /\b(monitor|computadora|laptop)\b/],
  ['código QR', /\bqr\b/],
]

const KIND = { locations: '📍 Lugar', props: '📦 Objeto', wardrobe: '👕 Vestuario' } as const

export function missingRefs(project: Project | null | undefined, scenes: Scene[]): string[] {
  if (!project || !scenes.length) return []
  const out: string[] = []
  const chars = new Map<string, string>()
  for (const s of scenes) for (const c of charactersInScene(project, s)) if (!c.imageId) chars.set(c.id, c.name.trim())
  for (const n of chars.values()) out.push(`👤 Personaje «${n}»: sin imagen`)
  for (const kind of ['locations', 'props', 'wardrobe'] as const) {
    for (const it of project[kind] ?? []) {
      if (it.imageId || !it.name.trim()) continue
      if (scenes.some((s) => sceneUsesItem(it, s))) out.push(`${KIND[kind]} «${it.name.trim()}»: sin imagen`)
    }
  }
  const text = fold(scenes.map((s) => [s.title, s.script.action, s.script.dialogue, s.script.generationPrompt].join('\n')).join('\n'))
  const withImage = fold((project.props ?? []).filter((it) => it.imageId).map((it) => [it.name, it.description, ...(it.aliases ?? [])].join(' ')).join('\n'))
  for (const [label, re] of SCREENS) {
    if (re.test(text) && !re.test(withImage)) out.push(`📱 El guion menciona ${label}, pero no hay objeto con su imagen`)
  }
  return out
}
