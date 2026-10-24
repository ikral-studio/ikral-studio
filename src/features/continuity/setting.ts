// Guion vs Biblia: cuando la historia dice un lugar (ej.: RESTAURANTE) y la Biblia otro (ej.: FOOD TRUCK), no se
// adivina cuál vale. Se muestra UNA decisión con 3 caminos (adaptar la historia, mantener el lugar de la historia o
// definir la transformación dentro de la historia), una vista previa de lo que cambiaría y, al aplicar, un solo paso
// con historial y Deshacer. Solo cambian textos: las imágenes (Canon, aprobadas, pruebas) y videos nunca se tocan;
// se listan para que el director decida si revisarlas o regenerarlas.
import type { BibleItem, ItemKind, Project, Scene, SettingChange, SettingChoice, SettingEdit, Shot } from '../../types'
import { nowIso, pad2, uid } from '../../utils'

interface Setting {
  id: string
  /** Cómo se dice en español y en inglés (prompts). */
  es: string
  en: string
  /** Palabras que lo nombran (sin acentos, minúsculas). La primera es la principal. */
  words: RegExp
  /** Palabras que dependen de ese lugar y no se cambian solas (ej.: «comedor», «mesas»). */
  related: RegExp
}

const SETTINGS: Setting[] = [
  {
    id: 'restaurante',
    es: 'restaurante',
    en: 'restaurant',
    words: /\b(restaurantes?|restaurants?|fonda)\b/gi,
    related: /\b(comedor|salon|mesas?|meseros?|meseras?|comensales|dining room|tables?|waiters?)\b/gi,
  },
  {
    id: 'food-truck',
    es: 'food truck',
    en: 'food truck',
    words: /\b(food ?trucks?|camion(es)? de comida|camioneta de comida|trailer de comida)\b/gi,
    related: /\b(ventanilla|toldo|banqueta|fila afuera|serving window)\b/gi,
  },
]

/** Sin acentos y con el mismo largo (para cambiar la palabra en su lugar exacto del texto original). */
const fold = (t: string) => t.replace(/[^ -~\n\r\t]/g, (c) => c.normalize('NFD')[0])
const has = (re: RegExp, text: string) => new RegExp(re.source, 'i').test(fold(text))
const byId = (id: string) => SETTINGS.find((s) => s.id === id)!
const sceneName = (n: number) => `Escena ${pad2(n)}`

/** Texto de la historia: lo que dice cada escena y sus planos. */
function sceneTexts(scene: Scene): string[] {
  const s = scene.script
  return [scene.title, s.action, s.dialogue, s.cameraDirection, s.soundDirection, s.generationPrompt, ...(scene.shots ?? []).flatMap((sh) => [sh.action, sh.continuity, sh.cameraDirection, sh.generationPrompt, sh.sound])].filter(
    (t): t is string => !!t,
  )
}

/** Texto de la Biblia: locaciones (nombre, descripción, prompt, estados) y el lugar principal. */
function bibleTexts(p: Project): { item?: BibleItem; text: string }[] {
  const out: { item?: BibleItem; text: string }[] = []
  if (p.bible?.place) out.push({ text: p.bible.place })
  for (const it of p.locations ?? []) {
    const text = [it.name, it.note, it.description, it.prompt, ...(it.states ?? []).flatMap((st) => [st.label, st.shows, st.hides])].filter(Boolean).join('\n')
    out.push({ item: it, text })
  }
  return out
}

export interface SettingConflict {
  story: string
  bible: string
  /** Escenas que nombran el lugar de la historia (número desde 1). */
  sceneHits: { sceneId: string; n: number }[]
  /** Fichas que nombran el lugar de la Biblia. */
  itemHits: { itemId: string; name: string }[]
  /** El lugar principal de la Biblia también lo dice. */
  place: boolean
}

/**
 * ¿La historia y la Biblia dicen lugares distintos? La historia es el lugar que más escenas nombran; la Biblia, uno
 * que nombran sus locaciones (o el lugar principal) y que ninguna escena nombra. Si el director ya decidió, no vuelve.
 */
