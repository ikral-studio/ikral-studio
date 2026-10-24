import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  STALE_MS,
  STALL_MS,
  ago,
  buildView,
  commentAuthor,
  computeStatus,
  inspectProcesses,
  isStale,
  parseEtime,
  parseRegistry,
  projectView,
  renderDashboard,
  renderHtml,
  resolveInside,
  sanitize,
  stageList,
  stageTitles,
  statusPayload,
} from './coord-monitor-core.mjs'
import { logEvent, readStatusFile, writeMonitor } from './coord-monitor.mjs'

const NOW = 1_800_000_000_000
const plan = { stages: ['1', '2a', '3a', '3b', '3c', '4'], range: { from: '3a', to: '4' }, closed: new Set(['1', '2a', '3a', '3b']), titles: { '3c': 'En personajes y Biblia' } }
const running = (extra = {}) => ({ tasks: { 'etapa-3c': { kind: 'stage', stage: '3c', status: 'running', attempts: 0, startedAt: NOW - 60_000, ...extra } }, chain: {} })
const base = (over = {}) => ({ state: { tasks: {}, chain: {} }, pauseFile: false, lockAlive: false, procs: { claude: null, tests: false, build: false }, plan, git: { commits: [], lastChangeAt: null }, events: [], ...over })

describe('monitor: indicador con señales reales', () => {
  it('Trabajando solo si hay tarea corriendo y su proceso vive (launchd activo no basta)', () => {
    const w = computeStatus(base({ state: running(), lockAlive: true, procs: { claude: { since: NOW - 50_000 }, tests: false, build: false } }), NOW)
    expect(w.code).toBe('working')
    expect(w.task.name).toBe('Etapa 3c · En personajes y Biblia')
    expect(w.detail).toMatch(/Claude Code está trabajando/)
    // Tarea marcada «running» pero su proceso murió: no se finge actividad.
    expect(computeStatus(base({ state: running(), lockAlive: false }), NOW).code).toBe('error')
    // Sin tarea corriendo no es «Trabajando» aunque el puente esté vivo.
    expect(computeStatus(base({ lockAlive: true, plan: { ...plan, range: null } }), NOW).code).toBe('idle')
  })

  it('distingue arrancando, pruebas y la comprobación del puente', () => {
    const r = (o) => computeStatus(base({ state: running(), lockAlive: true, ...o }), NOW).detail
    expect(r({})).toMatch(/arrancando/)
    expect(r({ procs: { claude: { since: NOW }, tests: true, build: false } })).toMatch(/pruebas/)
    expect(r({ events: [{ type: 'task-end', ok: true, at: NOW - 1000 }] })).toMatch(/el puente comprueba/)
  })

  it('avisa «sin avances nuevos» cuando corre sin señales durante mucho tiempo', () => {
    const since = NOW - STALL_MS - 5 * 60_000
    const snap = (o) => base({ state: running({ startedAt: since }), lockAlive: true, procs: { claude: { since }, tests: false, build: false }, ...o })
    const quiet = computeStatus(snap({}), NOW)
    expect(quiet.progress.stalled).toBe(true)
    expect(quiet.detail).toMatch(/Sin avances nuevos/)
    const busy = computeStatus(snap({ git: { commits: [{ at: NOW - 60_000 }], lastChangeAt: null } }), NOW)
    expect(busy.progress.stalled).toBe(false)
    expect(busy.progress.lastProgressAt).toBe(NOW - 60_000)
  })

  it('Pausado, Error, En cola, Esperando aprobación y Sin tareas', () => {
    expect(computeStatus(base({ pauseFile: true }), NOW).code).toBe('paused')
    expect(computeStatus(base({ state: { tasks: {}, chain: { paused: true } } }), NOW).code).toBe('paused')
    const failed = { tasks: { 'etapa-3c': { kind: 'stage', stage: '3c', status: 'failed', finishedAt: NOW } }, chain: {} }
    expect(computeStatus(base({ state: failed }), NOW).code).toBe('error')
    const retry = computeStatus(base({ state: { tasks: { 9: { status: 'pending', nextAt: NOW + 600_000, title: 'Monitor' } }, chain: {} } }), NOW)
    expect(retry.code).toBe('queued')
    expect(retry.detail).toMatch(/Reintento/)
    // La cadena tiene la siguiente etapa lista: «En cola», no «Sin tareas».
    const chain = computeStatus(base(), NOW)
    expect(chain.code).toBe('queued')
    expect(chain.task.stage).toBe('3c')
    const all = { ...plan, closed: new Set(['1', '2a', '3a', '3b', '3c', '4']) }
    expect(computeStatus(base({ plan: all }), NOW).code).toBe('approval')
    expect(computeStatus(base({ plan: { ...plan, range: null } }), NOW).code).toBe('idle')
  })

  it('una tarea que falló y luego otra salió bien ya no marca Error', () => {
    const tasks = { 1: { status: 'failed', finishedAt: NOW - 1000 }, 2: { status: 'done', finishedAt: NOW } }
    expect(computeStatus(base({ state: { tasks, chain: {} }, plan: { ...plan, range: null } }), NOW).code).toBe('idle')
  })
})

