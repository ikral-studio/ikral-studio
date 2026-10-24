import { mkdirSync, mkdtempSync, readFileSync, readlinkSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { writeMonitor } from './coord-monitor.mjs'
import { SHORTCUT_NAME, ensureShortcut } from './monitor-shortcut.mjs'

const setup = () => {
  const dir = mkdtempSync(join(tmpdir(), 'acceso-monitor-'))
  const desktopDir = join(dir, 'Desktop')
  const stateDir = join(dir, 'ikral-coord')
  mkdirSync(desktopDir)
  mkdirSync(stateDir)
  return { dir, desktopDir, stateDir }
}

describe('acceso «Monitor IKRAL» en el Escritorio', () => {
  it('crea un enlace al monitor.html real y enseña lo que el puente reescribe', () => {
    const { dir, desktopDir, stateDir } = setup()
    const r = ensureShortcut({ desktopDir, stateDir })
    expect(r.status).toBe('created')
    expect(r.missing).toBe(true)
    const link = join(desktopDir, SHORTCUT_NAME)
    expect(readlinkSync(link)).toBe(join(stateDir, 'monitor.html'))
    // El puente escribe el monitor: el acceso lo lee sin hacer nada más.
    writeMonitor({ stateDir, workdir: dir, pauseFile: join(dir, 'no-pausa'), github: false, ps: '' })
    const first = readFileSync(link, 'utf8')
    expect(first).toContain('http-equiv="refresh"')
    // Se reescribe (escritura atómica = archivo nuevo): el enlace sigue enseñando la versión nueva.
    writeFileSync(join(stateDir, 'state.json'), JSON.stringify({ lastId: 0, tasks: { 'etapa-4': { kind: 'stage', stage: '4', status: 'queued', attempts: 0 } }, chain: {} }))
    writeMonitor({ stateDir, workdir: dir, pauseFile: join(dir, 'no-pausa'), github: false, ps: '' })
    expect(readFileSync(link, 'utf8')).toBe(readFileSync(join(stateDir, 'monitor.html'), 'utf8'))
  })

  it('no duplica, corrige enlaces viejos y no pisa archivos ajenos', () => {
    const { dir, desktopDir, stateDir } = setup()
    expect(ensureShortcut({ desktopDir, stateDir }).status).toBe('created')
    expect(ensureShortcut({ desktopDir, stateDir }).status).toBe('ok')

    const other = setup()
    symlinkSync(join(dir, 'viejo.html'), join(other.desktopDir, SHORTCUT_NAME))
    expect(ensureShortcut(other).status).toBe('fixed')
    expect(readlinkSync(join(other.desktopDir, SHORTCUT_NAME))).toBe(join(other.stateDir, 'monitor.html'))

    const third = setup()
    writeFileSync(join(third.desktopDir, SHORTCUT_NAME), 'mío')
    expect(ensureShortcut(third).status).toBe('conflict')
    expect(readFileSync(join(third.desktopDir, SHORTCUT_NAME), 'utf8')).toBe('mío')
  })
})
