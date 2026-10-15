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

const allProjects = () => readdirSync(ROOT).map((n) => join(ROOT, n)).filter((d) => existsSync(join(d, 'proyecto.json')))
/** Proyecto donde se escribió el último mensaje (o el último modificado). */
function lastChatProject() {
  const withChat = allProjects().filter((d) => existsSync(join(d, 'chat-usuario.json')))
  if (!withChat.length) return latestProject()
  return withChat.sort((a, b) => statSync(join(b, 'chat-usuario.json')).mtimeMs - statSync(join(a, 'chat-usuario.json')).mtimeMs)[0]
}
const files = (d) => ({ user: join(d, 'chat-usuario.json'), claude: join(d, 'chat-claude.json') })
const claudeOf = (d) => read(files(d).claude, { messages: [] })
const pendingOf = (d) => {
  const user = read(files(d).user, { messages: [] }).messages
  const c = claudeOf(d)
  const i = c.readUpTo ? user.findIndex((m) => m.id === c.readUpTo) : -1
  return user.slice(i + 1)
}
const touchOf = (d, patch = {}) => write(files(d).claude, { ...claudeOf(d), lastSeen: new Date().toISOString(), ...patch })

const dir = cmd === 'escuchar' ? arg1 : arg2 || lastChatProject()
const claude = () => claudeOf(dir)
const claudeFile = dir ? files(dir).claude : ''
const touch = (patch) => touchOf(dir, patch)

if (cmd === 'escuchar') {
  // Escucha uno o TODOS los proyectos (así funciona aunque abras uno nuevo).
  const targets = () => (dir ? [dir] : allProjects())
  targets().forEach((d) => touchOf(d))
  let beat = Date.now()
  const timer = setInterval(() => {
    for (const d of targets()) {
      const p = pendingOf(d)
      if (p.length) {
        clearInterval(timer)
        touchOf(d, { readUpTo: p[p.length - 1].id, working: 'Leyendo tu mensaje…' })
        console.log(JSON.stringify({ carpeta: d, mensajes: p }, null, 2))
        process.exit(0)
      }
    }
    if (Date.now() - beat > 20000) {
      targets().forEach((d) => touchOf(d))
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
