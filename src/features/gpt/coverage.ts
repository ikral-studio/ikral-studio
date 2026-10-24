// «Consultar GPT» en cobertura y planos: proponer la lista de planos de una escena (cámara y duración)
// o diseñar UN plano (cámara, prompt de imagen inicial/final y prompt de video).
// GPT solo propone. Al Aceptar, la app cambia los planos con sus acciones de siempre (deshacer + guardado).
// Si el plano cambió desde que GPT lo vio, se avisa antes de aplicar.
import { z } from 'zod'
import type { Project, Scene, Shot } from '../../types'
import { nowIso, uid } from '../../utils'
import { cameraSpanish } from '../camera/camera'
import { approvedDecisions, phaseOf, phasesOf } from '../continuity/continuity'
import { hasCoverage, shotsOf, V1_MAX_DURATION } from '../coverage/shots'
import { styleSpanish } from '../project-style/style'
import { changesSince, historyForPrompt, patchThread, type GptThread } from './threads'

/** Campos de un plano que GPT puede proponer. */
export type ShotField = 'name' | 'duration' | 'camera' | 'action' | 'sound' | 'continuity' | 'imageStart' | 'imageEnd' | 'video'
export type CoverageProposalKind = 'add-shot' | 'edit'
export type CoverageProposalStatus = 'pending' | 'accepted' | 'discarded' | 'asked-claude'

/** Datos de un plano nuevo propuesto. */
export interface ProposedShot {
  name: string
  duration: number
  camera: string
  action: string
  sound: string
}

export interface CoverageProposal {
  id: string
  kind: CoverageProposalKind
  /** «edit»: el plano que cambia (id y posición, empieza en 1). «add-shot»: después de cuál va (0 = al principio). */
  shotId?: string
  shot?: number
  field?: ShotField
  /** Valor nuevo del campo («edit»). En «add-shot», el nombre del plano nuevo. */
  text: string
  /** Solo «add-shot». */
  newShot?: ProposedShot
  reason: string
  /** Lo que GPT vio: el valor del campo («edit») o la lista de planos («add-shot»). */
  before: string
  status: CoverageProposalStatus
  /** Al aceptar: qué plano se tocó y cómo quedó (para Deshacer). */
  applied?: { shotId: string; field?: ShotField; before: string; after: string }
  resolvedAt?: string
}

/** Lo que GPT vio la última vez (para avisar «esto cambió desde la última vez»). */
export interface CoverageSeen {
  action: string
  dialogue: string
  shots: string
  decisionIds: string[]
}

export type CoverageThread = GptThread<CoverageProposal, CoverageSeen>

export const MAX_COVERAGE_PROPOSALS = 10
const CHAR_DESC = 200
const CLIP = 240

const clip = (t: string | undefined, max: number) => {
  const s = (t ?? '').trim().replace(/\s+/g, ' ')
  return s.length > max ? `${s.slice(0, max - 1)}…` : s
}

// ---- apartado: la cobertura de una escena o un plano ----

/** Clave del hilo: «<escena>» (cobertura) o «<escena>#<plano>» (un plano). */
export const coverageKey = (sceneId: string, shotId?: string) => (shotId ? `${sceneId}#${shotId}` : sceneId)

export function parseCoverageKey(key: string): { sceneId: string; shotId?: string } {
  const i = key.indexOf('#')
  return i < 0 ? { sceneId: key } : { sceneId: key.slice(0, i), shotId: key.slice(i + 1) }
}

/** Campos que se pueden proponer en cada apartado. */
export const COVERAGE_FIELDS: ShotField[] = ['name', 'duration', 'camera', 'action', 'sound', 'continuity']
export const SHOT_FIELDS: ShotField[] = ['camera', 'imageStart', 'imageEnd', 'video', 'duration']

export const FIELD_LABEL: Record<ShotField, string> = {
  name: 'el nombre',
  duration: 'la duración',
  camera: 'la cámara',
  action: 'la acción',
  sound: 'el sonido',
  continuity: 'la continuidad',
  imageStart: 'el prompt de la imagen inicial',
  imageEnd: 'el prompt de la imagen final',
  video: 'el prompt de video',
}

