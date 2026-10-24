import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { STALE_MS } from './coord-monitor-core.mjs'
import { writeMonitor } from './coord-monitor.mjs'
import { APP_NAME, desktopLinkPlan, dockEntry, dockHasApp, infoPlist } from './mini-monitor-app.mjs'
import { LINE_MAX, USAGE_FRESH_MS, USAGE_MAX_AGE_MS, USAGE_SOURCE, USAGE_URL, cleanUsage, countInteractiveClaude, miniCode, miniView, toMs, usageFromStatusline, usageText } from './mini-monitor-core.mjs'
import { saveUsage, unwrapCommand, unwrapSettings, wrapSettings } from './usage-statusline.mjs'

const NOW = Date.parse('2026-10-24T18:00:00Z')
const project = { id: 'ikral-studio', name: 'IKRAL Studio', source: { type: 'github-issue', repo: 'ikral-studio/coordinacion', issue: 1 } }
const view = (o = {}) => ({
  connected: true,
  status: 'working',
  detail: 'Claude Code está trabajando.',
  generatedAt: NOW - 30_000,
  bridgeBeatAt: NOW - 30_000,
  task: { name: 'Tarea de ChatGPT: Mini Monitor' },
  progress: { stalled: false },
  claude: { since: NOW - 600_000 },
  lastSignal: { at: NOW - 60_000, text: 'Commit' },
  timeline: [{ at: NOW - 120_000, text: '📦 Commit: algo' }],
  blueprint: null,
  ...o,
})
const usage = (o = {}) => ({ format: 'ikral-usage/1', source: 'statusline de Claude Code', at: NOW - 60_000, session: { usedPct: 61, resetsAt: NOW + 3_600_000 }, week: { usedPct: 6 }, ...o })

describe('mini monitor: estado', () => {
  it('agrupa los estados del monitor en 4: Trabajando, Esperando, Bloqueado, Sin señal', () => {
    expect(miniCode(view(), NOW)).toBe('working')
    for (const s of ['queued', 'idle', 'paused', 'approval']) expect(miniCode(view({ status: s }), NOW)).toBe('waiting')
    expect(miniCode(view({ status: 'error' }), NOW)).toBe('blocked')
    expect(miniCode(view({ connected: false, status: 'disconnected' }), NOW)).toBe('nosignal')
    expect(miniCode(null, NOW)).toBe('nosignal')
  })

  it('datos viejos nunca dicen «Trabajando»: pasan a «Sin señal»', () => {
    const v = miniView(project, view({ generatedAt: NOW - STALE_MS - 1000 }), NOW)
    expect(v.code).toBe('nosignal')
    expect(v.label).toBe('Sin señal')
    expect(v.ahora).toContain('Sin datos nuevos')
    expect(v.teNecesito).toContain('dormido')
  })

  it('«Ahora» y «Te necesito» caben en 200 caracteres y no enseñan rutas ni comandos', () => {
    const long = `Revisar ${'x'.repeat(400)} en /Users/kyo/secreto.json con npm run test`
    const v = miniView(project, view({ status: 'error', detail: long, task: { name: long } }), NOW)
    expect(v.code).toBe('blocked')
    for (const t of [v.ahora, v.teNecesito, v.speech, v.staleSpeech]) expect(t.length).toBeLessThanOrEqual(LINE_MAX)
    expect(JSON.stringify(v)).not.toContain('/Users/kyo')
    expect(JSON.stringify(v)).not.toContain('npm run')
  })

  it('dice qué necesita del director', () => {
    expect(miniView(project, view({ status: 'approval', task: null, detail: 'Todo cerrado.' }), NOW).teNecesito).toContain('«sí»')
    expect(miniView(project, view(), NOW).teNecesito).toBe('Nada por ahora.')
    const bp = { bloqueos: [{ id: 'P3', titulo: 'x' }, { id: 'P6', titulo: 'y' }] }
    expect(miniView(project, view({ blueprint: bp }), NOW).teNecesito).toContain('2 bloqueo(s)')
  })

  it('trae proyecto, última actividad, enlace al Issue y separa puente de Claude interactivo', () => {
    const v = miniView(project, view(), NOW, { interactiveClaude: 2 })
    expect(v).toMatchObject({ format: 'ikral-mini/1', project: 'IKRAL Studio', link: 'https://github.com/ikral-studio/coordinacion/issues/1', interactiveClaude: 2 })
    expect(v.lastActivity).toEqual({ at: NOW - 60_000, text: 'Commit' })
    expect(v.bridge).toMatchObject({ claudeRunning: true, status: 'Trabajando' })
    expect(v.staleMs).toBe(STALE_MS)
  })

  it('cuenta las ventanas de Claude que no son del puente (sin enseñar comandos)', () => {
    const ps = ['100 1 10:00 node coord-bridge.mjs', '101 100 05:00 claude -p tarea', '200 1 01:00 -zsh', '201 200 00:30 claude', '300 1 00:10 /opt/bin/claude --resume', '400 1 00:10 claudette'].join('\n')
    expect(countInteractiveClaude(ps, 100)).toBe(2)
    expect(countInteractiveClaude(ps, null)).toBe(3)
    expect(countInteractiveClaude('', 100)).toBe(0)
  })
})

