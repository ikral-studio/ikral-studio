// Biblia del proyecto: preguntas de estilo y personajes que salen en el guion.
// Las respuestas se agregan al prompt para que todo el video se vea igual.
import type { BibleItem, Character, ItemKind, Project, Scene } from '../../types'
import { parseDialogue } from '../dialogue/lines'
import { charactersInScene } from '../project-style/style'
import { uid } from '../../utils'

export interface Choice {
  id: string
  es: string
  en: string
}

export const LOOKS: Choice[] = [
  { id: 'real', es: '🎥 Personas reales', en: 'photorealistic live-action with real people' },
  { id: 'cartoon', es: '✏️ Caricatura 2D', en: '2D cartoon illustration' },
  { id: '3d', es: '🧸 Animación 3D', en: '3D animated film' },
  { id: 'otro', es: '🎨 Otro', en: '' },
]

export const MOODS: Choice[] = [
  { id: 'alegre', es: '🌈 Alegres y brillantes', en: 'bright cheerful saturated colors' },
  { id: 'natural', es: '🌿 Naturales', en: 'natural balanced colors' },
  { id: 'oscuro', es: '🌑 Oscuros y dramáticos', en: 'dark dramatic low-key colors' },
]

export const AUDIENCES: Choice[] = [
  { id: 'ninos', es: '🧒 Niños', en: 'kid-friendly' },
  { id: 'familia', es: '👨‍👩‍👧 Toda la familia', en: 'family-friendly' },
]

const pick = (list: Choice[], id?: string) => list.find((c) => c.id === id)

/** Cuántas de las 4 preguntas ya tienen respuesta. */
export function bibleAnswered(p?: Project | null): number {
  const b = p?.bible ?? {}
  const look = b.look === 'otro' ? !!b.lookOther?.trim() : !!b.look
  return [look, !!(b.era?.trim() || b.place?.trim()), !!b.mood, !!pick(AUDIENCES, b.audience)].filter(Boolean).length
}

/** Respuestas en inglés para el prompt (vacío si no hay ninguna). */
export function biblePrompt(p?: Project | null): string {
  const b = p?.bible
  if (!b) return ''
  const look = b.look === 'otro' ? b.lookOther?.trim() : pick(LOOKS, b.look)?.en
  return [look, b.era?.trim() && `setting: ${b.era.trim()}`, b.place?.trim() && `place: ${b.place.trim()}`, pick(MOODS, b.mood)?.en, pick(AUDIENCES, b.audience)?.en].filter(Boolean).join('; ')
}

export interface FoundCharacter {
  name: string
  /** Id en la lista de personajes del proyecto (si ya está guardado). */
  id?: string
  /** Líneas de diálogo que dice. */
  lines: number
  /** Escenas donde habla o se le nombra. */
  scenes: number
  /** Ya está en la lista de personajes del proyecto. */
  saved: boolean
  /** Ya tiene descripción física. */
  described: boolean
}

const key = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()

/** Personajes del guion: los que hablan en los diálogos más los ya guardados. */
export function findCharacters(p: Project | null | undefined, scenes: Scene[]): FoundCharacter[] {
  const map = new Map<string, FoundCharacter & { sceneIds: Set<string> }>()
  const get = (name: string) => {
    const k = key(name)
    let c = map.get(k)
    if (!c) map.set(k, (c = { name: name.trim(), lines: 0, scenes: 0, saved: false, described: false, sceneIds: new Set() }))
    return c
  }
  for (const ch of p?.characters ?? []) {
    if (!ch.name.trim()) continue
    const c = get(ch.name)
    c.name = ch.name.trim()
    c.id = ch.id
    c.saved = true
    c.described = !!ch.description.trim()
  }
  for (const s of scenes) {
    for (const l of parseDialogue(s.script.dialogue)) {
      if (!l.speaker) continue
      const c = get(l.speaker)
      c.lines++
      c.sceneIds.add(s.id)
    }
    // Los guardados con descripción también cuentan si se les nombra en la acción.
    for (const ch of charactersInScene(p, s)) get(ch.name).sceneIds.add(s.id)
  }
  return [...map.values()]
    .map(({ sceneIds, ...c }) => ({ ...c, scenes: sceneIds.size }))
    .sort((a, b) => b.scenes - a.scenes || b.lines - a.lines || a.name.localeCompare(b.name))
}