export function detectSettingConflict(p: Project | null | undefined, scenes: Scene[]): SettingConflict | null {
  if (!p || p.settingChange) return null
  const counts = SETTINGS.map((st) => ({ st, hits: scenes.map((s, i) => ({ sceneId: s.id, n: i + 1, s })).filter(({ s }) => sceneTexts(s).some((t) => has(st.words, t))) }))
  const story = counts.filter((c) => c.hits.length).sort((a, b) => b.hits.length - a.hits.length)[0]
  if (!story) return null
  const bible = bibleTexts(p)
  for (const st of SETTINGS) {
    if (st.id === story.st.id || counts.find((c) => c.st.id === st.id)!.hits.length) continue
    const hits = bible.filter((b) => has(st.words, b.text))
    if (!hits.length) continue
    return {
      story: story.st.id,
      bible: st.id,
      sceneHits: story.hits.map(({ sceneId, n }) => ({ sceneId, n })),
      itemHits: hits.filter((h) => h.item).map((h) => ({ itemId: h.item!.id, name: h.item!.name })),
      place: hits.some((h) => !h.item),
    }
  }
  return null
}

/** Nombre en mayúsculas para el mensaje (ej.: «RESTAURANTE»). */
export const settingLabel = (id: string) => byId(id).es.toUpperCase()

/** El mensaje de la decisión, igual en la pantalla y en la voz. */
export const conflictMessage = (c: SettingConflict) => `La historia dice ${settingLabel(c.story)}, pero ahora la Biblia dice ${settingLabel(c.bible)}. ¿Qué quieres conservar?`

export const CHOICES: { choice: SettingChoice; label: (c: SettingConflict) => string; help: string }[] = [
  { choice: 'adapt', label: (c) => `Adaptar historia a ${byId(c.bible).es}`, help: 'Cambio el lugar en el guion de las escenas. Los diálogos y las imágenes no los toco: te digo cuáles revisar.' },
  { choice: 'keep', label: (c) => `Mantener ${byId(c.story).es}`, help: 'Corrijo las fichas de la Biblia. Las imágenes Canon no las toco: te digo cuáles revisar.' },
  { choice: 'transform', label: () => 'Definir transformación dentro de la historia', help: 'No cambio textos. Guardo la decisión y te digo qué falta: la escena del cambio y un estado por etapa.' },
]

/** Cambia el lugar en un texto, respetando mayúsculas y plural. Usa inglés en los prompts. */
function swap(text: string, from: Setting, to: Setting, en: boolean): string {
  const word = en ? to.en : to.es
  const folded = fold(text)
  const re = new RegExp(from.words.source, 'gi')
  let out = ''
  let last = 0
  for (const m of folded.matchAll(re)) {
    const orig = text.slice(m.index!, m.index! + m[0].length)
    const plural = /s$/i.test(orig) ? 's' : ''
    let w = word + plural
    if (orig === orig.toUpperCase() && /[A-Z]/.test(orig)) w = w.toUpperCase()
    else if (/^[A-ZÁÉÍÓÚ]/.test(orig)) w = w[0].toUpperCase() + w.slice(1)
    out += text.slice(last, m.index!) + w
    last = m.index! + m[0].length
  }
  return out + text.slice(last)
}

const PROMPT_FIELDS = /generationPrompt|prompt$/

interface Field {
  where: string
  field: string
  get: (s: Snapshot) => string | undefined
  set: (s: Snapshot, v: string) => Snapshot
  sceneId?: string
  shotId?: string
  kind?: ItemKind
  itemId?: string
}

export interface Snapshot {
  project: Project
  scenes: Record<string, Scene>
}

const SCENE_FIELDS: [string, string][] = [
  ['script.action', 'Acción'],
  ['script.cameraDirection', 'Cámara'],
  ['script.soundDirection', 'Sonido'],
  ['script.generationPrompt', 'Prompt de video'],
  ['prep.start.prompt', 'Prompt de imagen inicial'],
  ['prep.end.prompt', 'Prompt de imagen final'],
]
const SHOT_FIELDS: [string, string][] = [
  ['action', 'Acción'],
  ['continuity', 'Continuidad'],
  ['cameraDirection', 'Cámara'],
  ['generationPrompt', 'Prompt de video'],
  ['prep.start.prompt', 'Prompt de imagen inicial'],
  ['prep.end.prompt', 'Prompt de imagen final'],
]

