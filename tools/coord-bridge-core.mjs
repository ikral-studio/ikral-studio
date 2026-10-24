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
  if (!fromChatGPT || !c.body || c.body.includes(MARK)) return null
  if (/\bCOORD-PING\b/.test(c.body)) return 'ping'
  if (/\bCOORD-CADENA-PAUSA\b/.test(c.body)) return 'chain-pause'
  if (/\bCOORD-CADENA-SIGUE\b/.test(c.body)) return 'chain-resume'
  if (c.body.includes('[COORD-TASK]')) return 'task'
  return null
}

/** Huella del texto de la tarea (sin espacios sobrantes) para detectar tareas repetidas. */
export const taskHash = (body) => createHash('sha256').update(body.replace(/\s+/g, ' ').trim()).digest('hex').slice(0, 16)

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
    const hash = taskHash(c.body)
    const twin = Object.entries(next.tasks).find(
      ([, t]) => t.hash === hash && (t.status === 'pending' || t.status === 'running' || (t.status === 'done' && now - (t.finishedAt ?? 0) < DEDUP_WINDOW_MS)),
    )
    next.tasks[c.id] = twin
      ? { hash, status: 'duplicate', of: Number(twin[0]), attempts: 0, url: c.html_url, finishedAt: now }
      : { hash, status: 'pending', attempts: 0, url: c.html_url, nextAt: now }
  }
  return { state: next, pings, controls }
}

/** Orden de la cola: primero las tareas de ChatGPT (la más vieja primero) y después las etapas del plan. */
const queueOrder = ([a], [b]) => {
  const sa = a.startsWith(STAGE_PREFIX)
  const sb = b.startsWith(STAGE_PREFIX)
  if (sa !== sb) return sa ? 1 : -1
  return sa ? a.localeCompare(b) : Number(a) - Number(b)
}

/** La siguiente tarea a correr (la más vieja que ya toca), o null. Una sola a la vez. */
export function nextTask(state, now) {
  const ready = Object.entries(state.tasks)
    .filter(([, t]) => t.status === 'pending' && (t.nextAt ?? 0) <= now)
    .sort(queueOrder)
  if (!ready.length) return null
  const id = ready[0][0]
  return id.startsWith(STAGE_PREFIX) ? id : Number(id)
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
    ([, t]) => !['done', 'failed', 'duplicate'].includes(t.status) || now - (t.finishedAt ?? now) < 30 * DEDUP_WINDOW_MS,
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