/** Lo que el guion dice de un personaje: sus diálogos y las acciones donde se le nombra (corto). */
export function characterContext(name: string, scenes: Scene[]): string {
  const k = key(name)
  const said: string[] = []
  const does: string[] = []
  const named = new RegExp(`(^|[^\\p{L}])${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}])`, 'u')
  for (const s of scenes) {
    for (const l of parseDialogue(s.script.dialogue))
      if (key(l.speaker) === k && l.text.trim()) said.push(`«${l.text.replace(/^[—–-]\s*/, '').trim()}»${l.emotion ? ` (${l.emotion})` : ''}`)
    for (const f of s.script.action.split(/(?<=[.!?])\s+|\n+/)) if (f.trim() && named.test(key(f))) does.push(f.trim())
  }
  return [said.length && `Dice: ${said.slice(0, 5).join(' ')}`, does.length && `Hace: ${does.slice(0, 3).join(' ')}`].filter(Boolean).join(' · ')
}

/** Prompt para la imagen de prueba de un personaje: estilo de la Biblia + su descripción + lo que dice el guion. */
export function characterPrompt(p: Project | null | undefined, ch: { name: string; description: string }, scenes: Scene[] = []): string {
  const style = biblePrompt(p)
  const ctx = characterContext(ch.name, scenes)
  return [
    `Character design sheet of "${ch.name.trim()}", full body, front view, plain neutral background`,
    ch.description.trim() && `Appearance: ${ch.description.trim()}`,
    !ch.description.trim() && ctx && `Infer age, look and clothing from the script (Spanish): ${ctx}`,
    style && `Style: ${style}`,
  ]
    .filter(Boolean)
    .join('. ')
}

/** Pedido listo para pegar en Codex/ChatGPT: cómo se ve cada personaje + una imagen de cada uno. */
export function suggestionPrompt(p: Project | null | undefined, names: string[], scenes: Scene[] = []): string {
  const style = biblePrompt(p)
  const idea = p?.bible?.castIdea?.trim()
  const list = names.map((n) => {
    const ctx = characterContext(n, scenes)
    return `- ${n}${ctx ? `: ${ctx}` : ''}`
  })
  return [
    'Propón cómo se ve cada personaje de mi video y haz una imagen de cada uno (cuerpo completo, de frente, fondo neutro, formato vertical 3:4).',
    idea && `Idea general: ${idea}.`,
    style && `Estilo de todas las imágenes: ${style}.`,
    'Personajes (con lo que dicen y hacen en el guion, úsalo para saber su edad, carácter y ropa):',
    ...list,
    'Para cada personaje escribe su nombre y una descripción corta en español (edad, cuerpo, cabello, ropa), y luego su imagen. Que todos se vean del mismo estilo.',
  ]
    .filter(Boolean)
    .join('\n')
}

/** Pasa la sugerencia de Claude a las fichas (de un personaje o de todos) y la quita de la lista. */
export function applySuggestion(p: Project, name?: string): Project {
  const take = (p.suggestion ?? []).filter((s) => name === undefined || key(s.name) === key(name))
  if (!take.length) return p
  const characters: Character[] = [...(p.characters ?? [])]
  for (const s of take) {
    const i = characters.findIndex((c) => key(c.name) === key(s.name))
    const patch = { description: s.description, ...(s.imageId ? { imageId: s.imageId } : {}) }
    const old = i >= 0 ? characters[i] : { id: uid('ch_'), name: s.name.trim(), description: '' }
    const tries = s.imageId && !old.tries?.some((t) => t.mediaId === s.imageId) ? [...(old.tries ?? []), { id: uid('try_'), mediaId: s.imageId, at: new Date().toISOString() }] : old.tries
    const next = { ...old, ...patch, ...(tries ? { tries } : {}) }
    if (i >= 0) characters[i] = next
    else characters.push(next)
  }
  const rest = (p.suggestion ?? []).filter((s) => !take.includes(s))
  return { ...p, characters, suggestion: rest.length ? rest : undefined }
}

/** Pasa las locaciones (u objetos, vestuario) que sugirió Claude a la lista: una o todas. Si ya existe, solo llena lo que falte. */
export function applyItemSuggestion(p: Project, kind: ItemKind, name?: string): Project {
  const all = p.itemSuggestions?.[kind] ?? []
  const take = all.filter((s) => s.name.trim() && (name === undefined || key(s.name) === key(name)))
  if (!take.length) return p
  const list: BibleItem[] = [...(p[kind] ?? [])]
  for (const s of take) {
    const i = list.findIndex((it) => key(it.name) === key(s.name))
    if (i >= 0) list[i] = { ...list[i], description: list[i].description || s.description, note: list[i].note || s.note }
    else list.push({ id: uid(kind === 'locations' ? 'loc_' : kind === 'props' ? 'obj_' : 'ves_'), name: s.name.trim(), description: s.description, ...(s.note ? { note: s.note } : {}) })
  }
  const rest = all.filter((s) => !take.includes(s))
  const itemSuggestions = { ...p.itemSuggestions, [kind]: rest.length ? rest : undefined }
  return { ...p, [kind]: list, itemSuggestions }
}
