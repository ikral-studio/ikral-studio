#!/usr/bin/env node
// Cuota de Claude Code para el IKRAL Mini Monitor (M4), por la vía oficial: Claude Code manda un JSON por stdin
// al comando de su statusLine (code.claude.com/docs/en/statusline, «Rate limit usage»). Este script:
//   1. le pasa ese mismo stdin al statusLine que ya tenía el director (encadenado: su barra no cambia), y
//   2. guarda SOLO rate_limits (sesión 5 h y semana 7 d: % y reinicio) + hora de lectura en usage.json
//      (~/Library/Application Support/ikral-coord, archivo privado 600, escritura atómica).
// No lee credenciales, cookies, llavero ni red. No guarda rutas, costos, transcript ni el id de sesión en claro.
//
//   node tools/usage-statusline.mjs --chain '<statusLine de antes>'   ← lo llama Claude Code (no a mano)
//   npm run mini-monitor:conectar-uso      → encadena el statusLine en ~/.claude/settings.json (respaldo 1 vez en C)
//   npm run mini-monitor:desconectar-uso   → deja el statusLine como estaba
// conectar/desconectar: solo desde una sesión interactiva (el puente no toca ~/.claude/settings.json).
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { USAGE_FILE, usageFromStatusline } from './mini-monitor-core.mjs'

export const SCRIPT = fileURLToPath(import.meta.url)
export const COORD_DIR = process.env.IKRAL_COORD_DIR || join(homedir(), 'Library', 'Application Support', 'ikral-coord')
export const SETTINGS = join(homedir(), '.claude', 'settings.json')
export const BACKUP = '/Volumes/c/respaldos/ikral-studio/claude-settings-antes-de-M4.json'
const MARK = 'usage-statusline.mjs'

const q = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`
const unq = (s) => s.replace(/'\\''/g, "'")

/** Comando que encadena el statusLine anterior (o ninguno). */
export function wrapCommand(original, nodePath = process.execPath, script = SCRIPT) {
  return `${q(nodePath)} ${q(script)}${original ? ` --chain ${q(original)}` : ''}`
}

/** El statusLine de antes, a partir del nuestro ('' si no había). null si el comando no es nuestro. */
export function unwrapCommand(command) {
  if (typeof command !== 'string' || !command.includes(MARK)) return null
  const m = /--chain '((?:[^']|'\\'')*)'\s*$/.exec(command)
  return m ? unq(m[1]) : ''
}

/** settings con el statusLine encadenado. Idempotente: si ya está, no cambia nada. Respeta los demás campos. */
export function wrapSettings(settings, nodePath, script) {
  const s = { ...(settings ?? {}) }
  const sl = s.statusLine
  if (sl?.type === 'command' && unwrapCommand(sl.command) !== null) return { settings: s, changed: false }
  const original = sl?.type === 'command' && typeof sl.command === 'string' ? sl.command : ''
  s.statusLine = { ...(sl?.type === 'command' ? sl : {}), type: 'command', command: wrapCommand(original, nodePath, script) }
  return { settings: s, changed: true }
}

/** settings como estaban antes de conectar (sin statusLine si no había). */
export function unwrapSettings(settings) {
  const s = { ...(settings ?? {}) }
  const original = unwrapCommand(s.statusLine?.command)
  if (original === null) return { settings: s, changed: false }
  if (original) s.statusLine = { ...s.statusLine, command: original }
  else delete s.statusLine
  return { settings: s, changed: true }
}

const writeAtomic = (file, text, mode) => {
  const tmp = `${file}.${process.pid}.tmp`
  writeFileSync(tmp, text, { mode })
  renameSync(tmp, file)
}

/** Guarda la lectura en usage.json si el stdin trae rate_limits. Nunca lanza: la barra de estado no se rompe. */
export function saveUsage(raw, { dir = COORD_DIR, now = Date.now(), account = process.env.IKRAL_USAGE_ACCOUNT } = {}) {
  try {
    let sessionId = null
    try {
      sessionId = JSON.parse(raw)?.session_id ?? null
    } catch {}
    const sessionKey = typeof sessionId === 'string' && sessionId ? createHash('sha256').update(sessionId).digest('hex').slice(0, 12) : undefined
    const rec = usageFromStatusline(raw, now, { sessionKey, account })
    if (!rec) return null
    mkdirSync(dir, { recursive: true, mode: 0o700 })
    writeAtomic(join(dir, USAGE_FILE), JSON.stringify(rec), 0o600)
    return rec
  } catch {
    return null
  }
}

function readStdin(ms = 2000) {
  return new Promise((resolve) => {
    let buf = ''
    const done = () => {
      process.stdin.destroy()
      resolve(buf)
    }
    const t = setTimeout(done, ms)
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (c) => {
      if (buf.length < 1024 * 1024) buf += c
    })
    process.stdin.on('end', () => {
      clearTimeout(t)
      done()
    })
    process.stdin.on('error', done)
  })
}

async function statusline(chain) {
  const raw = await readStdin()
  let child = null
  if (chain) {
    // Primero la barra de siempre (su salida va directa a Claude Code); luego, en paralelo, el archivo.
    child = spawn('/bin/sh', ['-c', chain], { stdio: ['pipe', 'inherit', 'inherit'] })
    child.stdin.on('error', () => {})
    child.stdin.end(raw)
  }
  saveUsage(raw)
  if (child) child.on('close', (code) => (process.exitCode = code ?? 0))
}

function editSettings(fn, label) {
  if (!existsSync(SETTINGS)) throw new Error(`No existe ${SETTINGS}`)
  const before = JSON.parse(readFileSync(SETTINGS, 'utf8'))
  const { settings, changed } = fn(before)
  if (!changed) return console.log(`${label}: ya estaba, no se cambió nada.`)
  if (!existsSync(BACKUP)) {
    if (!existsSync('/Volumes/c')) throw new Error('La unidad C no está conectada: no hay dónde respaldar. No se cambió nada.')
    mkdirSync(join(BACKUP, '..'), { recursive: true })
    copyFileSync(SETTINGS, BACKUP)
    console.log(`Respaldo: ${BACKUP}`)
  }
  writeAtomic(SETTINGS, `${JSON.stringify(settings, null, 2)}\n`, 0o600)
  console.log(`${label}: listo. statusLine → ${settings.statusLine?.command ?? '(ninguno)'}`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [cmd, arg] = process.argv.slice(2)
  if (cmd === 'conectar') editSettings((s) => wrapSettings(s), 'Conectar uso')
  else if (cmd === 'desconectar') editSettings(unwrapSettings, 'Desconectar uso')
  else await statusline(cmd === '--chain' ? arg : '')
}