/** Valor de hoy de un campo del plano (como texto). */
export function readShotField(shot: Shot, field: ShotField): string {
  switch (field) {
    case 'name':
      return shot.name ?? ''
    case 'duration':
      return String(shot.duration ?? '')
    case 'camera':
      return shot.cameraDirection ?? ''
    case 'action':
      return shot.action ?? ''
    case 'sound':
      return shot.sound ?? ''
    case 'continuity':
      return shot.continuity ?? ''
    case 'imageStart':
      return shot.prep?.start?.prompt ?? ''
    case 'imageEnd':
      return shot.prep?.end?.prompt ?? ''
    case 'video':
      return shot.generationPrompt ?? ''
  }
}

/** Duración válida en segundos (o null). */
export function parseDuration(t: string | number | null | undefined): number | null {
  const n = typeof t === 'number' ? t : parseFloat(String(t ?? '').replace(',', '.'))
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.min(V1_MAX_DURATION, Math.round(n * 10) / 10)
}

/** Firma de la lista de planos (nombre y duración en orden): si cambia, una propuesta de «agregar» puede ser vieja. */
export const shotsSignature = (scene: Scene) => shotsOf(scene).map((s) => `${s.name ?? ''}·${s.duration ?? ''}`).join(' | ')

/** Firma de un plano agregado (para saber si se editó después de aceptarlo). */
const addedSignature = (s: Shot) => JSON.stringify([s.name, s.duration, s.cameraDirection ?? '', s.action ?? '', s.sound ?? ''])

export const coverageSeenOf = (project: Project, scene: Scene): CoverageSeen => ({
  action: scene.script.action,
  dialogue: scene.script.dialogue,
  shots: shotsSignature(scene),
  decisionIds: approvedDecisions(project).map((d) => d.id),
})

export function coverageChangesSince(seen: CoverageSeen | undefined, now: CoverageSeen): string[] {
  if (!seen) return []
  const out = changesSince(seen, now)
  if (seen.shots !== now.shots) out.push('La lista de planos cambió.')
  return out
}

const shotLine = (s: Shot, k: number, full: boolean) =>
  [
    `${k + 1}. «${s.name ?? ''}» · ${s.duration ?? '?'} s`,
    s.cameraDirection?.trim() && `   Cámara: ${clip(s.cameraDirection, CLIP)}`,
    cameraSpanish(s.camera) && `   Cámara (ficha): ${cameraSpanish(s.camera)}`,
    s.action?.trim() && `   Acción: ${clip(s.action, CLIP)}`,
    s.sound?.trim() && `   Sonido: ${clip(s.sound, CLIP)}`,
    full && s.continuity?.trim() && `   Continuidad: ${clip(s.continuity, CLIP)}`,
  ]
    .filter(Boolean)
    .join('\n')

export interface CoveragePacket {
  prompt: string
  seen: CoverageSeen
}

/**
 * Paquete para cobertura o un plano: proyecto, estilo, etapas, decisiones APROBADAS, personajes,
 * la escena (acción, diálogos, sonido), sus planos y, si es un plano, sus prompts de hoy.
 * No va: decisiones propuestas o rechazadas, chat con Claude, imágenes ni rutas de archivos.
 */
