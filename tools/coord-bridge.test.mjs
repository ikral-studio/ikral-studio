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
  WORKSPACES,
  askedWorkspace,
  workspaceOf,
  MAX_RELAYS,
  enqueueRelay,
  parseReview,
  parseTurn,
  relayDecision,
  wantsRelays,
  pauseLetsRelays,
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

describe('carpeta de trabajo (workspace)', () => {
  it('sin línea WORKSPACE → IKRAL Studio (tareas viejas siguen igual)', () => {
    expect(workspaceOf('[COORD-TASK] Fase 3a\nhaz algo del PANEL y de ikral-memoria')).toBe('studio')
    expect(askedWorkspace('[COORD-TASK] nada')).toBeNull()
  })
  it('«WORKSPACE: panel» y sus alias → Panel', () => {
    for (const b of ['WORKSPACE: panel', 'COORD-WORKSPACE: PANEL', '**WORKSPACE:** ikral-memoria', '- workspace: memoria', '`WORKSPACE: panel`'])
      expect(workspaceOf(`[COORD-TASK] prueba\n${b}\nlee un archivo`)).toBe('panel')
    expect(workspaceOf('[COORD-TASK] x\nWORKSPACE: studio')).toBe('studio')
  })
  it('no acepta rutas ni claves fuera de la lista', () => {
    for (const b of ['WORKSPACE: /etc', 'WORKSPACE: ../ikral-studio-codex', 'WORKSPACE: ~/Documents', 'WORKSPACE: sin-cebolla', 'WORKSPACE: constructor', 'WORKSPACE: __proto__', 'WORKSPACE:'])
      expect(workspaceOf(`[COORD-TASK] x\n${b}`)).toBeNull()
  })
  it('la lista cerrada solo tiene Studio y Panel, con rutas fijas', () => {
    expect(Object.keys(WORKSPACES)).toEqual(['studio', 'panel'])
    expect(WORKSPACES.panel.path).toEqual(['Documents', 'ikral-memoria'])
    expect(WORKSPACES.studio.path).toEqual(['Documents', 'editor de storiborad', 'ikral-studio'])
  })
  it('ingest guarda el workspace; una clave mala queda «invalid» y no entra a la cola', () => {
    const comments = [gpt(1, '[COORD-TASK] a\nWORKSPACE: panel'), gpt(2, '[COORD-TASK] b'), gpt(3, '[COORD-TASK] c\nWORKSPACE: /tmp')]
    const { state } = ingest(normalizeState({ lastId: 0 }), comments, 5)
    expect(state.tasks[1]).toMatchObject({ status: 'pending', workspace: 'panel' })
    expect(state.tasks[2]).toMatchObject({ status: 'pending', workspace: 'studio' })
    expect(state.tasks[3]).toMatchObject({ status: 'invalid', asked: '/tmp' })
    expect(nextTask({ ...state, tasks: { 3: state.tasks[3] } }, 10)).toBeNull()
    expect(prune(state, 5 + 31 * DEDUP_WINDOW_MS).tasks[3]).toBeUndefined()
  })
})