const getPath = (o: unknown, path: string): string | undefined => {
  const v = path.split('.').reduce<unknown>((a, k) => (a && typeof a === 'object' ? (a as Record<string, unknown>)[k] : undefined), o)
  return typeof v === 'string' ? v : undefined
}
const setPath = <T>(o: T, path: string, v: string): T => {
  const [k, ...rest] = path.split('.')
  const cur = (o ?? {}) as Record<string, unknown>
  return { ...cur, [k]: rest.length ? setPath(cur[k], rest.join('.'), v) : v } as T
}

function sceneFields(scene: Scene, n: number): Field[] {
  const at = nowIso()
  const out: Field[] = SCENE_FIELDS.map(([field, label]) => ({
    where: `${sceneName(n)} · ${label}`,
    field,
    sceneId: scene.id,
    get: (s) => getPath(s.scenes[scene.id], field),
    set: (s, v) => ({ ...s, scenes: { ...s.scenes, [scene.id]: { ...setPath(s.scenes[scene.id], field, v), updatedAt: at } } }),
  }))
  for (const [j, sh] of (scene.shots ?? []).entries()) {
    for (const [field, label] of SHOT_FIELDS) {
      const patchShot = (s: Snapshot, fn: (x: Shot) => Shot): Snapshot => {
        const sc = s.scenes[scene.id]
        return { ...s, scenes: { ...s.scenes, [scene.id]: { ...sc, updatedAt: at, shots: sc.shots?.map((x) => (x.id === sh.id ? { ...fn(x), updatedAt: at } : x)) } } }
      }
      out.push({
        where: `${sceneName(n)} · Plano ${j + 1} · ${label}`,
        field,
        sceneId: scene.id,
        shotId: sh.id,
        get: (s) => getPath(s.scenes[scene.id]?.shots?.find((x) => x.id === sh.id), field),
        set: (s, v) => patchShot(s, (x) => setPath(x, field, v)),
      })
    }
  }
  return out
}

function itemFields(it: BibleItem): Field[] {
  const patch = (s: Snapshot, fn: (x: BibleItem) => BibleItem): Snapshot => ({ ...s, project: { ...s.project, locations: (s.project.locations ?? []).map((x) => (x.id === it.id ? fn(x) : x)) } })
  const find = (s: Snapshot) => s.project.locations?.find((x) => x.id === it.id)
  const out: Field[] = (
    [
      ['name', 'Nombre'],
      ['note', 'Nota'],
      ['description', 'Descripción'],
      ['prompt', 'Prompt'],
    ] as const
  ).map(([field, label]) => ({
    where: `Locación «${it.name}» · ${label}`,
    field,
    kind: 'locations' as const,
    itemId: it.id,
    get: (s) => find(s)?.[field],
    set: (s, v) => patch(s, (x) => ({ ...x, [field]: v })),
  }))
  for (const st of it.states ?? []) {
    for (const [key, label] of [
      ['label', 'nombre'],
      ['shows', 'se ve'],
      ['hides', 'no se ve'],
    ] as const) {
      out.push({
        where: `Locación «${it.name}» · Estado «${st.label}» · ${label}`,
        field: `states.${st.id}.${key}`,
        kind: 'locations',
        itemId: it.id,
        get: (s) => find(s)?.states?.find((x) => x.id === st.id)?.[key],
        set: (s, v) => patch(s, (x) => ({ ...x, states: x.states?.map((y) => (y.id === st.id ? { ...y, [key]: v, updatedAt: nowIso() } : y)) })),
      })
    }
  }
  return out
}

const placeField: Field = {
  where: 'Biblia · Lugar principal',
  field: 'bible.place',
  get: (s) => s.project.bible?.place,
  set: (s, v) => ({ ...s, project: { ...s.project, bible: { ...s.project.bible, place: v } } }),
}

