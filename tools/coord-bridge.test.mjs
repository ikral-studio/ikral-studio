import { describe, expect, it } from 'vitest'
import {
  DEDUP_WINDOW_MS,
  MARK,
  MAX_ATTEMPTS,
  RETRY_DELAY_MS,
  afterAttempt,
  classify,
  ingest,
  nextTask,
  normalizeState,
  pidAlive,
  prune,
  recoverRunning,
} from './coord-bridge-core.mjs'

const gpt = (id, body) => ({
  id,
  body,
  html_url: `https://x/${id}`,
  user: { login: 'nahya-bi' },
  performed_via_github_app: { slug: 'chatgpt-codex-connector' },
})
const T0 = 1_000_000

describe('puente de coordinación', () => {
  it('solo hace caso a ChatGPT y nunca a sus propias respuestas', () => {
    expect(classify(gpt(1, 'COORD-PING'))).toBe('ping')
    expect(classify(gpt(1, '### [COORD-TASK] algo'))).toBe('task')
    expect(classify(gpt(1, `[COORD-TASK] ${MARK}`))).toBeNull()
    expect(classify({ ...gpt(1, '[COORD-TASK]'), performed_via_github_app: null })).toBeNull()
    expect(classify({ ...gpt(1, '[COORD-TASK]'), user: { login: 'otro' } })).toBeNull()
    expect(classify(gpt(1, 'hola'))).toBeNull()
  })

  it('migra el estado viejo y pone en cola solo lo nuevo', () => {
    const s = normalizeState({ lastId: 5 })
    expect(s).toEqual({ lastId: 5, tasks: {} })
    const { state, pings } = ingest(s, [gpt(4, '[COORD-TASK] vieja'), gpt(7, 'COORD-PING'), gpt(6, '[COORD-TASK] nueva')], T0)
    expect(state.lastId).toBe(7)
    expect(Object.keys(state.tasks)).toEqual(['6'])
    expect(pings.map((c) => c.id)).toEqual([7])
  })

  it('el mismo comentario no se procesa dos veces', () => {
    const a = ingest({ lastId: 0, tasks: {} }, [gpt(1, '[COORD-TASK] x')], T0).state
    const b = ingest(a, [gpt(1, '[COORD-TASK] x')], T0)
    expect(b.state).toEqual(a)
  })

  it('una tarea repetida (mismo texto) se marca duplicada; pasado el plazo se acepta', () => {
    let { state } = ingest({ lastId: 0, tasks: {} }, [gpt(1, '[COORD-TASK]  hacer   X'), gpt(2, '[COORD-TASK] hacer X')], T0)
    expect(state.tasks[2]).toMatchObject({ status: 'duplicate', of: 1 })
    state.tasks[1] = afterAttempt(state.tasks[1], true, T0)
    state = ingest(state, [gpt(3, '[COORD-TASK] hacer X')], T0 + DEDUP_WINDOW_MS + 1).state
    expect(state.tasks[3].status).toBe('pending')
  })

  it('corre una sola tarea a la vez, la más vieja primero', () => {
    const { state } = ingest({ lastId: 0, tasks: {} }, [gpt(9, '[COORD-TASK] b'), gpt(8, '[COORD-TASK] a')], T0)
    expect(nextTask(state, T0)).toBe(8)
    state.tasks[8].status = 'running'
    expect(nextTask(state, T0)).toBe(9)
  })

  it('reintenta una vez tras esperar y luego se rinde', () => {
    const t = { hash: 'h', status: 'running', attempts: 0 }
    const r1 = afterAttempt(t, false, T0)
    expect(r1).toMatchObject({ status: 'pending', attempts: 1, nextAt: T0 + RETRY_DELAY_MS })
    expect(nextTask({ tasks: { 1: r1 } }, T0)).toBeNull()
    expect(nextTask({ tasks: { 1: r1 } }, T0 + RETRY_DELAY_MS)).toBe(1)
    const r2 = afterAttempt(r1, false, T0)
    expect(r2).toMatchObject({ status: 'failed', attempts: MAX_ATTEMPTS })
    expect(nextTask({ tasks: { 1: r2 } }, T0 + 10 * RETRY_DELAY_MS)).toBeNull()
  })

  it('una tarea que quedó a medias cuenta como intento fallido', () => {
    const s = recoverRunning({ lastId: 1, tasks: { 1: { status: 'running', attempts: 0 } } }, T0)
    expect(s.tasks[1]).toMatchObject({ status: 'pending', attempts: 1 })
  })

  it('limpia tareas terminadas hace más de 30 días', () => {
    const s = prune({ lastId: 2, tasks: { 1: { status: 'done', finishedAt: 0 }, 2: { status: 'pending' } } }, 31 * DEDUP_WINDOW_MS)
    expect(Object.keys(s.tasks)).toEqual(['2'])
  })

  it('candado: detecta si el proceso dueño sigue vivo', () => {
    expect(pidAlive(process.pid)).toBe(true)
    expect(pidAlive(0)).toBe(false)
    expect(pidAlive(123, () => { throw Object.assign(new Error(), { code: 'ESRCH' }) })).toBe(false)
  })
})