describe('mini monitor: cuota de Claude Code', () => {
  it('sin fuente verificable → «Uso no disponible» y enlace para verlo a mano (nunca inventa %)', () => {
    for (const raw of [null, '', 'no es json', {}, usage({ format: 'otro' }), usage({ source: '' }), usage({ session: { usedPct: 140 }, week: null })]) {
      const u = cleanUsage(raw, NOW)
      expect(u.available).toBe(false)
      expect(u.url).toBe(USAGE_URL)
      expect(usageText(u)).toBe('Uso no disponible')
    }
    const v = miniView(project, view(), NOW)
    expect(v.usageText).toBe('Uso no disponible')
    expect(JSON.stringify(v)).not.toMatch(/\d+%/)
  })

  it('un dato del futuro o de hace más de 7 días no se enseña', () => {
    expect(cleanUsage(usage({ at: NOW - USAGE_MAX_AGE_MS - 1 }), NOW).available).toBe(false)
    expect(cleanUsage(usage({ at: NOW + 10 * 60_000 }), NOW).available).toBe(false)
  })

  it('con fuente verificable enseña sesión y semana por separado, y si es reciente', () => {
    const u = cleanUsage(JSON.stringify(usage()), NOW)
    expect(u).toMatchObject({ available: true, fresh: true, session: { usedPct: 61 }, week: { usedPct: 6, resetsAt: null } })
    expect(usageText(u)).toMatch(/^Sesión 61% \(reinicia \d\d:\d\d\) · Semana 6% · leído \d\d:\d\d$/)
  })

  it('lectura antigua: se enseña como «última lectura», hasta su hora de reinicio (no fabrica %)', () => {
    const old = usage({ at: NOW - USAGE_FRESH_MS - 1, week: { usedPct: 6, resetsAt: NOW + 86_400_000 } })
    const u = cleanUsage(old, NOW)
    expect(u).toMatchObject({ available: true, fresh: false, session: { usedPct: 61 } })
    expect(usageText(u)).toContain('última lectura')
    // Pasó el reinicio de la sesión: la sesión desaparece, la semana sigue.
    const after = cleanUsage(old, NOW + 3_600_001)
    expect(after.session).toBe(null)
    expect(after.sessionReset).toBe(true)
    expect(after.week.usedPct).toBe(6)
    // Pasaron las dos: no hay dato y lo dice.
    const both = cleanUsage(old, NOW + 86_400_001)
    expect(both.available).toBe(false)
    expect(usageText(both)).toContain('ya se reinició')
    // Sin hora de reinicio, la sesión no vive más de 5 h.
    expect(cleanUsage(usage({ at: NOW - 5 * 3_600_000 - 1, session: { usedPct: 10 }, week: null }), NOW).available).toBe(false)
  })

  it('cambio de cuenta: si se sabe la cuenta y el dato es de otra, no se enseña', () => {
    expect(cleanUsage(usage({ account: 'A' }), NOW, { account: 'A' }).available).toBe(true)
    const other = cleanUsage(usage({ account: 'B' }), NOW, { account: 'A' })
    expect(other.available).toBe(false)
    expect(usageText(other)).toContain('otra cuenta')
    expect(cleanUsage(usage(), NOW, { account: 'A' }).available).toBe(false)
    expect(cleanUsage(usage({ account: 'B' }), NOW).available).toBe(true)
  })
})