export interface SettingImpact {
  choice: SettingChoice
  conflict: SettingConflict
  edits: SettingEdit[]
  /** Lo que no se cambia solo: diálogos, palabras sueltas, imágenes y videos. */
  pending: string[]
  /** Texto de la decisión que se guarda aprobada. */
  decision: string
}

function sceneMedia(scene: Scene): boolean {
  const shots = scene.shots ?? []
  return !!(
    scene.startImageId ||
    scene.endImageId ||
    scene.prep?.start?.approvedId ||
    scene.prep?.end?.approvedId ||
    scene.activeVideoVersionId ||
    shots.some((sh) => sh.startImageId || sh.endImageId || sh.prep?.start?.approvedId || sh.prep?.end?.approvedId || sh.activeVideoVersionId)
  )
}

function editsFor(fields: Field[], s: Snapshot, from: Setting, to: Setting): SettingEdit[] {
  const out: SettingEdit[] = []
  for (const f of fields) {
    const before = f.get(s)
    if (!before || !has(from.words, before)) continue
    const after = swap(before, from, to, PROMPT_FIELDS.test(f.field))
    if (after === before) continue
    out.push({ sceneId: f.sceneId, shotId: f.shotId, kind: f.kind, itemId: f.itemId, field: f.field, where: f.where, before, after })
  }
  return out
}

/** Vista previa: qué cambiaría con cada camino. No cambia nada. */
export function settingImpact(p: Project, scenes: Scene[], choice: SettingChoice): SettingImpact | null {
  const conflict = detectSettingConflict(p, scenes)
  if (!conflict) return null
  const story = byId(conflict.story)
  const bible = byId(conflict.bible)
  const s: Snapshot = { project: p, scenes: Object.fromEntries(scenes.map((x) => [x.id, x])) }
  const pending: string[] = []
  let edits: SettingEdit[] = []
  let decision: string
  if (choice === 'adapt') {
    scenes.forEach((scene, i) => {
      edits.push(...editsFor(sceneFields(scene, i + 1), s, story, bible))
      const n = sceneName(i + 1)
      if (scene.script.dialogue && has(story.words, scene.script.dialogue)) pending.push(`${n} · el diálogo dice «${story.es}»: revísalo tú (no cambio diálogos).`)
      if (scene.title && has(story.words, scene.title)) pending.push(`${n} · el título dice «${story.es}»: revísalo tú.`)
      const words = [...new Set(sceneTexts(scene).flatMap((t) => fold(t).match(new RegExp(story.related.source, 'gi')) ?? []).map((w) => w.toLowerCase()))]
      if (words.length) pending.push(`${n} · dice ${words.map((w) => `«${w}»`).join(', ')}: puede no caber en un ${bible.es}. Revísalo tú.`)
      if (conflict.sceneHits.some((h) => h.sceneId === scene.id) && sceneMedia(scene)) pending.push(`${n} · tiene imágenes o video aprobados de ${story.es}: revisar o regenerar (no se tocan).`)
    })
    decision = `El lugar de la historia es ${settingLabel(bible.id)} en todas las escenas (se adaptó el guion; antes decía ${settingLabel(story.id)}).`
  } else if (choice === 'keep') {
    for (const it of p.locations ?? []) {
      if (!conflict.itemHits.some((h) => h.itemId === it.id)) continue
      edits.push(...editsFor(itemFields(it), s, bible, story))
      if (it.imageId) pending.push(`Locación «${it.name}» · su imagen Canon puede mostrar un ${bible.es}: revisar o regenerar (no se toca).`)
      const words = [...new Set(fold(it.description).match(new RegExp(bible.related.source, 'gi')) ?? [])]
      if (words.length) pending.push(`Locación «${it.name}» · dice ${words.map((w) => `«${w.toLowerCase()}»`).join(', ')}: puede no caber en un ${story.es}. Revísalo tú.`)
    }
    if (conflict.place) edits.push(...editsFor([placeField], s, bible, story))
    decision = `El lugar de la historia es ${settingLabel(story.id)} en todas las escenas (se corrigió la Biblia; decía ${settingLabel(bible.id)}).`
  } else {
    edits = []
    pending.push(
      `Falta la escena donde el ${story.es} se vuelve ${bible.es}: escríbela o dime cuál es.`,
      `Marca etapas: escenas de ${story.es} y escenas de ${bible.es}.`,
      `En la locación, un estado por etapa (${story.es} / ${bible.es}). Nunca una imagen con los dos.`,
    )
    if (conflict.itemHits.length) pending.push(`Las fichas ${conflict.itemHits.map((h) => `«${h.name}»`).join(', ')} quedan como están (lugar de después).`)
    decision = `La historia empieza en ${settingLabel(story.id)} y se transforma en ${settingLabel(bible.id)} dentro de la historia. Cada imagen muestra uno solo.`
  }
  return { choice, conflict, edits, pending, decision }
}

