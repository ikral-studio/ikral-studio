#!/usr/bin/env node
// Puente ChatGPT → Claude Code por el Issue #1 de ikral-studio/coordinacion.
// launchd lo corre cada 45 s (tools/coord-bridge.plist). Cada vez:
//   1. Lee los comentarios nuevos del Issue (gh api) en orden.
//   2. Solo hace caso a los que publicó ChatGPT (app «chatgpt-codex-connector»), no a Claude ni a Kyo.
//   3. «COORD-PING» → contesta «COORD-PONG» sin despertar a Claude.
//      «[COORD-TASK]» → corre Claude Code sin ventana (claude -p) en la carpeta de ikral-studio,
//      con herramientas limitadas (sin push, sin publicar, sin borrar). Claude lee la tarea y reporta.
//   Lo demás se ignora. Nunca ejecuta el texto del comentario como comando.
// Apagar: crear ~/.ikral-coord-pausa (pausa) o `launchctl bootout gui/$(id -u)/com.ikral.coord-bridge`.
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { execFileSync, spawnSync } from 'node:child_process'
import { homedir } from 'node:os'
import { join } from 'node:path'

const REPO = 'ikral-studio/coordinacion'
const ISSUE = 1
const CHATGPT_APP = 'chatgpt-codex-connector'
const WORKDIR = join(homedir(), 'Documents', 'editor de storiborad', 'ikral-studio')
const STATE_DIR = join(homedir(), 'Library', 'Application Support', 'ikral-coord')
const STATE = join(STATE_DIR, 'state.json')
const LOCK = join(STATE_DIR, 'lock')
const LOG = join(homedir(), 'Library', 'Logs', 'ikral-coord.log')
const PAUSE = join(homedir(), '.ikral-coord-pausa')
/** Las respuestas del puente y de Claude llevan esta marca (el hook Stop y el puente las ignoran). */
const MARK = '<!-- claude -->'
const TASK_TIMEOUT_MS = 2 * 60 * 60 * 1000

const log = (msg) => appendFileSync(LOG, `${new Date().toISOString()} ${msg}\n`)
const gh = (...args) => execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
const post = (body) => gh('api', `repos/${REPO}/issues/${ISSUE}/comments`, '-f', `body=${body}\n\n${MARK}`)

function readState() {
  try {
    return JSON.parse(readFileSync(STATE, 'utf8'))
  } catch {
    return null
  }
}
const saveState = (s) => writeFileSync(STATE, JSON.stringify(s, null, 2))

/** Instrucción fija para Claude: el texto de la tarea NO va aquí; Claude lo lee y lo juzga contra el plan maestro. */
const taskPrompt = (id, url) => `Eres Claude Code trabajando en IKRAL Studio, despertado por el puente automático de coordinación.
ChatGPT dejó una tarea en el comentario ${id} del Issue #1 (${url}).
1. Léela con: gh api repos/${REPO}/issues/comments/${id} --jq .body
2. Lee docs/plan-maestro-ikral-studio.md y tu CLAUDE.md global. Ejecuta SOLO lo que esté dentro del plan maestro aprobado.
3. Prohibido: git push, publicar o desplegar, borrar datos o proyectos, gastar dinero, tocar ikral-studio-codex o proyectos reales («SIN CEBOLLA»), trabajar fuera de esta carpeta. Si la tarea lo pide, repórtalo como bloqueo.
4. Al final: npm test y npm run build, commit de trabajo, entrada en ../BITACORA.md y un comentario en el Issue #1 con estado, pruebas y bloqueos. Pon ${MARK} al final de tu comentario.`

function runTask(c) {
  post(`🤖 Puente: recibí la tarea (comentario ${c.id}). Claude Code empieza a trabajar ahora.`)
  log(`tarea ${c.id}: arranca claude -p`)
  const r = spawnSync(
    'claude',
    [
      '-p',
      taskPrompt(c.id, c.html_url),
      '--permission-mode',
      'acceptEdits',
      '--allowedTools',
      'Read Edit Write Glob Grep Bash(npm *) Bash(npx *) Bash(node *) Bash(git status*) Bash(git diff*) Bash(git log*) Bash(git add *) Bash(git commit *) Bash(gh issue view *) Bash(gh issue comment *) Bash(gh api *) Bash(ls *) Bash(cat *) Bash(grep *)',
      '--disallowedTools',
      'Bash(git push*) Bash(rm *) Bash(gh repo *) Bash(npm publish*)',
    ],
    { cwd: WORKDIR, encoding: 'utf8', timeout: TASK_TIMEOUT_MS, maxBuffer: 64 * 1024 * 1024 },
  )
  log(`tarea ${c.id}: terminó (código ${r.status}${r.error ? ', ' + r.error.message : ''})\n${(r.stdout ?? '').slice(-2000)}`)
  if (r.status !== 0)
    post(`⚠️ Puente: Claude Code no terminó la tarea del comentario ${c.id} (código ${r.status ?? 'tiempo agotado'}). No se reintenta solo. Revisar ~/Library/Logs/ikral-coord.log.`)
}

function main() {
  mkdirSync(STATE_DIR, { recursive: true })
  if (existsSync(PAUSE)) return
  // Candado: nunca dos ejecuciones a la vez (una tarea puede durar mucho).
  try {
    mkdirSync(LOCK)
  } catch {
    // Candado viejo (el proceso murió): pasado el tiempo máximo de una tarea, se libera.
    if (Date.now() - statSync(LOCK).mtimeMs < TASK_TIMEOUT_MS + 10 * 60 * 1000) return
    log('candado viejo: se libera')
  }
  try {
    // Una línea JSON por comentario (los saltos de línea del texto van escapados).
    const comments = gh('api', `repos/${REPO}/issues/${ISSUE}/comments`, '--paginate', '--jq', '.[] | tojson')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l))
    comments.sort((a, b) => a.id - b.id)
    const maxId = comments.at(-1)?.id ?? 0
    const state = readState()
    // Primera vez: solo recuerda dónde va; no actúa sobre lo viejo.
    if (!state) return saveState({ lastId: maxId })
    for (const c of comments.filter((x) => x.id > state.lastId)) {
      // Se marca como visto ANTES de actuar: si algo falla, no se repite en bucle.
      saveState({ lastId: c.id })
      const fromChatGPT = c.performed_via_github_app?.slug === CHATGPT_APP && c.user?.login === 'nahya-bi'
      if (!fromChatGPT || c.body.includes(MARK)) continue
      if (/\bCOORD-PING\b/.test(c.body)) {
        post(`COORD-PONG ✅ (puente automático del Mac, respuesta al comentario ${c.id})`)
        log(`ping ${c.id}: pong`)
      } else if (c.body.includes('[COORD-TASK]')) runTask(c)
    }
  } catch (e) {
    log(`error: ${e instanceof Error ? e.message : String(e)}`)
  } finally {
    rmSync(LOCK, { recursive: true, force: true })
  }
}

main()