describe('monitor: procesos', () => {
  it('lee ps y solo mira lo que cuelga del puente', () => {
    expect(parseEtime('05:07')).toBe(307)
    expect(parseEtime('1-02:03:04')).toBe(93784)
    const ps = [
      '  100     1   10:00 /usr/local/bin/node coord-bridge.mjs',
      '  200   100   09:00 claude -p Eres Claude Code',
      '  300   200   00:30 node /x/node_modules/.bin/vitest run',
      '  400     1   20:00 claude --resume',
      '  500   400   01:00 vite build',
    ].join('\n')
    const p = inspectProcesses(ps, 100, NOW)
    expect(p.claude).toEqual({ since: NOW - 540_000 })
    expect(p.tests).toBe(true)
    expect(p.build).toBe(false) // la compilación es de otra ventana de Claude, no del puente
    // La shell que solo menciona «vitest» no cuenta como pruebas corriendo.
    expect(inspectProcesses('  100 1 10:00 node b\n  700 100 00:05 /bin/zsh -c cd x && npx vitest run', 100, NOW).tests).toBe(false)
    expect(inspectProcesses(ps, null, NOW)).toEqual({ claude: null, tests: false, build: false })
  })
})

describe('monitor: privacidad', () => {
  it('sanitize quita rutas, archivos, comandos, enlaces, llaves y correos', () => {
    const t = sanitize('Fase 3c: usa `npm run build` en /Users/kyo/secreto/x.ts y ~/Library/Logs/ikral-coord.log ghp_abcdefghijklmnopqrstuvwxyz0123 a@b.com https://x.y/z `shot-preview`')
    for (const bad of ['npm run', '/Users', 'kyo', 'x.ts', 'Library', 'ikral-coord.log', 'ghp_', 'a@b.com', 'https']) expect(t).not.toContain(bad)
    expect(t).toContain('Fase 3c')
    expect(t).toContain('shot-preview')
    expect(sanitize('**Monitor** visual <!-- chatgpt-coord -->')).toBe('Monitor visual')
    expect(sanitize('a'.repeat(300)).length).toBeLessThanOrEqual(110)
  })

  it('reconoce quién escribió por sus marcas', () => {
    expect(commentAuthor('hola <!-- chatgpt-coord -->')).toBe('ChatGPT')
    expect(commentAuthor('✅ Puente: etapa <!-- claude -->')).toBe('Puente')
    expect(commentAuthor('**Fase 3b cerrada** <!-- claude -->')).toBe('Claude')
    expect(commentAuthor('ok')).toBe('Director')
  })

  it('la página no contiene comandos, rutas ni textos crudos', () => {
    const snap = base({
      state: running(),
      lockAlive: true,
      procs: { claude: { since: NOW }, tests: false, build: false },
      events: [{ type: 'task-end', ok: false, why: 'falló en /Users/kyo/x.mjs con sk-secretsecretsecret', at: NOW - 5 }],
      git: { commits: [{ at: NOW - 10, subject: 'Fase 3c parcial: toca src/secreto.ts' }], dirty: 2, lastChangeAt: NOW - 20 },
      github: { ok: true, at: NOW, comments: [{ who: 'ChatGPT', at: NOW - 30, title: '<script>alert(1)</script> ver /Users/kyo' }] },
    })
    const html = renderHtml(buildView(snap, NOW))
    for (const bad of ['/Users', 'x.mjs', 'sk-secret', 'secreto.ts', '<script>alert']) expect(html).not.toContain(bad)
    expect(html).toContain('Trabajando')
    expect(html).toContain('2 archivo(s) con cambios')
  })
})