/** Aplica la vista previa en un solo paso. Devuelve el proyecto nuevo (para `commit`); las imágenes no se tocan. */
export function applySetting(cur: Snapshot, impact: SettingImpact, decisionId: string): Snapshot {
  let next = cur
  for (const e of impact.edits) {
    const f = fieldOf(next, e)
    if (f) next = f.set(next, e.after)
  }
  const change: SettingChange = {
    choice: impact.choice,
    story: impact.conflict.story,
    bible: impact.conflict.bible,
    decisionId,
    edits: impact.edits,
    pending: impact.pending,
    at: nowIso(),
  }
  const at = nowIso()
  const decisions = [
    ...(next.project.decisions ?? []),
    { id: decisionId, text: impact.decision, proposedBy: 'director' as const, proposedAt: at, status: 'approved' as const, approvedBy: 'director' as const, approvedAt: at, updatedAt: at },
  ]
  return { ...next, project: { ...next.project, decisions, settingChange: change } }
}

/** Busca el campo de un cambio guardado (la escena, el plano o la ficha pueden ya no existir). */
function fieldOf(s: Snapshot, e: SettingEdit): Field | undefined {
  if (e.itemId) {
    const it = s.project.locations?.find((x) => x.id === e.itemId)
    return it ? itemFields(it).find((f) => f.field === e.field) : undefined
  }
  if (e.sceneId) {
    const n = s.project.sceneIds.indexOf(e.sceneId) + 1
    const sc = s.scenes[e.sceneId]
    return sc ? sceneFields(sc, n).find((f) => f.field === e.field && f.shotId === e.shotId) : undefined
  }
  return e.field === placeField.field ? placeField : undefined
}

export interface UndoResult {
  next: Snapshot
  /** Lo que se cambió después a mano: no se regresa, para no borrar ese trabajo. */
  kept: string[]
}

/** Deshace la decisión: regresa cada texto si sigue como quedó, quita la decisión y vuelve a mostrar la pregunta. */
export function undoSetting(cur: Snapshot): UndoResult | null {
  const change = cur.project.settingChange
  if (!change) return null
  let next = cur
  const kept: string[] = []
  for (const e of change.edits) {
    const f = fieldOf(next, e)
    if (f && f.get(next) === e.after) next = f.set(next, e.before)
    else kept.push(e.where)
  }
  const { settingChange: _gone, ...project } = next.project
  return { next: { ...next, project: { ...project, decisions: (project.decisions ?? []).filter((d) => d.id !== change.decisionId) } }, kept }
}

export const newDecisionId = () => uid('dec_')

/** Resultado honesto después de aplicar, en pocas palabras (para la pantalla y la voz). */
export function changeSummary(c: SettingChange): string {
  const done = c.choice === 'transform' ? 'No cambié textos: guardé la decisión.' : `Cambié ${c.edits.length} ${c.edits.length === 1 ? 'texto' : 'textos'}.`
  return `${done} Imágenes y Canon: sin tocar.${c.pending.length ? ` Falta revisar ${c.pending.length}.` : ''}`
}