describe('relevos de Kraken', () => {
  const kyo = (id, body) => ({ ...gpt(id, body), performed_via_github_app: null })
  const ok = { ok: true }

  it('Kyo solo inicia tareas con «KRAKEN: relevos»; ChatGPT igual que antes', () => {
    expect(wantsRelays('[COORD-TASK] x\nKRAKEN: relevos')).toBe(true)
    expect(classify(kyo(1, '[COORD-TASK] x\nKRAKEN: relevos'))).toBe('task')
    expect(classify(kyo(1, '[COORD-TASK] x'))).toBeNull()
    expect(classify(kyo(1, 'COORD-PING\nKRAKEN: relevos'))).toBeNull()
    expect(classify({ ...kyo(1, '[COORD-TASK] KRAKEN: relevos'), user: { login: 'otro' } })).toBeNull()
    expect(classify(kyo(1, `[COORD-TASK]\nKRAKEN: relevos ${MARK}`))).toBeNull()
    const { state } = ingest({ lastId: 0, tasks: {}, chain: {} }, [kyo(5, '[COORD-TASK] a\nKRAKEN: relevos'), gpt(6, '[COORD-TASK] b')], T0)
    expect(state.tasks[5].relays).toBe(true)
    expect(state.tasks[6].relays).toBeUndefined()
  })

  it('el árbitro solo para por la lista cerrada de Kyo', () => {
    expect(parseTurn('hecho\nNECESITA-KYO: publicar · subir a ikral.com').needsKyo).toEqual({ topic: 'publicar', why: 'subir a ikral.com' })
    const tech = parseTurn('NECESITA-KYO: nombre-variable · ¿blob o _blob?\nDECISIÓN: quité blob | no se usa | git revert')
    expect(tech.needsKyo).toBeNull()
    expect(tech.offList).toBe('nombre-variable')
    expect(tech.decisions).toEqual(['quité blob | no se usa | git revert'])
  })

  it('Codex: veredictos válidos o «invalido»', () => {
    expect(parseReview('{"veredicto":"siguiente","observaciones":["falta punto 2"],"siguiente_paso":"punto 2"}')).toEqual({ verdict: 'siguiente', notes: ['falta punto 2'], next: 'punto 2' })
    expect(parseReview('nada').verdict).toBe('invalido')
    expect(parseReview('{"veredicto":"publicar"}').verdict).toBe('invalido')
  })

  it('Kraken decide: terminar, otro relevo, Kyo o tope', () => {
    const t = parseTurn('')
    expect(relayDecision({ turn: t, review: parseReview({ veredicto: 'terminado' }), checks: ok, n: 1 }).action).toBe('done')
    expect(relayDecision({ turn: t, review: parseReview({ veredicto: 'siguiente' }), checks: ok, n: 1 }).action).toBe('relay')
    expect(relayDecision({ turn: t, review: parseReview({ veredicto: 'terminado' }), checks: { ok: false, why: 'build' }, n: 2 }).action).toBe('relay')
    expect(relayDecision({ turn: t, review: parseReview({ veredicto: 'corregir' }), checks: ok, n: MAX_RELAYS }).action).toBe('limit')
    expect(relayDecision({ turn: parseTurn('NECESITA-KYO: dinero · API'), review: null, checks: ok, n: 1 }).action).toBe('kyo')
    expect(relayDecision({ turn: t, review: parseReview({ veredicto: 'kyo', observaciones: ['canon'] }), checks: ok, n: 1 }).action).toBe('kyo')
  })

  it('el relevo va primero en la cola (termina lo empezado) y con clave de texto', () => {
    const s = enqueueRelay({ lastId: 9, tasks: {}, chain: {} }, 9, 2, { notes: ['x'] }, T0)
    expect(s.tasks['relevo-9-2']).toMatchObject({ kind: 'relay', root: '9', n: 2, status: 'pending' })
    expect(nextTask({ ...s, tasks: { ...s.tasks, 'etapa-5a': { kind: 'stage', status: 'pending', nextAt: 0 } } }, T0)).toBe('relevo-9-2')
    expect(nextTask({ ...s, tasks: { ...s.tasks, 12: { status: 'pending', nextAt: 0 } } }, T0)).toBe('relevo-9-2') // termina lo empezado primero
  })

  it('con PAUSA solo corren los relevos; «TOTAL» detiene todo', () => {
    const tasks = { 3: { status: 'pending', nextAt: 0 }, 'etapa-5a': { kind: 'stage', status: 'pending', nextAt: 0 }, 7: { status: 'pending', nextAt: 0, relays: true } }
    expect(nextTask({ tasks }, T0)).toBe(3)
    expect(nextTask({ tasks }, T0, { onlyRelays: true })).toBe(7)
    expect(nextTask({ tasks: { 3: tasks[3], 'etapa-5a': tasks['etapa-5a'] } }, T0, { onlyRelays: true })).toBeNull()
    expect(pauseLetsRelays('')).toBe(true)
    expect(pauseLetsRelays('pausa 26 oct')).toBe(true)
    expect(pauseLetsRelays('TOTAL')).toBe(false)
    expect(pauseLetsRelays('pausa total por Kyo')).toBe(false)
  })
})
