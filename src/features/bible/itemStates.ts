// Mismo lugar, distintos momentos: la descripción de la ficha es su Canon fijo (espacio, materiales, luz) y cada
// estado dice qué cosas temporales se ven en ciertas etapas o escenas (ej.: «Antes: papel» / «Después: app»).
// Una imagen fija muestra UN solo momento: nunca «primero papel y luego tablet». Si no está claro qué estado
// le toca a una escena, no se adivina: se pide escoger.
import type { BibleItem, ItemKind, ItemState, Project, Scene } from '../../types'
import { biblePrompt } from './bible'
import { phaseOf } from '../continuity/continuity'

export type StateResolution =
  | { kind: 'none' }
  | { kind: 'state'; state: ItemState }
  | { kind: 'ambiguous'; options: ItemState[] }
  | { kind: 'missing' }

/** ¿Qué estado de la ficha le toca a la escena? Gana el que nombra la escena; luego el de su etapa. */
export function resolveState(it: Pick<BibleItem, 'states'>, scene: Pick<Scene, 'id' | 'phaseId'>): StateResolution {
  const states = it.states ?? []
  if (!states.length) return { kind: 'none' }
  const pick = (list: ItemState[]): StateResolution | null => (list.length === 1 ? { kind: 'state', state: list[0] } : list.length > 1 ? { kind: 'ambiguous', options: list } : null)
  const byScene = pick(states.filter((s) => s.sceneIds?.includes(scene.id)))
  if (byScene) return byScene
  const byPhase = scene.phaseId ? pick(states.filter((s) => s.phaseIds?.includes(scene.phaseId!))) : null
  return byPhase ?? { kind: 'missing' }
}

const fold = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Palabras de secuencia: «al inicio … y luego …», «primero … después …», «at first … then …». */
const SEQUENCE = [
  /\b(al inicio|al principio|en un principio|primero|antes)\b[^.\n]{0,200}?\b(luego|despues|mas tarde|al final|ahora)\b/,
  /\by (luego|despues|mas tarde)\b/,
  /\b(at first|first)\b[^.\n]{0,200}?\b(then|later|afterwards)\b/,
  /\band then\b/,
]

/** Si el texto pide dos momentos en una sola imagen, devuelve el pedacito que lo dice. */
export function mixesMoments(text: string | undefined): string | undefined {
  const t = fold(text ?? '')
  for (const re of SEQUENCE) {
    const m = re.exec(t)
    if (m) return (text ?? '').slice(m.index, m.index + m[0].length)
  }
  return undefined
}

const names = (it: BibleItem) => [it.name, ...(it.aliases ?? [])].map((n) => fold(n).trim()).filter((n) => n.length > 1)

/** ¿La escena usa la ficha? Si la nombra (nombre u otro nombre) o si un estado la incluye. */
export function sceneUsesItem(it: BibleItem, scene: Scene): boolean {
  if (it.states?.some((s) => s.sceneIds?.includes(scene.id))) return true
  const text = fold([scene.title, scene.script.action, scene.script.dialogue, scene.script.generationPrompt].join('\n'))
  return names(it).some((n) => text.includes(n))
}

export type ImageTarget = { mode: 'base' } | { mode: 'scene'; sceneId: string }

export interface ItemImagePrompt {
  prompt: string
  /** Estado que se usó (solo en fotograma de escena). */
  state?: ItemState
  /** No se puede generar: por qué (ej.: escena sin estado claro o texto que mezcla dos momentos). */
  blocked?: string
}

const clean = (t?: string) => (t ?? '').trim().replace(/\s+/g, ' ')

/** Lo que no debe verse en un estado: lo que dice el estado y lo de los otros estados. */
export function hiddenIn(it: Pick<BibleItem, 'states'>, state?: ItemState): string[] {
  const out = [clean(state?.hides), ...(it.states ?? []).filter((s) => s.id !== state?.id).map((s) => clean(s.shows))].filter(Boolean)
  return [...new Set(out)]
}

function head(p: Project | null | undefined, kind: ItemKind, it: BibleItem, what: string): string {
  const name = `"${it.name.trim()}"${it.note?.trim() ? ` (${it.note.trim()})` : ''}`
  const who = kind === 'wardrobe' ? p?.characters?.find((c) => c.id === it.characterId) : undefined
  if (kind === 'locations') return `Location concept art of ${name}, ${what}, wide establishing shot, no people, 16:9`
  if (kind === 'props') return `Prop design of ${name}, ${what}, single object, plain neutral background`
  return `Costume design of ${name}${who ? ` worn by ${who.name.trim()}${who.description.trim() ? ` (${who.description.trim()})` : ''}` : ''}, ${what}, full body, front view, plain neutral background`
}

export const MIXED = (quote: string) => `Este texto pide dos momentos en una sola imagen («${quote}»). Una imagen fija es un solo momento: separa cada momento en un estado por escena.`

/**
 * Prompt de la imagen de una ficha con estados: la referencia base (el lugar sin cosas de una etapa) o el
 * fotograma de una escena (el mismo lugar con lo que se ve en esa escena y sin lo de las otras).
 */