export function buildCoveragePacket(project: Project, ordered: Scene[], scene: Scene, key: string, thread: CoverageThread, request: string): CoveragePacket | null {
  const { shotId } = parseCoverageKey(key)
  const shots = shotsOf(scene)
  const k = shotId ? shots.findIndex((s) => s.id === shotId) : -1
  if (shotId && k < 0) return null
  const shot = shotId ? shots[k] : undefined
  const i = ordered.findIndex((s) => s.id === scene.id)
  const number = new Map(ordered.map((s, n) => [s.id, n + 1]))
  const phases = phasesOf(project)
  const seen = coverageSeenOf(project, scene)
  const decisions = approvedDecisions(project)
    .map((d) => `- ${d.text}${d.sceneIds?.length ? ` (escenas ${d.sceneIds.map((id) => number.get(id)).filter(Boolean).join(', ')})` : ''}`)
    .join('\n')
  const characters = (project.characters ?? [])
    .filter((c) => c.name.trim())
    .map((c) => `- ${c.name.trim()}${c.description.trim() ? `: ${clip(c.description, CHAR_DESC)}` : ''}`)
    .join('\n')
  const changes = coverageChangesSince(thread.seen, seen)
  const history = historyForPrompt(thread)

  const intro = shot
    ? [
        `Eres director de fotografía de un storyboard. El director te pide diseñar UN plano: la cámara, el prompt de la imagen inicial, el de la imagen final y el prompt de video.`,
        'Tipo de propuesta: «cambiar» con campo «camara», «prompt_imagen_inicial», «prompt_imagen_final», «prompt_video» o «duracion» (texto = el valor nuevo completo; duración en segundos).',
        'Los prompts de imagen describen un cuadro fijo (encuadre, personajes, luz, estilo). El de video describe el movimiento de cámara y lo que pasa durante el plano.',
      ]
    : [
        'Eres director de fotografía de un storyboard. El director te pide proponer la cobertura de UNA escena: la lista de planos con su cámara y duración.',
        'Tipos de propuesta: «agregar_plano» (plano = después de cuál va, 0 = al principio; nombre, duracion en segundos, camara, accion y sonido; texto = el nombre),',
        '«cambiar» (plano = número; campo «nombre», «duracion», «camara», «accion», «sonido» o «continuidad»; texto = el valor nuevo completo).',
        'La suma de duraciones debe ser razonable para la escena.',
      ]

  const prompt = [
    ...intro,
    `Responde en español. Propón cambios concretos (máximo ${MAX_COVERAGE_PROPOSALS}); el director decide cuáles acepta.`,
    'Respeta las decisiones aprobadas del director y la etapa de la escena: no las contradigas. En «resumen_hilo» resume en pocas líneas todo lo platicado (para retomarlo otro día).',
    '',
    `Proyecto: «${project.title}»`,
    styleSpanish(project) && `Estilo: ${styleSpanish(project)}`,
    `Etapas en orden: ${phases.length ? phases.map((p) => p.name).join(' → ') : '(sin etapas)'}`,
    '',
    'Decisiones aprobadas por el director:',
    decisions || '(ninguna)',
    '',
    'Personajes:',
    characters || '(sin personajes)',
    '',
    `Escena ${i + 1} de ${ordered.length} · «${scene.title}» · etapa: ${phaseOf(project, scene)?.name ?? 'sin etapa'}`,
    `Acción visual: ${clip(scene.script.action, 600) || '(vacía)'}`,
    scene.script.dialogue.trim() && `Diálogos: ${clip(scene.script.dialogue, 600)}`,
    scene.script.soundDirection.trim() && `Sonido: ${clip(scene.script.soundDirection, CLIP)}`,
    `Duración planeada: ${scene.plannedDuration} s`,
    '',
    hasCoverage(scene) ? 'Planos de la escena:' : 'Planos de la escena (aún es un solo plano):',
    shots.map((s, n) => shotLine(s, n, !shot)).join('\n'),
    shot && `\nPlano a diseñar: ${k + 1} «${shot.name ?? ''}»`,
    shot && `Prompt de imagen inicial: ${clip(shot.prep?.start?.prompt, 600) || '(vacío)'}`,
    shot && `Prompt de imagen final: ${clip(shot.prep?.end?.prompt, 600) || '(vacío)'}`,
    shot && `Prompt de video: ${clip(shot.generationPrompt, 600) || '(vacío)'}`,
    changes.length ? `\nEsto cambió desde la última vez:\n${changes.map((c) => `- ${c}`).join('\n')}` : '',
    history ? `\n${history}` : '',
    '',
    `Pedido del director: ${request.trim()}`,
  ]
    .filter((x): x is string => typeof x === 'string' && x !== '')
    .join('\n')

  return { prompt, seen }
}

// ---- respuesta de GPT ----

const CAMPO = ['nombre', 'duracion', 'camara', 'accion', 'sonido', 'continuidad', 'prompt_imagen_inicial', 'prompt_imagen_final', 'prompt_video'] as const
const FIELD: Record<(typeof CAMPO)[number], ShotField> = {
  nombre: 'name',
  duracion: 'duration',
  camara: 'camera',
  accion: 'action',
  sonido: 'sound',
  continuidad: 'continuity',
  prompt_imagen_inicial: 'imageStart',
  prompt_imagen_final: 'imageEnd',
  prompt_video: 'video',
}

