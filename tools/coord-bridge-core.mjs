// Lógica pura del puente de coordinación (sin red, sin disco): se prueba en tools/coord-bridge.test.mjs.
import { createHash } from 'node:crypto'

export const CHATGPT_APP = 'chatgpt-codex-connector'
export const CHATGPT_USER = 'nahya-bi'
/** Las respuestas del puente y de Claude llevan esta marca (el hook Stop y el puente las ignoran). */
export const MARK = '<!-- claude -->'
/** Intentos máximos por tarea (1 normal + 1 reintento). */
export const MAX_ATTEMPTS = 2
/** Espera antes de reintentar una tarea que falló. */
export const RETRY_DELAY_MS = 10 * 60 * 1000
/** Una tarea idéntica (mismo texto) ya hecha en este plazo no se vuelve a correr. */
export const DEDUP_WINDOW_MS = 24 * 60 * 60 * 1000

/** Las tareas del encadenamiento del plan se guardan con esta clave: «etapa-3b». */
export const STAGE_PREFIX = 'etapa-'

/** Qué hacer con un comentario: 'ping', 'task', 'chain-pause', 'chain-resume' o null (se ignora). */
export function classify(c) {
  const fromChatGPT = c.performed_via_github_app?.slug === CHATGPT_APP && c.user?.login === CHATGPT_USER
  // Kyo (misma cuenta, sin app) solo puede iniciar una tarea con relevos de Kraken («KRAKEN: relevos»).
  const fromKyo = !c.performed_via_github_app && c.user?.login === CHATGPT_USER && c.body?.includes('[COORD-TASK]') && wantsRelays(c.body)
  if ((!fromChatGPT && !fromKyo) || !c.body || c.body.includes(MARK)) return null
  if (/\bCOORD-PING\b/.test(c.body)) return 'ping'
  if (/\bCOORD-CADENA-PAUSA\b/.test(c.body)) return 'chain-pause'
  if (/\bCOORD-CADENA-SIGUE\b/.test(c.body)) return 'chain-resume'
  if (c.body.includes('[COORD-TASK]')) return 'task'
  return null
}

/** Huella del texto de la tarea (sin espacios sobrantes) para detectar tareas repetidas. */
export const taskHash = (body) => createHash('sha256').update(body.replace(/\s+/g, ' ').trim()).digest('hex').slice(0, 16)

// ---- Carpeta de trabajo (workspace) ----
// Lista cerrada: la tarea solo elige una CLAVE; la ruta la pone el puente. Nunca rutas del texto de GitHub.
// Línea en la tarea: «WORKSPACE: panel» (o «COORD-WORKSPACE: panel»). Sin esa línea → IKRAL Studio (tareas viejas).

/** Claves permitidas → ruta relativa a la carpeta personal de Kyo. */
export const WORKSPACES = {
  studio: { name: 'IKRAL Studio', path: ['Documents', 'editor de storiborad', 'ikral-studio'] },
  panel: { name: 'Panel de IKRAL (ikral-memoria)', path: ['Documents', 'ikral-memoria'] },
}
const WORKSPACE_ALIASES = { studio: 'studio', 'ikral-studio': 'studio', panel: 'panel', 'ikral-panel': 'panel', 'ikral-memoria': 'panel', memoria: 'panel' }
const WORKSPACE_LINE = /^[\s>*_`-]*(?:COORD-)?WORKSPACE\s*:\s*\**\s*([^\s*`<]*)/im

/** Lo que pidió la tarea en su línea WORKSPACE (texto crudo), o null si no la tiene. */
export const askedWorkspace = (body) => WORKSPACE_LINE.exec(body ?? '')?.[1] ?? null

/** Clave de la lista cerrada para la tarea, o null si pidió una que no existe (la tarea se rechaza). */
export function workspaceOf(body) {
  const asked = askedWorkspace(body)
  if (asked === null) return 'studio'
  return Object.hasOwn(WORKSPACE_ALIASES, asked.toLowerCase()) ? WORKSPACE_ALIASES[asked.toLowerCase()] : null
}

