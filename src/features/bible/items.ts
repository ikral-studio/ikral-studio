// Elementos de la Biblia (personajes, locaciones, objetos, vestuario): estado, prompts y avance.
// Estados: sin preparar → en pruebas → Canon (imagen aprobada oficialmente para el proyecto).
import type { BibleItem, BibleKind, Character, Project, Scene } from '../../types'
import { bibleAnswered, biblePrompt, characterPrompt, findCharacters } from './bible'
import { framesProgress, prepMediaIds } from './frames'

export type ItemStatus = 'none' | 'testing' | 'canon'

export const STATUS_ES: Record<ItemStatus, string> = { none: 'Sin preparar', testing: 'En pruebas', canon: 'Canon' }

export const KIND_ES: Record<BibleKind, { one: string; many: string; add: string; placeholder: string }> = {
  characters: { one: 'personaje', many: 'Personajes', add: 'Nuevo personaje', placeholder: 'Ej.: señora de 60 años, chaparrita, cabello canoso en chongo, mandil de flores' },
  locations: { one: 'locación', many: 'Locaciones', add: 'Nueva locación', placeholder: 'Ej.: taquería llena, paredes de talavera, papel picado, luz cálida' },
  props: { one: 'objeto', many: 'Objetos importantes', add: 'Nuevo objeto', placeholder: 'Ej.: celular negro con la app de TuApp abierta' },
  wardrobe: { one: 'vestuario', many: 'Vestuario', add: 'Nuevo vestuario', placeholder: 'Ej.: mandil amarillo con bolsillo, blusa blanca' },
}

export function itemStatus(it: Pick<BibleItem, 'imageId' | 'tries' | 'description' | 'generating'>): ItemStatus {
  if (it.imageId) return 'canon'
  if (it.tries?.length || it.description.trim() || it.generating) return 'testing'
  return 'none'
}

export function items(p: Project | null | undefined, kind: BibleKind): (BibleItem | Character)[] {
  return (p?.[kind] ?? []) as (BibleItem | Character)[]
}

/** Prompt para la imagen de prueba de un elemento, con el estilo de la Biblia. */
export function itemPrompt(p: Project | null | undefined, kind: BibleKind, it: BibleItem | Character, scenes: Scene[] = []): string {
  if (kind === 'characters') return characterPrompt(p, it, scenes)
  const style = biblePrompt(p)
  const name = `"${it.name.trim()}"${'note' in it && it.note?.trim() ? ` (${it.note.trim()})` : ''}`
  const who = kind === 'wardrobe' && 'characterId' in it ? p?.characters?.find((c) => c.id === it.characterId) : undefined
  const head =
    kind === 'locations'
      ? `Location concept art of ${name}, wide establishing shot, no people, 16:9`
      : kind === 'props'
        ? `Prop design of ${name}, single object, plain neutral background`
        : `Costume design of ${name}${who ? ` worn by ${who.name.trim()}${who.description.trim() ? ` (${who.description.trim()})` : ''}` : ''}, full body, front view, plain neutral background`
  return [head, it.description.trim() && `Appearance: ${it.description.trim()}`, style && `Style: ${style}`].filter(Boolean).join('. ')
}

/** Todas las imágenes de la Biblia (aprobadas, pruebas y sugerencias) para que la limpieza no las borre. */
export function bibleMediaIds(p: Project): string[] {
  const ids: string[] = []
  for (const kind of ['characters', 'locations', 'props', 'wardrobe'] as const)
    for (const it of items(p, kind)) {
      if (it.imageId) ids.push(it.imageId)
      it.tries?.forEach((t) => ids.push(t.mediaId))
    }
  p.suggestion?.forEach((s) => s.imageId && ids.push(s.imageId))
  return ids
}

/** Cambia los ids de imagen de la Biblia (al restaurar un respaldo). */
export function mapBibleMedia(p: Project, map: (id?: string) => string | undefined): Partial<Project> {
  const one = <T extends BibleItem | Character>(it: T): T => ({
    ...it,
    imageId: map(it.imageId),
    tries: it.tries?.flatMap((t) => {
      const mediaId = map(t.mediaId)
      return mediaId ? [{ ...t, mediaId }] : []
    }),
  })
  return {
    characters: p.characters?.map(one),
    locations: p.locations?.map(one),
    props: p.props?.map(one),
    wardrobe: p.wardrobe?.map(one),
    suggestion: p.suggestion?.map((s) => ({ ...s, imageId: map(s.imageId) })),
  }
}

export interface ProgressRow {
  key: string
  label: string
  done: number
  total: number
}

/** Avance de la Biblia por sección y en total (0–100). */
export function bibleProgress(p: Project | null | undefined, scenes: Scene[]): { rows: ProgressRow[]; percent: number; ready: boolean } {
  const found = findCharacters(p, scenes)
  const chars = p?.characters ?? []
  const canonOf = (kind: BibleKind) => items(p, kind).filter((it) => itemStatus(it) === 'canon').length
  const frames = framesProgress(scenes)
  const rows: ProgressRow[] = [
    { key: 'style', label: 'Estilo y tono', done: bibleAnswered(p), total: 4 },
    { key: 'characters', label: 'Personajes', done: found.filter((f) => f.id && chars.find((c) => c.id === f.id)?.imageId).length, total: found.length },
    { key: 'locations', label: 'Locaciones', done: canonOf('locations'), total: items(p, 'locations').length },
    { key: 'props', label: 'Objetos', done: canonOf('props'), total: items(p, 'props').length },
    { key: 'wardrobe', label: 'Vestuario', done: canonOf('wardrobe'), total: items(p, 'wardrobe').length },
    { key: 'relations', label: 'Relaciones', done: p?.relations?.length ?? 0, total: p?.relations?.length ?? 0 },
    { key: 'frames', label: 'Inicio y final de escenas', done: frames.approved, total: frames.total },
  ]
  // Cada sección pesa igual; una sección vacía cuenta como pendiente.
  const percent = Math.round((rows.reduce((a, r) => a + (r.total ? r.done / r.total : 0), 0) / rows.length) * 100)
  const ready = rows[0].done === 4 && rows[1].total > 0 && rows[1].done === rows[1].total
  return { rows, percent, ready }
}

/** Todos los archivos de la preproducción de un proyecto (Biblia + inicio/final de escenas). */
export function preproductionMediaIds(p: Project, scenes: Scene[]): string[] {
  return [...bibleMediaIds(p), ...scenes.flatMap(prepMediaIds)]
}