const responseSchema = z.object({
  respuesta: z.string(),
  resumen_hilo: z.string(),
  propuestas: z.array(
    z.object({
      tipo: z.enum(['agregar_plano', 'cambiar']),
      plano: z.number().int().nullable(),
      campo: z.enum(CAMPO).nullable(),
      texto: z.string(),
      nombre: z.string().nullable(),
      duracion: z.number().nullable(),
      camara: z.string().nullable(),
      accion: z.string().nullable(),
      sonido: z.string().nullable(),
      motivo: z.string(),
    }),
  ),
})
export type CoverageResponse = z.infer<typeof responseSchema>

/** Lee la respuesta de GPT. Si no trae el formato pedido, no se usa nada. */
export function parseCoverageResponse(raw: string): { ok: true; data: CoverageResponse } | { ok: false; error: 'bad-format' } {
  try {
    const r = responseSchema.safeParse(JSON.parse(raw))
    return r.success ? { ok: true, data: r.data } : { ok: false, error: 'bad-format' }
  } catch {
    return { ok: false, error: 'bad-format' }
  }
}

/** Convierte las propuestas de GPT en propuestas pendientes. Las que no caben en el apartado o apuntan a planos que no existen se ignoran. */
export function toCoverageProposals(data: CoverageResponse, scene: Scene, key: string): CoverageProposal[] {
  const { shotId } = parseCoverageKey(key)
  const shots = shotsOf(scene)
  const allowed = shotId ? SHOT_FIELDS : COVERAGE_FIELDS
  const out: CoverageProposal[] = []
  for (const g of data.propuestas.slice(0, MAX_COVERAGE_PROPOSALS)) {
    const base = { id: uid('gc'), reason: g.motivo.trim(), status: 'pending' as const }
    if (g.tipo === 'agregar_plano') {
      if (shotId) continue
      const n = g.plano ?? shots.length
      const name = (g.nombre ?? g.texto).trim()
      if (n < 0 || n > shots.length || !name) continue
      const newShot = { name, duration: parseDuration(g.duracion) ?? 3, camera: g.camara?.trim() ?? '', action: g.accion?.trim() ?? '', sound: g.sonido?.trim() ?? '' }
      out.push({ ...base, kind: 'add-shot', shot: n, text: name, newShot, before: shotsSignature(scene) })
      continue
    }
    if (!g.campo) continue
    const field = FIELD[g.campo]
    if (!allowed.includes(field)) continue
    const k = shotId ? shots.findIndex((s) => s.id === shotId) : (g.plano ?? 0) - 1
    const target = shots[k]
    if (!target) continue
    let text = g.texto.trim()
    if (field === 'duration') {
      const d = parseDuration(text)
      if (d == null) continue
      text = String(d)
    } else if (!text && field === 'name') continue
    const before = readShotField(target, field)
    if (text === before) continue
    out.push({ ...base, kind: 'edit', shotId: target.id, shot: k + 1, field, text, before })
  }
  return out
}

/** Dónde cae la propuesta hoy. Si el plano cambió de id (pasó a cobertura) pero sigue igual en su lugar, se sigue. */
export function resolveCoverageTarget(p: CoverageProposal, scene: Scene): { shot?: Shot; stale: boolean } {
  if (p.kind === 'add-shot') return { stale: shotsSignature(scene) !== p.before }
  const shots = shotsOf(scene)
  const byId = shots.find((s) => s.id === p.shotId)
  const shot = byId ?? shots[(p.shot ?? 0) - 1]
  if (!shot) return { stale: true }
  return { shot, stale: readShotField(shot, p.field!) !== p.before }
}

export const isCoverageStale = (p: CoverageProposal, scene: Scene | undefined) => !scene || (p.status === 'pending' && resolveCoverageTarget(p, scene).stale)

/** Para aplicar esta propuesta la escena necesita planos propios (pasar a cobertura, con respaldo antes). */
export const needsCoverage = (scene: Scene) => !hasCoverage(scene)