/** Estado viejo ({ lastId }) o vacío → formato actual. */
export function normalizeState(s) {
  if (!s || typeof s.lastId !== 'number') return null
  return { lastId: s.lastId, tasks: s.tasks ?? {}, chain: s.chain ?? {} }
}

/**
 * Registra los comentarios nuevos (id > lastId). Devuelve los pings a contestar, las órdenes de la
 * cadena (pausa / sigue) y el estado con las tareas nuevas en cola ('pending') o marcadas 'duplicate'.
 * «COORD-CADENA-SIGUE» quita la pausa y borra la etapa que había fallado, para que se intente otra vez.
 */
export function ingest(state, comments, now) {
  const next = { lastId: state.lastId, tasks: { ...state.tasks }, chain: { ...state.chain } }
  const pings = []
  const controls = []
  for (const c of [...comments].sort((a, b) => a.id - b.id)) {
    if (c.id <= state.lastId) continue
    next.lastId = c.id
    const kind = classify(c)
    if (kind === 'ping') pings.push(c)
    if (kind === 'chain-pause') {
      next.chain.paused = true
      controls.push({ id: c.id, kind })
    }
    if (kind === 'chain-resume') {
      next.chain = { ...next.chain, paused: false, finishedReported: false }
      for (const [id, t] of Object.entries(next.tasks)) if (t.kind === 'stage' && t.status === 'failed') delete next.tasks[id]
      controls.push({ id: c.id, kind })
    }
    if (kind !== 'task') continue
    const workspace = workspaceOf(c.body)
    if (!workspace) {
      next.tasks[c.id] = { status: 'invalid', asked: askedWorkspace(c.body), attempts: 0, url: c.html_url, finishedAt: now }
      continue
    }
    const hash = taskHash(c.body)
    const twin = Object.entries(next.tasks).find(
      ([, t]) => t.hash === hash && (t.status === 'pending' || t.status === 'running' || (t.status === 'done' && now - (t.finishedAt ?? 0) < DEDUP_WINDOW_MS)),
    )
    next.tasks[c.id] = twin
      ? { hash, workspace, status: 'duplicate', of: Number(twin[0]), attempts: 0, url: c.html_url, finishedAt: now }
      : { hash, workspace, status: 'pending', attempts: 0, url: c.html_url, nextAt: now, ...relayFields(c, workspace) }
  }
  return { state: next, pings, controls }
}

/** Campos de relevos de una tarea nueva. El alcance solo vale si la publicó Kyo (sin app), nunca ChatGPT. */
function relayFields(c, workspace) {
  if (!wantsRelays(c.body) || workspace !== 'studio') return {}
  const alcance = c.performed_via_github_app ? [] : scopeOf(c.body)
  return { relays: true, max: relayLimit(c.body), ...(alcance.length ? { alcance } : {}) }
}

/** Orden de la cola: primero las tareas de ChatGPT (la más vieja primero) y después las etapas del plan. */
const queueOrder = ([a], [b]) => {
  const sa = a.startsWith(STAGE_PREFIX)
  const sb = b.startsWith(STAGE_PREFIX)
  if (sa !== sb) return sa ? 1 : -1
  const na = Number(a)
  const nb = Number(b)
  if (Number.isNaN(na) || Number.isNaN(nb)) return Number.isNaN(na) === Number.isNaN(nb) ? a.localeCompare(b) : Number.isNaN(na) ? -1 : 1
  return sa ? a.localeCompare(b) : na - nb
}

/** La siguiente tarea a correr (la más vieja que ya toca), o null. Una sola a la vez. */
export function nextTask(state, now, { onlyRelays = false } = {}) {
  const ready = Object.entries(state.tasks)
    .filter(([, t]) => t.status === 'pending' && (t.nextAt ?? 0) <= now && (!onlyRelays || t.relays))
    .sort(queueOrder)
  if (!ready.length) return null
  const id = ready[0][0]
  return id.startsWith(STAGE_PREFIX) || id.startsWith(RELAY_PREFIX) ? id : Number(id)
}

