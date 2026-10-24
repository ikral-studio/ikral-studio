import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  DEDUP_WINDOW_MS,
  MARK,
  MAX_ATTEMPTS,
  RETRY_DELAY_MS,
  afterAttempt,
  chainRange,
  chainStep,
  classify,
  closedStages,
  ingest,
  nextStage,
  nextTask,
  normalizeState,
  pidAlive,
  planStages,
  prune,
  recoverRunning,
  vitestSummary,
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
    expect(s).toEqual({ lastId: 5, tasks: {}, chain: {} })
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

describe('encadenamiento del plan maestro', () => {
  const plan = readFileSync(join(process.cwd(), 'docs', 'plan-maestro-ikral-studio.md'), 'utf8')
  const stages = ['3a', '3b', '3c', '3d', '3e', '4']
  const range = { from: '3a', to: '4' }
  const empty = { lastId: 0, tasks: {}, chain: {} }

  it('lee las etapas del plan real: sub-etapas de la Fase 3 y la Fase 4 entera', () => {
    const got = planStages(plan)
    expect(got.slice(got.indexOf('3a'), got.indexOf('4') + 1)).toEqual(stages)
  })

  it('solo encadena si el plan lo autoriza con su línea', () => {
    expect(chainRange('nada')).toBeNull()
    expect(chainRange('x\nEncadenamiento autorizado: 3a → 4 (sin publicar)\n')).toEqual(range)
    expect(chainRange('Encadenamiento autorizado: **3b -> 3e**')).toEqual({ from: '3b', to: '3e' })
    expect(chainStep(empty, { stages, range: null, closed: new Set() }, T0).action).toBe('idle')
  })

  it('cerrada = commit «Fase X …»; los «(parcial)» no cuentan', () => {
    const c = closedStages(['Fase 3a revisión con GPT', 'Fase 3b (parcial) avance', 'Puente: algo', 'Fase 2d cobertura'])
    expect([...c].sort()).toEqual(['2d', '3a'])
    expect(nextStage(stages, range, c)).toBe('3b')
    expect(nextStage(stages, range, new Set(stages))).toBeNull()
  })

  it('pone en cola la siguiente etapa sin repetir las cerradas, y solo con la cola vacía', () => {
    const r = chainStep(empty, { stages, range, closed: new Set(['3a']) }, T0)
    expect(r).toMatchObject({ action: 'run', stage: '3b' })
    expect(r.state.tasks['etapa-3b']).toMatchObject({ kind: 'stage', status: 'pending', attempts: 0 })
    expect(nextTask(r.state, T0)).toBe('etapa-3b')
    // Ya hay algo en cola: no se agrega otra (nunca dos a la vez).
    expect(chainStep(r.state, { stages, range, closed: new Set(['3a']) }, T0).action).toBe('idle')
    expect(chainStep(empty, { stages, range, closed: new Set(stages) }, T0).action).toBe('finished')
  })

  it('las tareas de ChatGPT van antes que las etapas', () => {
    const s = { tasks: { 'etapa-3b': { status: 'pending', nextAt: 0 }, 50: { status: 'pending', nextAt: 0 } } }
    expect(nextTask(s, T0)).toBe(50)
  })

  it('una etapa que falla 2 veces detiene la cadena; COORD-CADENA-SIGUE la reanuda', () => {
    const failed = { ...empty, tasks: { 'etapa-3b': { kind: 'stage', stage: '3b', status: 'failed', attempts: 2 } } }
    // Aunque tenga commit de cierre, si falló la cadena no avanza a la 3c.
    expect(chainStep(failed, { stages, range, closed: new Set(['3a', '3b']) }, T0)).toMatchObject({ action: 'stopped', stage: '3b' })
    const { state, controls } = ingest(failed, [gpt(10, 'COORD-CADENA-SIGUE')], T0)
    expect(controls).toEqual([{ id: 10, kind: 'chain-resume' }])
    expect(state.tasks['etapa-3b']).toBeUndefined()
    expect(chainStep(state, { stages, range, closed: new Set(['3a']) }, T0)).toMatchObject({ action: 'run', stage: '3b' })
  })

  it('COORD-CADENA-PAUSA detiene la cadena sin tocar las tareas de ChatGPT', () => {
    const { state, controls } = ingest(empty, [gpt(3, 'COORD-CADENA-PAUSA'), gpt(4, '[COORD-TASK] x')], T0)
    expect(controls.map((c) => c.kind)).toEqual(['chain-pause'])
    expect(state.chain.paused).toBe(true)
    expect(nextTask(state, T0)).toBe(4)
    state.tasks[4].status = 'done'
    expect(chainStep(state, { stages, range, closed: new Set() }, T0).action).toBe('idle')
  })

  it('lee el resumen de vitest', () => {
    expect(vitestSummary(' Tests  139 passed (139)')).toEqual({ failed: 0, passed: 139, total: 139 })
    expect(vitestSummary(' Tests  2 failed | 137 passed (139)')).toEqual({ failed: 2, passed: 137, total: 139 })
    expect(vitestSummary('nada')).toBeNull()
  })
})