// ---- acciones del director sobre las propuestas (cada una se puede deshacer) ----
export interface CoverageOps {
  scene: (sceneId: string) => Scene | undefined
  addShot: (sceneId: string, afterId?: string) => string | undefined
  moveShot: (sceneId: string, shotId: string, dir: -1 | 1) => void
  updateShot: (sceneId: string, shotId: string, patch: Partial<Omit<Shot, 'id' | 'order'>>) => void
  updateShotFramePlan: (sceneId: string, shotId: string, slot: 'start' | 'end', patch: { prompt?: string }) => void
  /** Quita el plano (va a la papelera: no se pierde). */
  removeShot: (sceneId: string, shotId: string) => void
}

/** Pone un campo del plano con las acciones de siempre. */
function writeField(ops: CoverageOps, sceneId: string, shotId: string, field: ShotField, value: string) {
  if (field === 'imageStart' || field === 'imageEnd') return ops.updateShotFramePlan(sceneId, shotId, field === 'imageStart' ? 'start' : 'end', { prompt: value })
  const patch: Partial<Shot> =
    field === 'duration'
      ? { duration: parseDuration(value) ?? undefined }
      : field === 'camera'
        ? { cameraDirection: value || undefined }
        : field === 'video'
          ? { generationPrompt: value || undefined }
          : field === 'name'
            ? { name: value }
            : { [field]: value || undefined }
  ops.updateShot(sceneId, shotId, patch)
}

export interface CoverageProposalRef {
  threadId: string
  messageId: string
  proposalId: string
}

function patchProposal(threads: CoverageThread[], ref: CoverageProposalRef, fn: (p: CoverageProposal) => CoverageProposal): CoverageThread[] {
  return patchThread(threads, ref.threadId, (t) => ({
    ...t,
    messages: t.messages.map((m) => (m.id !== ref.messageId ? m : { ...m, proposals: m.proposals?.map((p) => (p.id === ref.proposalId ? fn(p) : p)) })),
  }))
}

export const findCoverageProposal = (threads: CoverageThread[], ref: CoverageProposalRef) =>
  threads.find((t) => t.id === ref.threadId)?.messages.find((m) => m.id === ref.messageId)?.proposals?.find((p) => p.id === ref.proposalId)

export type CoverageAcceptResult = { ok: true; threads: CoverageThread[]; shotId: string } | { ok: false; error: 'missing' | 'not-pending' | 'needs-coverage' }

/**
 * Aceptar: aplica el cambio con las acciones de siempre y guarda cómo deshacerlo.
 * La escena ya debe tener cobertura (la interfaz pasa a cobertura antes, con respaldo y Deshacer).
 */
export function acceptCoverageProposal(threads: CoverageThread[], ref: CoverageProposalRef, sceneId: string, ops: CoverageOps, at = nowIso()): CoverageAcceptResult {
  const p = findCoverageProposal(threads, ref)
  if (!p || p.status !== 'pending') return { ok: false, error: 'not-pending' }
  const scene = ops.scene(sceneId)
  if (!scene) return { ok: false, error: 'missing' }
  if (needsCoverage(scene)) return { ok: false, error: 'needs-coverage' }

  if (p.kind === 'add-shot') {
    const shots = shotsOf(scene)
    const n = Math.min(p.shot ?? shots.length, shots.length)
    const id = ops.addShot(sceneId, n > 0 ? shots[n - 1].id : undefined)
    if (!id) return { ok: false, error: 'missing' }
    // `addShot` sin «después de» lo pone al final: si va al principio, se sube.
    if (n === 0) for (let k = 0; k < shots.length; k++) ops.moveShot(sceneId, id, -1)
    const s = p.newShot!
    ops.updateShot(sceneId, id, { name: s.name, duration: s.duration, cameraDirection: s.camera || undefined, action: s.action || undefined, sound: s.sound || undefined })
    const added = shotsOf(ops.scene(sceneId)!).find((x) => x.id === id)!
    return { ok: true, shotId: id, threads: patchProposal(threads, ref, (x) => ({ ...x, status: 'accepted', applied: { shotId: id, before: '', after: addedSignature(added) }, resolvedAt: at })) }
  }

  const { shot } = resolveCoverageTarget(p, scene)
  if (!shot) return { ok: false, error: 'missing' }
  const before = readShotField(shot, p.field!)
  writeField(ops, sceneId, shot.id, p.field!, p.text)
  const after = readShotField(shotsOf(ops.scene(sceneId)!).find((x) => x.id === shot.id)!, p.field!)
  return { ok: true, shotId: shot.id, threads: patchProposal(threads, ref, (x) => ({ ...x, status: 'accepted', applied: { shotId: shot.id, field: p.field, before, after }, resolvedAt: at })) }
}

