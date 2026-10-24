#!/usr/bin/env node
// Puente ChatGPT → Claude Code por el Issue #1 de ikral-studio/coordinacion.
// launchd lo corre cada 45 s (tools/coord-bridge.plist). Cada vez:
//   1. Lee los comentarios nuevos del Issue (gh api) en orden.
//   2. Solo hace caso a los que publicó ChatGPT (app «chatgpt-codex-connector»), no a Claude ni a Kyo.
//   3. «COORD-PING» → contesta «COORD-PONG» sin despertar a Claude.
//      «[COORD-TASK]» → la pone en cola. Corre UNA tarea por vez con un Claude Code nuevo y sin ventana
//      (claude -p, contexto limpio armado desde plan maestro, bitácora, git e Issue). Al terminar, ese
//      proceso se cierra: la siguiente tarea empieza de cero. Así no hace falta /clear ni la terminal de Kyo.
//   Lo demás se ignora. Nunca ejecuta el texto del comentario como comando.
// Control: candado con PID (una sola ejecución), límite de tiempo por tarea, 1 reintento a los 10 min,
// y deduplicación (mismo comentario o misma tarea repetida en 24 h no se corre dos veces). Lógica en coord-bridge-core.mjs.
// Apagar: crear ~/.ikral-coord-pausa (pausa) o `launchctl bootout gui/$(id -u)/com.ikral.coord-bridge`.
// Pruebas sin tocar el Issue: COORD_DRY_RUN=1 (no publica) · COORD_STATE_DIR · COORD_LOG · COORD_CLAUDE_BIN · COORD_TASK_TIMEOUT_MS.
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { execFileSync, spawnSync } from 'node:child_process'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { MARK, MAX_ATTEMPTS, RETRY_DELAY_MS, afterAttempt, ingest, nextTask, normalizeState, pidAlive, prune, recoverRunning } from './coord-bridge-core.mjs'

const env = process.env
const REPO = 'ikral-studio/coordinacion'
const ISSUE = 1
const WORKDIR = join(homedir(), 'Documents', 'editor de storiborad', 'ikral-studio')
const STATE_DIR = env.COORD_STATE_DIR || join(homedir(), 'Library', 'Application Support', 'ikral-coord')
const STATE = join(STATE_DIR, 'state.json')
const LOCK = join(STATE_DIR, 'lock.pid')
/** Candado de la versión anterior (carpeta): se respeta mientras siga fresco. */
const OLD_LOCK = join(STATE_DIR, 'lock')
const LOG = env.COORD_LOG || join(homedir(), 'Library', 'Logs', 'ikral-coord.log')
const PAUSE = join(homedir(), '.ikral-coord-pausa')
const DRY = env.COORD_DRY_RUN === '1'
const CLAUDE = env.COORD_CLAUDE_BIN || 'claude'
const TASK_TIMEOUT_MS = Number(env.COORD_TASK_TIMEOUT_MS) || 2 * 60 * 60 * 1000
const STALE_MS = TASK_TIMEOUT_MS + 10 * 60 * 1000

const log = (msg) => appendFileSync(LOG, `${new Date().toISOString()} ${msg}\n`)
const gh = (...args) => execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
const post = (body) => {
  if (DRY) return log(`[prueba] publicaría: ${body}`)
  gh('api', `repos/${REPO}/issues/${ISSUE}/comments`, '-f', `body=${body}\n\n${MARK}`)
}

function readState() {
  try {
    return normalizeState(JSON.parse(readFileSync(STATE, 'utf8')))
  } catch {
    return null
  }
}
const saveState = (s) => writeFileSync(STATE, JSON.stringify(s, null, 2))

/** Toma el candado. false si otra ejecución viva lo tiene. */
function acquireLock() {
  if (existsSync(OLD_LOCK) && Date.now() - statSync(OLD_LOCK).mtimeMs < STALE_MS) return false
  for (let i = 0; i < 2; i++) {
    try {
      writeFileSync(LOCK, String(process.pid), { flag: 'wx' })
      return true
    } catch {
      const owner = Number(readFileSync(LOCK, 'utf8'))
      const fresh = Date.now() - statSync(LOCK).mtimeMs < STALE_MS
      if (pidAlive(owner) && fresh) return false
      log(`candado viejo (PID ${owner}): se libera`)
      rmSync(LOCK, { force: true })
    }
  }
  return false
}