// ---- Encadenamiento del plan maestro ----
// Al quedar la cola vacía, el puente toma la siguiente subetapa del plan que aún no está cerrada.
// Todo sale del repositorio: las etapas, del plan; el permiso, de su línea «Encadenamiento autorizado: 3a → 4»;
// lo cerrado, de los commits («Fase 3a …»; los que dicen «(parcial)» no cierran).

/** Etapas del plan en orden: las sub-etapas («- **3a.**») o, si la fase no tiene, la fase entera («4»). */
export function planStages(planText) {
  const phases = []
  for (const line of planText.split('\n')) {
    const ph = /^## Fase (\d+)\b/.exec(line)
    if (ph) phases.push({ id: ph[1], subs: [] })
    const sub = /^- \*\*(\d+[a-z])\.\*\*/.exec(line)
    if (sub && phases.length && sub[1].startsWith(phases.at(-1).id)) phases.at(-1).subs.push(sub[1])
  }
  return phases.flatMap((p) => (p.subs.length ? p.subs : [p.id]))
}

/** Rango que el director autorizó encadenar, o null si el plan no lo dice. */
export function chainRange(planText) {
  const m = /^Encadenamiento autorizado:\s*\**\s*(\d+[a-z]?)\s*(?:→|->)\s*(\d+[a-z]?)/m.exec(planText)
  return m ? { from: m[1], to: m[2] } : null
}

/** Etapas cerradas según los asuntos de los commits. */
export function closedStages(subjects) {
  const done = new Set()
  for (const s of subjects) {
    const m = /^Fase (\d+[a-z]?)\b/.exec(s)
    if (m && !/\(parcial\)/i.test(s)) done.add(m[1])
  }
  return done
}

/** La primera etapa autorizada que falta cerrar, o null si ya están todas. */
export function nextStage(stages, range, closed) {
  if (!range) return null
  const from = stages.indexOf(range.from)
  const to = stages.indexOf(range.to)
  if (from === -1 || to === -1 || to < from) return null
  return stages.slice(from, to + 1).find((st) => !closed.has(st)) ?? null
}

/**
 * Un paso de la cadena (solo cuando la cola está vacía y no corre nada).
 * action: 'run' (puso la etapa en cola) · 'stopped' (esa etapa falló 2 veces) · 'finished' (no falta ninguna) · 'idle'.
 */
export function chainStep(state, { stages, range, closed }, now) {
  if (!range || state.chain?.paused) return { state, action: 'idle' }
  if (Object.values(state.tasks).some((t) => t.status === 'pending' || t.status === 'running')) return { state, action: 'idle' }
  // Una etapa fallida detiene la cadena aunque tenga commit de cierre (p. ej. sus pruebas fallaron).
  const failed = Object.values(state.tasks).find((t) => t.kind === 'stage' && t.status === 'failed')
  if (failed) return { state, action: 'stopped', stage: failed.stage }
  const stage = nextStage(stages, range, closed)
  if (stage === null) return { state, action: 'finished' }
  const key = STAGE_PREFIX + stage
  const tasks = { ...state.tasks, [key]: { kind: 'stage', stage, status: 'pending', attempts: 0, nextAt: now } }
  return { state: { ...state, tasks }, action: 'run', stage }
}

/** Cuántas pruebas pasaron, leído de la salida de vitest («Tests  139 passed (139)»). */
export function vitestSummary(out) {
  const m = /Tests\s+(?:(\d+) failed \| )?(\d+) passed(?: \| \d+ \w+)* \((\d+)\)/.exec(out ?? '')
  return m ? { failed: Number(m[1] ?? 0), passed: Number(m[2]), total: Number(m[3]) } : null
}

