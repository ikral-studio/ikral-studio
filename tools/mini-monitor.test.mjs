import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { STALE_MS } from './coord-monitor-core.mjs'
import { writeMonitor } from './coord-monitor.mjs'
import { APP_NAME, desktopLinkPlan, dockEntry, dockHasApp, infoPlist } from './mini-monitor-app.mjs'
import { LINE_MAX, USAGE_STALE_MS, USAGE_URL, cleanUsage, countInteractiveClaude, miniCode, miniView, usageText } from './mini-monitor-core.mjs'

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

  it('un dato viejo o del futuro no se enseña', () => {
    expect(cleanUsage(usage({ at: NOW - USAGE_STALE_MS - 1 }), NOW).available).toBe(false)
    expect(cleanUsage(usage({ at: NOW + 10 * 60_000 }), NOW).available).toBe(false)
  })

  it('con fuente verificable enseña sesión y semana por separado', () => {
    const u = cleanUsage(JSON.stringify(usage()), NOW)
    expect(u).toMatchObject({ available: true, session: { usedPct: 61 }, week: { usedPct: 6, resetsAt: null } })
    expect(usageText(u)).toMatch(/^Sesión 61% usado \(reinicia .+\) · Semana 6% usado$/)
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