/** Instrucción fija para Claude: el texto de la tarea NO va aquí; Claude lo lee y lo juzga contra el plan maestro. */
const taskPrompt = (id, url) => `Eres Claude Code trabajando en IKRAL Studio, despertado por el puente automático de coordinación.
ChatGPT dejó una tarea en el comentario ${id} del Issue #1 (${url}).
1. Léela con: gh api repos/${REPO}/issues/comments/${id} --jq .body
2. Arma tu contexto desde cero: docs/plan-maestro-ikral-studio.md, las últimas entradas de ../BITACORA.md, git log -10 y los últimos comentarios del Issue (gh issue view 1 -R ${REPO} --comments | tail -120). Ejecuta SOLO lo que esté dentro del plan maestro aprobado.
3. Prohibido: git push, publicar o desplegar, borrar datos o proyectos, gastar dinero, tocar ikral-studio-codex o proyectos reales («SIN CEBOLLA»), trabajar fuera de esta carpeta. Si la tarea lo pide, repórtalo como bloqueo.
4. Al final: npm test y npm run build, commit de trabajo, entrada en ../BITACORA.md y un comentario en el Issue #1 con estado, pruebas y bloqueos. Pon ${MARK} al final de tu comentario.`

/** Corre un Claude Code nuevo (proceso de vida corta) para la tarea. true si terminó bien. */
function runClaude(id, url, attempt) {
  post(`🤖 Puente: recibí la tarea (comentario ${id}, intento ${attempt} de ${MAX_ATTEMPTS}). Claude Code empieza ahora con contexto nuevo.`)
  log(`tarea ${id}: intento ${attempt}, arranca ${CLAUDE} -p`)
  const r = spawnSync(
    CLAUDE,
    [
      '-p',
      taskPrompt(id, url),
      '--permission-mode',
      'acceptEdits',
      '--allowedTools',
      'Read Edit Write Glob Grep Bash(npm *) Bash(npx *) Bash(node *) Bash(git status*) Bash(git diff*) Bash(git log*) Bash(git show*) Bash(git add *) Bash(git commit *) Bash(gh issue view *) Bash(gh issue comment *) Bash(gh api *) Bash(ls *) Bash(cat *) Bash(grep *) Bash(tail *) Bash(head *)',
      '--disallowedTools',
      'Bash(git push*) Bash(rm *) Bash(gh repo *) Bash(npm publish*)',
    ],
    { cwd: WORKDIR, encoding: 'utf8', timeout: TASK_TIMEOUT_MS, maxBuffer: 64 * 1024 * 1024 },
  )
  const why = r.error?.code === 'ETIMEDOUT' ? 'tiempo agotado' : r.error ? r.error.message : `código ${r.status}`
  log(`tarea ${id}: terminó (${why})\n${(r.stdout ?? '').slice(-2000)}`)
  return r.status === 0 ? null : why
}

function main() {
  mkdirSync(STATE_DIR, { recursive: true })
  if (existsSync(PAUSE)) return
  if (!acquireLock()) return
  try {
    // Una línea JSON por comentario (los saltos de línea del texto van escapados).
    const comments = gh('api', `repos/${REPO}/issues/${ISSUE}/comments`, '--paginate', '--jq', '.[] | tojson')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l))
    const now = Date.now()
    let state = readState()
    // Primera vez: solo recuerda dónde va; no actúa sobre lo viejo.
    if (!state) return saveState({ lastId: Math.max(0, ...comments.map((c) => c.id)), tasks: {} })
    state = prune(recoverRunning(state, now), now)
    const { state: next, pings } = ingest(state, comments, now)
    // Se guarda ANTES de actuar: un comentario nunca se procesa dos veces.
    saveState((state = next))
    for (const c of pings) {
      post(`COORD-PONG ✅ (puente automático del Mac, respuesta al comentario ${c.id})`)
      log(`ping ${c.id}: pong`)
    }
    for (const [id, t] of Object.entries(state.tasks))
      if (t.status === 'duplicate' && !t.reported) {
        post(`🔁 Puente: la tarea del comentario ${id} es igual a la del ${t.of}; no se corre otra vez.`)
        state.tasks[id] = { ...t, reported: true }
        saveState(state)
      }
    // Una sola tarea por ejecución; la siguiente se toma en la próxima vuelta de launchd.
    const id = nextTask(state, now)
    if (id === null) return
    const task = state.tasks[id]
    state.tasks[id] = { ...task, status: 'running', startedAt: now }
    saveState(state)
    const fail = runClaude(id, task.url, (task.attempts ?? 0) + 1)
    const done = afterAttempt(task, !fail, Date.now())
    state.tasks[id] = done
    saveState(state)
    if (done.status === 'pending')
      post(`⚠️ Puente: Claude Code no terminó la tarea del comentario ${id} (${fail}). Se reintenta sola en ${RETRY_DELAY_MS / 60000} min.`)
    else if (done.status === 'failed')
      post(`❌ Puente: la tarea del comentario ${id} falló ${done.attempts} veces (${fail}). Ya no se reintenta. Detalle en ~/Library/Logs/ikral-coord.log.`)
  } catch (e) {
    log(`error: ${e instanceof Error ? e.message : String(e)}`)
  } finally {
    rmSync(LOCK, { force: true })
  }
}

main()