/** Resultado de un intento → nuevo estado de la tarea. */
export function afterAttempt(task, ok, now) {
  const attempts = (task.attempts ?? 0) + 1
  if (ok) return { ...task, attempts, status: 'done', finishedAt: now }
  if (attempts >= MAX_ATTEMPTS) return { ...task, attempts, status: 'failed', finishedAt: now }
  return { ...task, attempts, status: 'pending', nextAt: now + RETRY_DELAY_MS }
}

/** Una tarea quedó 'running' si el puente murió a medias: cuenta como intento fallido. */
export function recoverRunning(state, now) {
  const tasks = { ...state.tasks }
  for (const [id, t] of Object.entries(tasks)) if (t.status === 'running') tasks[id] = afterAttempt(t, false, now)
  return { ...state, tasks }
}

/** Borra del estado las tareas terminadas hace más de 30 días (el estado no crece sin fin). */
export function prune(state, now) {
  const keep = Object.entries(state.tasks).filter(
    ([, t]) => !['done', 'failed', 'duplicate', 'invalid'].includes(t.status) || now - (t.finishedAt ?? now) < 30 * DEDUP_WINDOW_MS,
  )
  return { ...state, tasks: Object.fromEntries(keep) }
}

/** ¿Sigue vivo el proceso dueño del candado? */
export function pidAlive(pid, kill = process.kill) {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    kill(pid, 0)
    return true
  } catch (e) {
    return e?.code === 'EPERM'
  }
}

// ---- Relevos de Kraken (prueba 30 oct 2026) ----
// Una tarea con la línea «KRAKEN: relevos» no termina en un solo turno: tras cada turno de Claude el puente comprueba
// (npm test + build), Codex revisa el cambio (solo lectura, suscripción ChatGPT) y Kraken decide el siguiente paso:
// terminar, otro relevo de Claude (siguiente punto u observaciones) o parar y preguntar a Kyo (solo lista cerrada).