describe('mini monitor: statusLine de Claude Code → usage.json', () => {
  const NOW_S = Math.floor(NOW / 1000)
  const stdin = (o = {}) =>
    JSON.stringify({
      session_id: 'abc-123-sesion',
      transcript_path: '/Users/kyo/.claude/projects/x/abc.jsonl',
      cwd: '/Users/kyo/Documents/secreto',
      version: '2.1.80',
      model: { id: 'claude-opus-5-5', display_name: 'Opus' },
      cost: { total_cost_usd: 1.23 },
      context_window: { used_percentage: 55 },
      rate_limits: { five_hour: { used_percentage: 23.5, resets_at: NOW_S + 3600 }, seven_day: { used_percentage: 41.2, resets_at: NOW_S + 86_400 } },
      ...o,
    })

  it('toma solo rate_limits: % y reinicio (segundos Unix → ms), con fuente y hora', () => {
    const r = usageFromStatusline(stdin(), NOW)
    expect(r).toEqual({ format: 'ikral-usage/1', source: USAGE_SOURCE, at: NOW, version: '2.1.80', session: { usedPct: 23.5, resetsAt: NOW + 3_600_000 }, week: { usedPct: 41.2, resetsAt: NOW + 86_400_000 } })
    expect(toMs('2026-10-24T19:00:00Z')).toBe(NOW + 3_600_000)
    expect(toMs(NOW)).toBe(NOW)
    expect(cleanUsage(r, NOW)).toMatchObject({ available: true, session: { usedPct: 24 }, week: { usedPct: 41 } })
  })

  it('ausencia o JSON malformado → null (no se escribe nada y no se confunde contexto con cuota)', () => {
    for (const raw of ['', 'no es json', '{}', stdin({ rate_limits: undefined }), stdin({ rate_limits: { five_hour: { used_percentage: 'x' } } }), stdin({ rate_limits: { five_hour: { used_percentage: 120 } } })])
      expect(usageFromStatusline(raw, NOW)).toBe(null)
    const one = usageFromStatusline(stdin({ rate_limits: { seven_day: { used_percentage: 5 } } }), NOW)
    expect(one).toMatchObject({ session: null, week: { usedPct: 5, resetsAt: null } })
  })

  it('privacidad: usage.json no guarda rutas, costos, modelo, contexto ni el id de sesión en claro; archivo 600', () => {
    const dir = mkdtempSync(join(tmpdir(), 'usage-'))
    expect(saveUsage(stdin(), { dir, now: NOW, account: undefined })).not.toBe(null)
    const file = join(dir, 'usage.json')
    const text = readFileSync(file, 'utf8')
    for (const bad of ['/Users', 'transcript', 'cwd', 'cost', 'abc-123', 'opus', 'context']) expect(text.toLowerCase()).not.toContain(bad.toLowerCase())
    expect(Object.keys(JSON.parse(text)).sort()).toEqual(['at', 'format', 'session', 'sessionKey', 'source', 'version', 'week'])
    expect(statSync(file).mode & 0o777).toBe(0o600)
  })

  it('nueva sesión: sin rate_limits todavía no borra la lectura buena; con dato nuevo la reemplaza', () => {
    const dir = mkdtempSync(join(tmpdir(), 'usage-'))
    saveUsage(stdin(), { dir, now: NOW })
    expect(saveUsage(stdin({ session_id: 'otra', rate_limits: undefined }), { dir, now: NOW + 1000 })).toBe(null)
    const first = JSON.parse(readFileSync(join(dir, 'usage.json'), 'utf8'))
    expect(first.session.usedPct).toBe(23.5)
    saveUsage(stdin({ session_id: 'otra', rate_limits: { five_hour: { used_percentage: 30, resets_at: NOW_S + 3600 } } }), { dir, now: NOW + 2000 })
    const second = JSON.parse(readFileSync(join(dir, 'usage.json'), 'utf8'))
    expect(second).toMatchObject({ at: NOW + 2000, session: { usedPct: 30 }, week: null })
    expect(second.sessionKey).not.toBe(first.sessionKey)
    expect(saveUsage('basura', { dir: join(dir, 'no', 'existe'), now: NOW })).toBe(null)
  })

  it('encadena el statusLine de antes sin perderlo y se puede quitar (idempotente)', () => {
    const orig = `python3 ~/.claude/contexto.py --x 'a b'`
    const before = { model: 'opus', statusLine: { type: 'command', command: orig, padding: 0 } }
    const { settings, changed } = wrapSettings(before, '/usr/local/bin/node', '/r/tools/usage-statusline.mjs')
    expect(changed).toBe(true)
    expect(settings).toMatchObject({ model: 'opus', statusLine: { type: 'command', padding: 0 } })
    expect(unwrapCommand(settings.statusLine.command)).toBe(orig)
    expect(wrapSettings(settings, '/x', '/y').changed).toBe(false)
    expect(unwrapSettings(settings).settings).toEqual(before)
    expect(unwrapSettings(before).changed).toBe(false)
    const none = wrapSettings({}, '/n', '/r/tools/usage-statusline.mjs').settings
    expect(unwrapCommand(none.statusLine.command)).toBe('')
    expect(unwrapSettings(none).settings).toEqual({})
  })

  it('el script de verdad: pasa el stdin al statusLine de antes, imprime lo mismo y escribe usage.json', () => {
    const dir = mkdtempSync(join(tmpdir(), 'usage-'))
    const out = execFileSync(process.execPath, [join(import.meta.dirname, 'usage-statusline.mjs'), '--chain', `printf 'barra:' && wc -c | tr -d ' '`], {
      input: stdin(),
      env: { ...process.env, IKRAL_COORD_DIR: dir },
    }).toString()
    expect(out).toBe(`barra:${Buffer.byteLength(stdin())}\n`)
    expect(JSON.parse(readFileSync(join(dir, 'usage.json'), 'utf8')).week.usedPct).toBe(41.2)
  })
})