export function itemImagePrompt(p: Project | null | undefined, kind: ItemKind, it: BibleItem, target: ImageTarget, scenes: Scene[] = []): ItemImagePrompt {
  const style = biblePrompt(p)
  const desc = clean(it.description).replace(/\.+$/, '')
  const mixedDesc = mixesMoments(desc)
  if (target.mode === 'base') {
    const temporal = (it.states ?? []).map((s) => clean(s.shows)).filter(Boolean)
    const prompt = [
      head(p, kind, it, 'base reference (the same in every scene)'),
      desc && `Appearance: ${desc}`,
      temporal.length && `Show only what never changes (layout, materials, lighting). Do NOT show these temporary story elements: ${temporal.join('; ')}`,
      'One single moment in time',
      style && `Style: ${style}`,
    ]
      .filter(Boolean)
      .join('. ')
    const manual = it.prompt
    const mixed = mixesMoments(manual ?? prompt)
    return { prompt: manual ?? prompt, blocked: mixed ? MIXED(mixed) : undefined }
  }
  const n = scenes.findIndex((s) => s.id === target.sceneId) + 1
  const scene = scenes[n - 1]
  if (!scene) return { prompt: '', blocked: 'Esa escena ya no existe.' }
  const r = resolveState(it, scene)
  const sceneName = `Escena ${String(n).padStart(2, '0')}`
  if (r.kind === 'none') return { prompt: '', blocked: `«${it.name}» no tiene estados por escena. Agrega uno para la ${sceneName}.` }
  if (r.kind === 'missing') return { prompt: '', blocked: `La ${sceneName} no tiene un estado de «${it.name}». Agrega uno o marca su etapa: no lo adivino.` }
  if (r.kind === 'ambiguous') return { prompt: '', blocked: `La ${sceneName} tiene ${r.options.length} estados posibles (${r.options.map((s) => `«${s.label}»`).join(', ')}). Deja uno solo para esa escena: no lo adivino.` }
  const hidden = hiddenIn(it, r.state)
  const prompt = [
    head(p, kind, it, `as it looks in scene ${n} "${scene.title.trim()}", same layout, materials, lighting and camera position as its base reference`),
    desc && `Appearance (fixed, never changes): ${desc}`,
    clean(r.state.shows) && `In this scene you see (Spanish): ${clean(r.state.shows)}`,
    hidden.length && `Must NOT appear in this image (Spanish): ${hidden.join('; ')}`,
    'This is ONE single moment in time: show only this state, never a before and an after together',
    style && `Style: ${style}`,
  ]
    .filter(Boolean)
    .join('. ')
  const mixed = mixedDesc ?? mixesMoments(r.state.shows)
  return { prompt, state: r.state, blocked: mixed ? MIXED(mixed) : undefined }
}

/**
 * Para la imagen inicial o final de una escena: cada ficha con estados que la escena usa, con lo que se ve y
 * lo que no. Las fichas sin estados no agregan nada (los proyectos de siempre quedan igual).
 */
export function sceneStatesPrompt(p: Project | null | undefined, scene: Scene): string {
  if (!p) return ''
  const lines: string[] = []
  for (const it of [...(p.locations ?? []), ...(p.props ?? [])]) {
    if (!it.states?.length || !sceneUsesItem(it, scene)) continue
    const r = resolveState(it, scene)
    if (r.kind !== 'state') continue
    const hidden = hiddenIn(it, r.state)
    lines.push(`"${it.name.trim()}" in this scene (Spanish): ${clean(r.state.shows)}${hidden.length ? `. Not visible: ${hidden.join('; ')}` : ''}`)
  }
  return lines.length ? `${lines.join('\n')}\nOne single moment in time: never show a before and an after together.` : ''
}

/** Nombre corto para mostrar dónde vale un estado (ej.: «Escena 03 · etapa ANTES»). */
export function stateWhere(p: Project, scenes: Scene[], st: ItemState): string {
  const sc = (st.sceneIds ?? []).map((id) => scenes.findIndex((s) => s.id === id) + 1).filter((n) => n > 0).map((n) => `Escena ${String(n).padStart(2, '0')}`)
  const ph = (st.phaseIds ?? []).map((id) => p.phases?.find((x) => x.id === id)?.name).filter(Boolean).map((n) => `etapa ${n}`)
  return [...sc, ...ph].join(' · ') || 'sin escena ni etapa'
}

/** Las escenas que usan la ficha, con su estado (para escoger «¿Para qué escena?»). */
export function sceneTargets(p: Project, it: BibleItem, scenes: Scene[]): { scene: Scene; n: number; r: StateResolution; label: string }[] {
  return scenes
    .map((scene, i) => ({ scene, n: i + 1 }))
    .filter(({ scene }) => sceneUsesItem(it, scene))
    .map(({ scene, n }) => {
      const r = resolveState(it, scene)
      const ph = phaseOf(p, scene)?.name
      const tail = r.kind === 'state' ? r.state.label : r.kind === 'ambiguous' ? 'estado sin decidir' : 'sin estado'
      return { scene, n, r, label: `Escena ${String(n).padStart(2, '0')}${ph ? ` (${ph})` : ''} · ${tail}` }
    })
}