/** Clave de cada relevo en la cola: «relevo-<comentario>-<n>». */
export const RELAY_PREFIX = 'relevo-'
/** Turnos de Claude como máximo por tarea con relevos (el primero cuenta). */
export const MAX_RELAYS = 4
const KRAKEN_LINE = /^[\s>*_`-]*KRAKEN\s*:\s*\**\s*relevos\b/im
export const wantsRelays = (body) => KRAKEN_LINE.test(body ?? '')

// ---- Kraken autónomo (orden de David, 30 oct 2026) ----
// Cuando David autoriza un objetivo y su alcance, Kraken lo completa sin confirmaciones intermedias.
// La tarea de Kyo puede traer «ALCANCE: publicar» (publicar/desplegar/push dentro de ESE objetivo) y «RELEVOS: N».
// Solo cuenta en tareas que publica Kyo; en las de ChatGPT se ignora. Lo demás de KYO_TOPICS sigue siendo de David.

/** Lo único que una tarea de Kyo puede autorizar por adelantado. */
export const GRANTABLE = ['publicar']
const ALCANCE_LINE = /^[\s>*_`-]*ALCANCE\s*:\s*\**\s*([^\n*`<]+)/im
/** Temas autorizados en la línea ALCANCE (solo los de GRANTABLE). */
export const scopeOf = (body) => [...new Set((ALCANCE_LINE.exec(body ?? '')?.[1] ?? '').toLowerCase().split(/[\s,;·]+/).filter((w) => GRANTABLE.includes(w)))]
/** Tope de relevos que una tarea puede pedir con «RELEVOS: N». */
export const MAX_RELAYS_CAP = 12
const RELEVOS_LINE = /^[\s>*_`-]*RELEVOS\s*:\s*\**\s*(\d+)/im
export function relayLimit(body) {
  const n = Number(RELEVOS_LINE.exec(body ?? '')?.[1])
  return Number.isInteger(n) && n > 0 ? Math.min(n, MAX_RELAYS_CAP) : MAX_RELAYS
}

/** Con la PAUSA puesta solo corren las tareas con «KRAKEN: relevos» (nadie quita ni pone la PAUSA a mano).
 *  Si el archivo de PAUSA dice «TOTAL», se detiene todo, también los relevos. */
export const pauseLetsRelays = (pauseText) => !/\bTOTAL\b/i.test(pauseText ?? '')

/** Lo que SIEMPRE espera a Kyo (docs/kraken-autonomo-propuesta-2026-10-30.md §4). Lo demás lo deciden los agentes. */
export const KYO_TOPICS = ['publicar', 'dinero', 'borrar', 'permisos', 'canon-creativo', 'clientes-reales', 'proyectos-protegidos', 'produccion']

/** Lee el final del turno de Claude: «NECESITA-KYO: <tema> · <motivo>» y líneas «DECISIÓN: …». */
export function parseTurn(out) {
  const text = out ?? ''
  const kyo = /^\s*NECESITA-KYO\s*:\s*([a-z-]+)\s*[·:-]?\s*(.*)$/im.exec(text)
  const decisions = [...text.matchAll(/^\s*DECISI[OÓ]N\s*:\s*(.+)$/gim)].map((m) => m[1].trim())
  // Un tema fuera de la lista cerrada NO para la cadena: es una decisión técnica que los agentes resuelven.
  const needsKyo = kyo && KYO_TOPICS.includes(kyo[1].toLowerCase()) ? { topic: kyo[1].toLowerCase(), why: kyo[2].trim() } : null
  return { needsKyo, decisions, offList: kyo && !needsKyo ? kyo[1] : null }
}

/** Respuesta de Codex (JSON del esquema) → { verdict, notes }. Cualquier cosa rara = 'invalido'. */
export function parseReview(raw) {
  try {
    const r = typeof raw === 'string' ? JSON.parse(raw) : raw
    const verdict = ['terminado', 'siguiente', 'corregir', 'kyo'].includes(r?.veredicto) ? r.veredicto : 'invalido'
    const notes = Array.isArray(r?.observaciones) ? r.observaciones.map(String).filter(Boolean) : []
    return { verdict, notes, next: typeof r?.siguiente_paso === 'string' ? r.siguiente_paso : '' }
  } catch {
    return { verdict: 'invalido', notes: [], next: '' }
  }
}

/**
 * Kraken decide el siguiente paso tras un turno. turn = parseTurn, review = parseReview, checks = { ok, why }, n = turno actual (1…).
 * → { action: 'done' | 'relay' | 'kyo' | 'limit', why }
 */
export function relayDecision({ turn, review, checks, n, max = MAX_RELAYS, alcance = [] }) {
  // Un tema que David ya autorizó en el ALCANCE de la tarea no la detiene.
  if (turn?.needsKyo && !alcance.includes(turn.needsKyo.topic)) return { action: 'kyo', why: `Claude: ${turn.needsKyo.topic} · ${turn.needsKyo.why}` }
  if (review?.verdict === 'kyo') return { action: 'kyo', why: `Codex: ${review.notes.join(' · ') || 'decisión de David'}` }
  const more = !checks?.ok || review?.verdict === 'siguiente' || review?.verdict === 'corregir' || review?.verdict === 'invalido'
  if (!more) return { action: 'done', why: 'pruebas OK y Codex aprobó' }
  const why = !checks?.ok ? `comprobación: ${checks?.why}` : review.verdict === 'invalido' ? 'Codex no dio veredicto válido' : `Codex: ${review.verdict}`
  if (n >= max) return { action: 'limit', why: `${why} y ya van ${n} turnos (tope ${max})` }
  return { action: 'relay', why }
}

/** Pone en cola el siguiente relevo de la tarea raíz. */
export function enqueueRelay(state, root, n, data, now) {
  const key = `${RELAY_PREFIX}${root}-${n}`
  return { ...state, tasks: { ...state.tasks, [key]: { kind: 'relay', root: String(root), n, relays: true, workspace: 'studio', status: 'pending', attempts: 0, nextAt: now, ...data } } }
}