describe('mini monitor: el puente escribe mini.json', () => {
  it('writeMonitor deja mini.json junto a status.json; usage.json solo cuenta si es válido', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mini-'))
    const tasks = { tasks: { 7: { kind: 'comment', status: 'running', startedAt: NOW - 60_000, title: 'Mini Monitor' } } }
    writeFileSync(join(dir, 'state.json'), JSON.stringify({ lastId: 1, ...tasks }))
    writeFileSync(join(dir, 'lock.pid'), String(process.pid))
    const ps = `${process.pid} 1 10:00 node coord-bridge.mjs\n9999 ${process.pid} 05:00 claude -p x\n8000 1 02:00 claude`
    const opts = { stateDir: dir, workdir: dir, pauseFile: join(dir, 'no'), github: false, now: NOW, ps }
    writeMonitor(opts)
    const m = JSON.parse(readFileSync(join(dir, 'mini.json'), 'utf8'))
    expect(m).toMatchObject({ format: 'ikral-mini/1', code: 'working', label: 'Trabajando', interactiveClaude: 1, usageText: 'Uso no disponible' })
    writeFileSync(join(dir, 'usage.json'), JSON.stringify(usage()))
    writeMonitor(opts)
    expect(JSON.parse(readFileSync(join(dir, 'mini.json'), 'utf8')).usage.session.usedPct).toBe(61)
  })
})

describe('mini monitor: app de Mac (instalación sin duplicados)', () => {
  const app = `/Applications/${APP_NAME}.app`

  it('Info.plist es de una app normal con nombre IKRAL Monitor', () => {
    const p = infoPlist()
    expect(p).toContain('<string>IKRAL Monitor</string>')
    expect(p).toContain('com.ikral.monitor')
    expect(p).not.toContain('LSUIElement')
  })

  it('el Dock no se duplica: reconoce la app ya fijada', () => {
    expect(dockEntry(app)).toContain('file:///Applications/IKRAL%20Monitor.app/')
    expect(dockHasApp('( { "tile-data" = { "file-data" = { "_CFURLString" = "file:///Applications/IKRAL%20Monitor.app/"; }; }; } )', app)).toBe(true)
    expect(dockHasApp('( { "_CFURLString" = "file:///Applications/Safari.app/"; } )', app)).toBe(false)
    expect(dockHasApp('', app)).toBe(false)
  })

  it('el acceso del Escritorio no se duplica ni pisa otro archivo', () => {
    const fs = (st, target) => ({
      lstatSync: () => {
        if (!st) throw new Error('no existe')
        return { isSymbolicLink: () => st === 'link' }
      },
      readlinkSync: () => target,
    })
    expect(desktopLinkPlan('/d/IKRAL Monitor', app, fs(null))).toBe('create')
    expect(desktopLinkPlan('/d/IKRAL Monitor', app, fs('link', app))).toBe('ok')
    expect(desktopLinkPlan('/d/IKRAL Monitor', app, fs('link', '/otra.app'))).toBe('blocked')
    expect(desktopLinkPlan('/d/IKRAL Monitor', app, fs('file'))).toBe('blocked')
  })
})
