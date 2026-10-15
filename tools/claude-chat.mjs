#!/usr/bin/env node
// Puente entre el chat de la app de escritorio y Claude Code (o cualquier asistente).
//
//   node tools/claude-chat.mjs escuchar [carpeta]   → espera un mensaje nuevo, lo imprime y termina
//   node tools/claude-chat.mjs trabajando "texto" [carpeta]
//   node tools/claude-chat.mjs responder "texto" [carpeta]
//
// Si no das carpeta, usa el proyecto modificado más recientemente en Documentos/IKRAL Studio/Proyectos.
import { existsSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const ROOT = join(homedir(), 'Documents', 'IKRAL Studio', 'Proyectos')
const [cmd, arg1, arg2] = process.argv.slice(2)

function latestProject() {
  const dirs = readdirSync(ROOT)
    .map((n) => join(ROOT, n))
    .filter((d) => existsSync(join(d, 'proyecto.json')))
    .sort((a, b) => statSync(join(b, 'proyecto.json')).mtimeMs - statSync(join(a, 'proyecto.json')).mtimeMs)
  if (!dirs.length) throw new Error('No hay proyectos en ' + ROOT)
  return dirs[0]
}
const read = (f, d) => {
  try {
    return JSON.parse(readFileSync(f, 'utf8'))
  } catch {
    return d
  }
}
const write = (f, data) => {
  writeFileSync(f + '.tmp', JSON.stringify(data, null, 2))
  renameSync(f + '.tmp', f)
}

const dir = (cmd === 'escuchar' ? arg1 : arg2) || latestProject()
const userFile = join(dir, 'chat-usuario.json')
const claudeFile = join(dir, 'chat-claude.json')
const claude = () => read(claudeFile, { messages: [] })
const pending = () => {
  const user = read(userFile, { messages: [] }).messages
  const c = claude()
  const i = c.readUpTo ? user.findIndex((m) => m.id === c.readUpTo) : -1
  return user.slice(i + 1)
}
const touch = (patch = {}) => write(claudeFile, { ...claude(), lastSeen: new Date().toISOString(), ...patch })

if (cmd === 'escuchar') {
  touch()
  let beat = Date.now()
  const timer = setInterval(() => {
    const p = pending()
    if (p.length) {
      clearInterval(timer)
      const last = p[p.length - 1]
      touch({ readUpTo: last.id, working: 'Leyendo tu mensaje…' })
      console.log(JSON.stringify({ carpeta: dir, mensajes: p }, null, 2))
      process.exit(0)
    }
    if (Date.now() - beat > 20000) {
      touch()
      beat = Date.now()
    }
  }, 1500)
} else if (cmd === 'trabajando') {
  touch({ working: arg1 || 'Trabajando…' })
} else if (cmd === 'responder') {
  const c = claude()
  const msg = { id: 'msg_' + Date.now().toString(36), from: 'claude', text: arg1 || '', at: new Date().toISOString() }
  write(claudeFile, { ...c, messages: [...c.messages, msg], working: undefined, lastSeen: new Date().toISOString() })
  console.log('respondido')
} else {
  console.log('Uso: escuchar | trabajando "texto" | responder "texto"  [carpeta]')
}