describe('monitor: latido y actualización', () => {
  it('estado viejo → Sin señal (la misma función corre en la página)', () => {
    expect(isStale(NOW - STALE_MS - 1, NOW, STALE_MS)).toBe(true)
    expect(isStale(NOW - 45_000, NOW, STALE_MS)).toBe(false)
    expect(ago(30_000)).toBe('hace 30 s')
    expect(ago(5 * 60_000)).toBe('hace 5 min')
    const html = renderHtml(buildView(base(), NOW))
    expect(html).toContain('http-equiv="refresh"')
    expect(html).toContain(`data-gen="${NOW}"`)
    expect(html).toContain('Sin señal')
  })

  it('fases: cerradas, en curso y siguiente', () => {
    const l = stageList(plan, '3c')
    expect(l.find((x) => x.id === '3b').state).toBe('closed')
    expect(l.find((x) => x.id === '3c').state).toBe('current')
    expect(l.find((x) => x.id === '4').state).toBe('later')
    expect(stageList(plan, null).find((x) => x.id === '3c').state).toBe('next')
    expect(stageTitles('## Fase 4 · Biblia PDF\n- **3c.** En personajes y Biblia.\n')).toEqual({ 4: 'Biblia PDF', '3c': 'En personajes y Biblia' })
  })

  it('writeMonitor reescribe la página con el estado del disco y anota pruebas vistas', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mon-'))
    writeFileSync(join(dir, 'state.json'), JSON.stringify({ lastId: 1, ...running() }))
    writeFileSync(join(dir, 'lock.pid'), String(process.pid))
    const opts = { stateDir: dir, workdir: dir, pauseFile: join(dir, 'no-pausa'), github: false, now: NOW }
    const ps = `${process.pid} 1 10:00 node coord-bridge.mjs\n9999 ${process.pid} 05:00 claude -p x\n9998 9999 00:10 vitest run`
    const v1 = writeMonitor({ ...opts, ps })
    expect(v1.status).toBe('working')
    expect(readFileSync(join(dir, 'monitor.html'), 'utf8')).toContain('Trabajando')
    const v2 = writeMonitor({ ...opts, ps: `${process.pid} 1 10:00 node coord-bridge.mjs` })
    expect(v2.status).toBe('working')
    const events = readFileSync(join(dir, 'events.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l).type)
    expect(events).toEqual(['tests-start', 'tests-end'])
    logEvent(dir, { type: 'error' })
    expect(writeMonitor({ ...opts, stateDir: join(dir, 'no-existe') })).toBeNull()
  })
})

describe('monitor: varios proyectos', () => {
  const HOME = '/casa'
  const ROOT = '/casa/Library/Application Support'
  const src = { type: 'github-issue', repo: 'ikral-studio/coordinacion', issue: 1 }
  const reg = (projects) => parseRegistry({ projects }, { home: HOME, root: ROOT })
  const ownView = () => buildView(base({ state: running(), lockAlive: true, procs: { claude: { since: NOW }, tests: false, build: false } }), NOW)

  it('registro: valida ids, expande ~ y rechaza carpetas fuera de la zona del monitor', () => {
    const r = reg([
      { id: 'ikral-studio', name: 'IKRAL Studio', source: src, statusDir: '~/Library/Application Support/ikral-coord' },
      { id: 'plancha-hotel', name: 'Plancha Hotel', statusDir: null },
      { id: 'otro', name: 'Otro', statusDir: '~/Documents/otro-repo' },
      { id: 'escapa', name: 'Escapa', statusDir: '~/Library/Application Support/../../Documents/x' },
      { id: 'Mal Id', name: 'x' },
      { id: 'plancha-hotel', name: 'repetido' },
    ])
    expect(r.projects.map((p) => p.id)).toEqual(['ikral-studio', 'plancha-hotel', 'otro', 'escapa'])
    expect(r.errors).toHaveLength(2)
    expect(r.projects[0].statusDir).toBe('/casa/Library/Application Support/ikral-coord')
    expect(r.projects[2].problem).toMatch(/zona permitida/)
    expect(r.projects[3].problem).toMatch(/zona permitida/)
    expect(resolveInside('relativa/x', HOME, ROOT)).toBeNull()
  })

  it('sin puente o sin datos → «No conectado», nunca actividad', () => {
    const [sinPuente, sinDatos] = reg([
      { id: 'plancha-hotel', name: 'Plancha Hotel', statusDir: null },
      { id: 'plancha-restaurante', name: 'Plancha Restaurante', statusDir: '~/Library/Application Support/plancha' },
    ]).projects
    for (const v of [projectView(sinPuente, null, NOW), projectView(sinDatos, null, NOW)]) {
      expect(v.status).toBe('disconnected')
      expect(v.connected).toBe(false)
      expect(v.task).toBeNull()
      expect(v.timeline).toEqual([])
    }
    const html = renderDashboard([{ project: sinPuente, view: projectView(sinPuente, null, NOW) }], NOW)
    expect(html).toContain('No conectado')
    expect(html).not.toContain('Trabajando')
  })

  it('origen verificable: datos de otro proyecto, dañados o sin fecha no se muestran', () => {
    const [p] = reg([{ id: 'ikral-studio', name: 'IKRAL Studio', source: src, statusDir: '~/Library/Application Support/ikral-coord' }]).projects
    const good = statusPayload(p, ownView())
    expect(projectView(p, JSON.stringify(good), NOW).status).toBe('working')
    expect(projectView(p, { ...good, project: 'plancha-hotel' }, NOW).detail).toMatch(/origen no coincide/)
    expect(projectView(p, { ...good, source: { ...src, issue: 2 } }, NOW).status).toBe('error')
    expect(projectView(p, '{roto', NOW).status).toBe('error')
    expect(projectView(p, { ...good, format: 'otro' }, NOW).status).toBe('error')
    expect(projectView(p, { ...good, generatedAt: undefined }, NOW).status).toBe('error')
    // Un puente no puede mandar «Sin señal» ni «No conectado» por su cuenta, ni estados inventados.
    expect(projectView(p, { ...good, status: 'disconnected' }, NOW).status).toBe('error')
    expect(projectView(p, { ...good, status: 'fiesta' }, NOW).status).toBe('error')
  })

  it('datos viejos → Sin señal por proyecto, sin tocar a los demás', () => {
    const [a, b] = reg([
      { id: 'ikral-studio', name: 'IKRAL Studio', source: src, statusDir: '~/Library/Application Support/a' },
      { id: 'plancha-hotel', name: 'Plancha Hotel', statusDir: '~/Library/Application Support/b' },
    ]).projects
    const va = projectView(a, statusPayload(a, ownView()), NOW)
    const vb = projectView(b, statusPayload(b, { ...ownView(), generatedAt: NOW - STALE_MS - 1 }), NOW)
    expect(va.stale).toBe(false)
    expect(vb.stale).toBe(true)
    const html = renderDashboard([{ project: a, view: va }, { project: b, view: vb }], NOW)
    expect(html).toContain('class="proj stale" id="s-plancha-hotel"')
    expect(html).toContain('class="proj" id="s-ikral-studio"')
    expect(html).toContain('href="#p-plancha-hotel"')
  })

  it('privacidad: un status.json ajeno con rutas, secretos y HTML sale limpio', () => {
    const [p] = reg([{ id: 'plancha-hotel', name: 'Plancha Hotel', statusDir: '~/Library/Application Support/b' }]).projects
    const evil = {
      format: 'ikral-monitor/1',
      project: 'plancha-hotel',
      source: null,
      generatedAt: NOW,
      status: 'working',
      detail: 'corre `npm run build` en /Users/kyo/plancha/secreto.ts con sk-abcdefabcdefabcdef',
      task: { name: '<img src=x onerror=alert(1)> ~/Documents/plancha' },
      timeline: [{ at: NOW, text: 'ghp_abcdefghijklmnopqrstuvwxyz0123 a@b.com' }],
      stages: [{ id: '<b>', state: 'closed' }, { id: '1', state: 'closed', title: '/Users/kyo/x' }],
      github: { ok: true, at: NOW, comments: [{ who: '<script>', at: NOW, title: 'https://x.y/z' }] },
      statusDir: '/Users/kyo/secreto',
    }
    const html = renderDashboard([{ project: p, view: projectView(p, evil, NOW) }], NOW)
    for (const bad of ['/Users', 'kyo', 'secreto', 'sk-abc', 'npm run', 'ghp_', 'a@b.com', 'https://x', '<img', '&lt;b&gt;', 'Documents']) expect(html).not.toContain(bad)
    expect(html.split('<script>')).toHaveLength(2) // solo el script propio de la página
    expect(html).toContain('Trabajando')
  })

  it('writeMonitor: guarda status.json propio y una sola página con todos los proyectos', () => {
    const home = mkdtempSync(join(tmpdir(), 'home-'))
    const root = join(home, 'Library', 'Application Support')
    const own = join(root, 'ikral-coord')
    const other = join(root, 'plancha-coord')
    mkdirSync(own, { recursive: true })
    mkdirSync(other, { recursive: true })
    const outside = join(home, 'Documents', 'otro-repo')
    mkdirSync(outside, { recursive: true })
    writeFileSync(join(outside, 'status.json'), JSON.stringify({ format: 'ikral-monitor/1', project: 'fuera', source: null, generatedAt: NOW, status: 'working', detail: 'NO DEBE VERSE' }))
    writeFileSync(join(other, 'status.json'), JSON.stringify({ format: 'ikral-monitor/1', project: 'plancha-restaurante', source: null, generatedAt: NOW - 60_000, status: 'queued', detail: 'Pedido en cola' }))
    const registry = {
      projects: [
        { id: 'ikral-studio', name: 'IKRAL Studio', source: src, statusDir: '~/Library/Application Support/ikral-coord' },
        { id: 'plancha-restaurante', name: 'Plancha Restaurante', statusDir: '~/Library/Application Support/plancha-coord' },
        { id: 'plancha-hotel', name: 'Plancha Hotel', statusDir: null },
        { id: 'fuera', name: 'Fuera', statusDir: '~/Documents/otro-repo' },
      ],
    }
    writeFileSync(join(own, 'state.json'), JSON.stringify({ lastId: 1, ...running() }))
    writeFileSync(join(own, 'lock.pid'), String(process.pid))
    const ps = `${process.pid} 1 10:00 node coord-bridge.mjs\n9999 ${process.pid} 05:00 claude -p x`
    const v = writeMonitor({ stateDir: own, workdir: own, pauseFile: join(own, 'no'), github: false, now: NOW, ps, home, monitorRoot: root, registry })
    expect(v.status).toBe('working')
    const status = JSON.parse(readFileSync(join(own, 'status.json'), 'utf8'))
    expect(status).toMatchObject({ format: 'ikral-monitor/1', project: 'ikral-studio', status: 'working' })
    const html = readFileSync(join(own, 'monitor.html'), 'utf8')
    expect(html).toContain('IKRAL Studio')
    expect(html).toContain('Pedido en cola')
    expect(html).toContain('No conectado')
    expect(html).toContain('zona permitida')
    expect(html).not.toContain('NO DEBE VERSE')
    expect(html).not.toContain(home)
    // Un enlace simbólico en lugar de status.json no se sigue.
    writeFileSync(join(outside, 'x.json'), '{"secreto":1}')
    rmSync(join(other, 'status.json'))
    symlinkSync(join(outside, 'status.json'), join(other, 'status.json'))
    expect(readStatusFile(other)).toBe('{}')
    rmSync(join(other, 'status.json'))
    expect(readStatusFile(other)).toBeNull()
  })

  it('sin registro legible sigue enseñando el proyecto propio', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mon-'))
    const v = writeMonitor({ stateDir: dir, workdir: dir, pauseFile: join(dir, 'no'), github: false, now: NOW, ps: '' })
    expect(v).not.toBeNull()
    expect(readFileSync(join(dir, 'monitor.html'), 'utf8')).toContain('IKRAL Studio')
  })

  it('el registro real del repo es válido y solo IKRAL Studio tiene puente', () => {
    const data = JSON.parse(readFileSync(join(process.cwd(), 'tools', 'monitor-projects.json'), 'utf8'))
    const r = parseRegistry(data, { home: HOME, root: ROOT })
    expect(r.errors).toEqual([])
    expect(r.projects.filter((p) => p.statusDir).map((p) => p.id)).toEqual(['ikral-studio'])
    expect(r.projects.every((p) => !p.problem)).toBe(true)
  })
})