export type CoverageUndoResult = { ok: true; threads: CoverageThread[] } | { ok: false; error: 'changed' }

/**
 * Deshacer: vuelve a «pendiente». Si se había aplicado, regresa el campo (o manda el plano agregado a la papelera),
 * salvo que se haya editado después.
 */
export function undoCoverageProposal(threads: CoverageThread[], ref: CoverageProposalRef, sceneId: string, ops: CoverageOps): CoverageUndoResult {
  const p = findCoverageProposal(threads, ref)
  if (!p || p.status === 'pending') return { ok: true, threads }
  if (p.applied) {
    const scene = ops.scene(sceneId)
    const shot = scene?.shots?.find((x) => x.id === p.applied!.shotId)
    if (p.kind === 'add-shot') {
      if (shot) {
        if (addedSignature(shot) !== p.applied.after) return { ok: false, error: 'changed' }
        ops.removeShot(sceneId, shot.id)
      }
    } else {
      if (!shot || readShotField(shot, p.applied.field!) !== p.applied.after) return { ok: false, error: 'changed' }
      writeField(ops, sceneId, shot.id, p.applied.field!, p.applied.before)
    }
  }
  return { ok: true, threads: patchProposal(threads, ref, (x) => ({ ...x, status: 'pending', applied: undefined, resolvedAt: undefined })) }
}

export const discardCoverageProposal = (threads: CoverageThread[], ref: CoverageProposalRef, at = nowIso()) =>
  patchProposal(threads, ref, (x) => (x.status === 'pending' ? { ...x, status: 'discarded', resolvedAt: at } : x))

/** Editar la propuesta antes de aceptarla (el valor, o el nombre del plano nuevo). */
export const editCoverageProposal = (threads: CoverageThread[], ref: CoverageProposalRef, text: string) =>
  patchProposal(threads, ref, (x) => {
    if (x.status !== 'pending') return x
    if (x.kind === 'add-shot') return text.trim() ? { ...x, text: text.trim(), newShot: { ...x.newShot!, name: text.trim() } } : x
    if (x.field === 'duration') {
      const d = parseDuration(text)
      return d == null ? x : { ...x, text: String(d) }
    }
    return { ...x, text }
  })

export const markCoverageAskedClaude = (threads: CoverageThread[], ref: CoverageProposalRef, at = nowIso()) =>
  patchProposal(threads, ref, (x) => (x.status === 'pending' ? { ...x, status: 'asked-claude', resolvedAt: at } : x))

/** Texto corto de la propuesta para la interfaz y para Claude. */
export function describeCoverageProposal(p: CoverageProposal): string {
  if (p.kind === 'add-shot') {
    const s = p.newShot!
    const where = p.shot ? `después del plano ${p.shot}` : 'al principio'
    return [`Agregar un plano ${where}: «${s.name}» · ${s.duration} s`, s.camera && `Cámara: ${s.camera}`, s.action && `Acción: ${s.action}`, s.sound && `Sonido: ${s.sound}`]
      .filter(Boolean)
      .join(' · ')
  }
  const value = p.field === 'duration' ? `${p.text} s` : p.text ? `«${p.text}»` : '(vacío)'
  return `Cambiar ${FIELD_LABEL[p.field!]} del plano ${p.shot} a: ${value}`
}

/** Mensaje para el chat con Claude: qué propone GPT. Claude decide cómo aplicarlo. */
export function coverageClaudeText(p: CoverageProposal, sceneNumber?: number): string {
  return [
    `GPT propone para la cobertura${sceneNumber ? ` de la escena ${String(sceneNumber).padStart(2, '0')}` : ''}:`,
    describeCoverageProposal(p),
    p.reason && `Motivo: ${p.reason}`,
    '¿Puedes revisarlo y aplicarlo si tiene sentido, sin tocar el Canon ni lo aprobado? Avísame qué cambiaste.',
  ]
    .filter(Boolean)
    .join('\n')
}
