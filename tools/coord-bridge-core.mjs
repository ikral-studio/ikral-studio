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

/** Qué hacer con un comentario: 'ping', 'task' o null (se ignora). */
export function classify(c) {
  const fromChatGPT = c.performed_via_github_app?.slug === CHATGPT_APP && c.user?.login === CHATGPT_USER
  if (!fromChatGPT || !c.body || c.body.includes(MARK)) return null
  if (/\bCOORD-PING\b/.test(c.body)) return 'ping'
  if (c.body.includes('[COORD-TASK]')) return 'task'
  return null
}

/** Huella del texto de la tarea (sin espacios sobrantes) para detectar tareas repetidas. */
export const taskHash = (body) => createHash('sha256').update(body.replace(/\s+/g, ' ').trim()).digest('hex').slice(0, 16)

/** Estado viejo ({ lastId }) o vacío → formato actual. */
export function normalizeState(s) {
  if (!s || typeof s.lastId !== 'number') return null
  return { lastId: s.lastId, tasks: s.tasks ?? {} }
}

/**
 * Registra los comentarios nuevos (id > lastId). Devuelve los pings a contestar y
 * el estado con las tareas nuevas en cola ('pending') o marcadas 'duplicate'.
 */
export function ingest(state, comments, now) {
  const next = { lastId: state.lastId, tasks: { ...state.tasks } }
  const pings = []
  for (const c of [...comments].sort((a, b) => a.id - b.id)) {
    if (c.id <= state.lastId) continue
    next.lastId = c.id
    const kind = classify(c)
    if (kind === 'ping') pings.push(c)
    if (kind !== 'task') continue
    const hash = taskHash(c.body)
    const twin = Object.entries(next.tasks).find(
      ([, t]) => t.hash === hash && (t.status === 'pending' || t.status === 'running' || (t.status === 'done' && now - (t.finishedAt ?? 0) < DEDUP_WINDOW_MS)),
    )
    next.tasks[c.id] = twin
      ? { hash, status: 'duplicate', of: Number(twin[0]), attempts: 0, url: c.html_url, finishedAt: now }
      : { hash, status: 'pending', attempts: 0, url: c.html_url, nextAt: now }
  }
  return { state: next, pings }
}

/** La siguiente tarea a correr (la más vieja que ya toca), o null. Una sola a la vez. */
export function nextTask(state, now) {
  const ready = Object.entries(state.tasks)
    .filter(([, t]) => t.status === 'pending' && (t.nextAt ?? 0) <= now)
    .sort(([a], [b]) => Number(a) - Number(b))
  return ready.length ? Number(ready[0][0]) : null
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
