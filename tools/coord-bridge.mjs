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
//   4. Encadenamiento: con la cola vacía, toma la siguiente subetapa del plan maestro que falte cerrar, dentro del
//      rango de su línea «Encadenamiento autorizado: 3a → 4». Cerrada = commit «Fase 3b …» (sin «(parcial)»).
//      Tras cada etapa el puente comprueba él mismo: commit de cierre + npm test + npm run build. Si no, cuenta
//      como fallo; tras el reintento la cadena se detiene con informe. ChatGPT puede pausarla («COORD-CADENA-PAUSA»)
//      y reanudarla («COORD-CADENA-SIGUE», que vuelve a intentar la etapa detenida).
//   5. Monitor en vivo (tools/coord-monitor.mjs): cada vuelta reescribe una página de solo lectura con el estado real,
//      también las vueltas que encuentran el candado ocupado (latido mientras Claude trabaja).
// Control: candado con PID (una sola ejecución), límite de tiempo por tarea, 1 reintento a los 10 min,
// y deduplicación (mismo comentario o misma tarea repetida en 24 h no se corre dos veces). Lógica en coord-bridge-core.mjs.
// Apagar: crear ~/.ikral-coord-pausa (pausa todo menos las tareas «KRAKEN: relevos»; si el archivo dice TOTAL, también esas) o `launchctl bootout gui/$(id -u)/com.ikral.coord-bridge`.
// Carpeta de trabajo: la tarea puede traer una línea «WORKSPACE: panel» → Claude arranca con cwd en ~/Documents/ikral-memoria.
//   Sin esa línea → IKRAL Studio (como siempre). Solo claves de la lista cerrada WORKSPACES (coord-bridge-core.mjs);
//   una clave desconocida rechaza la tarea. El puente avisa en el Issue qué carpeta tomó ANTES de arrancar a Claude.
// Pruebas sin tocar el Issue: COORD_DRY_RUN=1 (no publica) · COORD_STATE_DIR · COORD_LOG · COORD_CLAUDE_BIN · COORD_TASK_TIMEOUT_MS
//   · COORD_FAKE_COMMENTS=<archivo.json> y COORD_PAUSE_FILE=<archivo> (solo con COORD_DRY_RUN=1: comentarios de prueba en vez
//   de los del Issue y otra ruta de pausa, para probar sin quitar la PAUSA real).
// Relevos de Kraken (prueba 30 oct 2026): una tarea con la línea «KRAKEN: relevos» (de ChatGPT o de Kyo) sigue sola turno tras turno:
//   Claude trabaja → el puente comprueba (npm test + build) → Codex revisa el cambio (solo lectura, aislado, suscripción ChatGPT)
//   → Kraken decide (relayDecision): terminar, otro relevo de Claude, o parar y preguntar a Kyo (solo la lista cerrada KYO_TOPICS).
//   Evidencia de cada turno en <COORD_STATE_DIR>/kraken-relevos.jsonl. COORD_CODEX_BIN cambia el ejecutable de Codex (pruebas).
// Kraken autónomo (David, 30 oct 2026): en tareas de Kyo (no de ChatGPT), «ALCANCE: publicar» deja a los relevos publicar
//   SOLO con `git push origin main` + tools/publicar-studio.sh (respaldo verificado y prueba en vivo); «RELEVOS: N» sube el tope (máx. 12).
//   Lo demás de KYO_TOPICS (dinero, borrar, permisos, canon, clientes reales, Supabase…) sigue siendo decisión de David.
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { execFileSync, spawnSync } from 'node:child_process'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  MARK,
  MAX_ATTEMPTS,
  RETRY_DELAY_MS,
  afterAttempt,
  chainRange,
  chainStep,
  closedStages,
  ingest,
  nextTask,
  normalizeState,
  pidAlive,
  planStages,
  prune,
  recoverRunning,
  vitestSummary,
  WORKSPACES,
  MAX_RELAYS,
  enqueueRelay,
  parseReview,
  parseTurn,
  pauseLetsRelays,
  relayDecision,
} from './coord-bridge-core.mjs'
import { logEvent, writeMonitor } from './coord-monitor.mjs'
import { taskTitle } from './coord-monitor-core.mjs'

const env = process.env
const REPO = 'ikral-studio/coordinacion'
const ISSUE = 1
/** Ruta de una clave de la lista cerrada (nunca sale del texto de GitHub). */
const wsDir = (key) => join(homedir(), ...WORKSPACES[key].path)
const WORKDIR = wsDir('studio')
const PANEL_DIR = wsDir('panel')
const mapaProyectos = () => [`- IKRAL Studio: ${WORKDIR} (carpeta actual)`, `- Panel de IKRAL (ikral-memoria: panel/, pruebas-panel/, agentes/): ${PANEL_DIR}`].join('\n')
const STATE_DIR = env.COORD_STATE_DIR || join(homedir(), 'Library', 'Application Support', 'ikral-coord')
const STATE = join(STATE_DIR, 'state.json')
const LOCK = join(STATE_DIR, 'lock.pid')
/** Candado de la versión anterior (carpeta): se respeta mientras siga fresco. */
const OLD_LOCK = join(STATE_DIR, 'lock')
const LOG = env.COORD_LOG || join(homedir(), 'Library', 'Logs', 'ikral-coord.log')
const DRY = env.COORD_DRY_RUN === '1'
/** La PAUSA real solo se puede cambiar de sitio en modo prueba (COORD_DRY_RUN=1). */
const PAUSE = DRY && env.COORD_PAUSE_FILE ? env.COORD_PAUSE_FILE : join(homedir(), '.ikral-coord-pausa')
const CLAUDE = env.COORD_CLAUDE_BIN || 'claude'
const TASK_TIMEOUT_MS = Number(env.COORD_TASK_TIMEOUT_MS) || 2 * 60 * 60 * 1000
const STALE_MS = TASK_TIMEOUT_MS + 10 * 60 * 1000
const CODEX = env.COORD_CODEX_BIN || 'codex'
const EVIDENCE = join(STATE_DIR, 'kraken-relevos.jsonl')
const evidence = (o) => appendFileSync(EVIDENCE, `${JSON.stringify({ at: new Date().toISOString(), ...o })}\n`)
const git = (...args) => execFileSync('git', args, { cwd: WORKDIR, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim()

/** Monitor en vivo (solo lectura): se reescribe en cada vuelta, también con el candado ocupado. Nunca falla. */
const monitor = () => writeMonitor({ stateDir: STATE_DIR, workdir: WORKDIR, pauseFile: PAUSE, repo: REPO, issue: ISSUE })
const event = (ev) => logEvent(STATE_DIR, ev)
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
const taskPrompt = (id, url) => `Eres Claude Code de IKRAL (Kraken), despertado por el puente automático de coordinación.
ChatGPT dejó una tarea en el comentario ${id} del Issue #1 (${url}).
Proyectos donde puedes trabajar (elige el que la tarea pida; si no dice, IKRAL Studio):
${mapaProyectos()}
1. Léela con: gh api repos/${REPO}/issues/comments/${id} --jq .body
2. Arma tu contexto desde cero en la carpeta del proyecto elegido: su CLAUDE.md, plan o Blueprint, las últimas entradas de su bitácora, git log -10 (git -C <carpeta> log -10) y los últimos comentarios del Issue (gh issue view 1 -R ${REPO} --comments | tail -120). En IKRAL Studio ejecuta solo lo del plan maestro; en otro proyecto, solo lo que la tarea pide, en local.
3. Prohibido: git push, publicar o desplegar (subir al servidor o a ikral.com), tocar producción (Supabase real, migraciones en producción), quitar la PAUSA de Kraken, borrar datos o proyectos, gastar dinero o créditos, credenciales nuevas, tocar ikral-studio-codex o proyectos reales («SIN CEBOLLA»), trabajar fuera de las carpetas de arriba. En el Panel: solo código y laboratorio local; publicar lo hace la sesión del Panel con el OK de David. Si la tarea pide algo prohibido, repórtalo como bloqueo.
4. Al final: las pruebas del proyecto (IKRAL Studio: npm test y npm run build; Panel: node pruebas-panel/<archivo>.js de lo que tocaste), commit de trabajo SOLO de tus archivos en el repo de ese proyecto, entrada en su bitácora (IKRAL Studio: ../BITACORA.md; Panel: ikral-memoria/BITACORA.md) y un comentario en el Issue #1 con estado, pruebas y bloqueos. Pon ${MARK} al final de tu comentario.`

/** Tarea con «WORKSPACE: panel»: Claude arranca DENTRO de ikral-memoria y solo trabaja ahí. */
const panelTaskPrompt = (id, url) => `Eres Claude Code de IKRAL (Kraken), despertado por el puente automático de coordinación.
Workspace: Panel de IKRAL. Tu carpeta actual es ${PANEL_DIR} (ikral-memoria: panel/, pruebas-panel/, agentes/). Trabaja SOLO aquí.
ChatGPT dejó una tarea en el comentario ${id} del Issue #1 (${url}).
1. Léela con: gh api repos/${REPO}/issues/comments/${id} --jq .body
2. Arma tu contexto desde cero en esta carpeta: CLAUDE.md, el Blueprint o docs que la tarea nombre, las últimas entradas de BITACORA.md, git log -10 y los últimos comentarios del Issue (gh issue view 1 -R ${REPO} --comments | tail -120). Haz solo lo que la tarea pide, en local.
3. Prohibido: git push, publicar o desplegar (subir al servidor o a ikral.com), tocar producción (Supabase real, migraciones en producción), quitar la PAUSA de Kraken, borrar datos o proyectos, gastar dinero o créditos, credenciales nuevas, tocar ikral-studio-codex o proyectos reales («SIN CEBOLLA»), trabajar fuera de esta carpeta. Solo código y laboratorio local; publicar lo hace la sesión del Panel con el OK de David. Si la tarea pide algo prohibido, repórtalo como bloqueo.
4. Al final: si cambiaste algo, node pruebas-panel/<archivo>.js de lo que tocaste, commit de trabajo SOLO de tus archivos en este repo y entrada en BITACORA.md. Siempre: un comentario en el Issue #1 con estado, pruebas y bloqueos. Pon ${MARK} al final de tu comentario.`

/** Instrucción fija para una etapa del encadenamiento: sale del plan, no de texto de GitHub. */
const stagePrompt = (stage, closed) => `Eres Claude Code trabajando en IKRAL Studio, despertado por el encadenamiento automático del plan maestro.
Tu tarea: la sub-etapa «${stage}» de docs/plan-maestro-ikral-studio.md, autorizada por su línea «Encadenamiento autorizado». Ya cerradas: ${[...closed].sort().join(', ') || 'ninguna'}.
1. Arma tu contexto desde cero: el plan maestro (la fase de «${stage}» completa, sus reglas de protección y «Cómo se entrega cada fase»), las últimas entradas de ../BITACORA.md, git log -15, docs/carpeta-del-proyecto.md y el código de la etapa anterior. Haz SOLO lo que el plan dice para «${stage}».
2. Prohibido: git push, publicar o desplegar, instalar la app de Mac, borrar datos o proyectos, gastar dinero o APIs de pago, credenciales nuevas, tocar ikral-studio-codex o proyectos reales («SIN CEBOLLA»), trabajar fuera de esta carpeta. GPT/Codex: pruebas con mocks; no gastes cuota de ChatGPT con llamadas reales repetidas.
3. Pruebas: npm test, npm run build y las de Playwright (npm run test:e2e). Todas deben pasar, las viejas y las nuevas.
4. Commits intermedios con «(parcial)» en el asunto. El ÚLTIMO commit, solo cuando todo esté terminado y probado, con asunto que empiece exactamente «Fase ${stage} » (así el puente sabe que se cerró). Si no puedes terminar, no hagas ese commit: explica el bloqueo.
5. Al final: entrada en ../BITACORA.md y un comentario en el Issue #1 con estado, pruebas y bloqueos. Pon ${MARK} al final de tu comentario.`

/** Árbitro de decisiones: se suma a las tareas con relevos. */
const ARBITRO = `
REGLAS DE RELEVO (Kraken): no le preguntes nada a Kyo ni le pidas «listo». Una duda técnica o reversible la decides tú y la anotas al final en una línea:
DECISIÓN: <qué decidiste> | <por qué> | <cómo se deshace>
Solo si de verdad necesitas a David por algo de esta lista cerrada (publicar, dinero, borrar, permisos, canon-creativo, clientes-reales, proyectos-protegidos, produccion), escribe al final UNA línea:
NECESITA-KYO: <tema de la lista> · <motivo en una frase>
Haz SOLO el primer punto pendiente de la tarea en este turno y haz su commit de trabajo. Después del tuyo, el puente comprueba, Codex revisa y Kraken decide el siguiente paso: tú no lo pidas.`

/** Kraken autónomo: lo que David autorizó en el ALCANCE de la tarea. Reemplaza SOLO la prohibición de push/publicar. */
const alcancePrompt = (alcance) =>
  alcance.includes('publicar')
    ? `
ALCANCE AUTORIZADO POR DAVID EN ESTA TAREA: publicar. Esto reemplaza la prohibición de «git push» y «publicar o desplegar» de arriba, y publicar ya NO es NECESITA-KYO.
- Publica SOLO cuando el objetivo esté terminado y probado: git push origin main y después bash tools/publicar-studio.sh (única vía: pruebas, respaldo verificado en la unidad C, subir y probar la página publicada https://ikral.com/studio/).
- Si el script falla, corrige y vuelve a correrlo; si la página publicada quedó mal, revierte con el comando que imprime.
- Copia en tu informe final la línea «PUBLICADO OK…» del script. No publiques comentarios con [COORD-TASK].
- Sigue prohibido: dinero, borrar datos o proyectos, permisos, canon creativo, clientes reales, proyectos protegidos, Supabase/migraciones de producción, quitar la PAUSA.`
    : ''

/** Relevo n de una tarea con relevos: Claude nuevo, sigue donde Codex dijo. */
const relayPrompt = (root, url, n, review, max = MAX_RELAYS) => `Eres Claude Code de IKRAL (Kraken), relevo ${n} de ${max} de la tarea del comentario ${root} del Issue #1 (${url}), en IKRAL Studio.
1. Lee la tarea: gh api repos/${REPO}/issues/comments/${root} --jq .body
2. Mira lo ya hecho en relevos anteriores: git log -8 y las últimas entradas de ../BITACORA.md.
3. Revisión de Codex del turno anterior (veredicto «${review.verdict}»): ${review.notes.join(' · ') || 'sin observaciones'}. Siguiente paso que propuso: ${review.next || '—'}.
   Haz eso (corregir observaciones o el siguiente punto pendiente). Nada fuera de la tarea.
4. Prohibido: git push, publicar o desplegar, borrar datos o proyectos, gastar dinero o créditos, credenciales nuevas, tocar ikral-studio-codex o «SIN CEBOLLA», quitar la PAUSA, trabajar fuera de esta carpeta.
5. Al final: npm test y npm run build, commit de trabajo SOLO de tus archivos, entrada en ../BITACORA.md y un comentario corto en el Issue #1. Pon ${MARK} al final de tu comentario.
${ARBITRO}`

let lastClaudeOut = ''
/** Corre un Claude Code nuevo (proceso de vida corta). null si terminó bien; si no, el motivo. */
function runClaude(label, prompt, cwd = WORKDIR, { publicar = false } = {}) {
  if (!existsSync(cwd)) return `no existe la carpeta ${cwd}`
  log(`${label}: arranca ${CLAUDE} -p en ${cwd}`)
  // Studio puede leer el Panel (como antes); una tarea del Panel no recibe otras carpetas.
  const extra = cwd === WORKDIR ? [PANEL_DIR] : []
  const r = spawnSync(
    CLAUDE,
    [
      '-p',
      prompt,
      '--permission-mode',
      'acceptEdits',
      ...extra.flatMap((d) => ['--add-dir', d]),
      '--allowedTools',
      `Read Edit Write Glob Grep Bash(npm *) Bash(npx *) Bash(node *) Bash(git status*) Bash(git -C *) Bash(cd *) Bash(git diff*) Bash(git log*) Bash(git show*) Bash(git add *) Bash(git commit *) Bash(gh issue view *) Bash(gh issue comment *) Bash(gh api *) Bash(ls *) Bash(cat *) Bash(grep *) Bash(tail *) Bash(head *)${publicar ? ' Bash(git push origin main) Bash(bash tools/publicar-studio.sh*)' : ''}`,
      '--disallowedTools',
      // Con «ALCANCE: publicar» solo se abre «git push origin main»; cualquier otro push sigue cerrado.
      `${publicar ? 'Bash(git push -*) Bash(git push --*) Bash(git -C * push*)' : 'Bash(git push*) Bash(git -C * push*)'} Bash(rm *) Bash(gh repo *) Bash(npm publish*)`,
    ],
    { cwd, encoding: 'utf8', timeout: TASK_TIMEOUT_MS, maxBuffer: 64 * 1024 * 1024 },
  )
  const why = r.error?.code === 'ETIMEDOUT' ? 'tiempo agotado' : r.error ? r.error.message : `código ${r.status}`
  log(`${label}: terminó (${why})\n${(r.stdout ?? '').slice(-2000)}`)
  lastClaudeOut = r.stdout ?? ''
  return r.status === 0 ? null : why
}

const gitSubjects = () => execFileSync('git', ['log', '--format=%s', '-300'], { cwd: WORKDIR, encoding: 'utf8' }).split('\n')
const readPlan = () => readFileSync(join(WORKDIR, 'docs', 'plan-maestro-ikral-studio.md'), 'utf8')
const chainInfo = () => {
  const plan = readPlan()
  return { stages: planStages(plan), range: chainRange(plan), closed: closedStages(gitSubjects()) }
}

/** Comprobación propia del puente tras una etapa: commit de cierre, pruebas unitarias y compilación. */
function verifyStage(stage) {
  if (!closedStages(gitSubjects()).has(stage)) return { ok: false, why: `no hay commit «Fase ${stage} …» de cierre` }
  return checks()
}

/** npm test + npm run build en IKRAL Studio. */
function checks() {
  const run = (args) => spawnSync('npm', args, { cwd: WORKDIR, encoding: 'utf8', timeout: 20 * 60 * 1000, maxBuffer: 64 * 1024 * 1024 })
  const t = run(['test'])
  const tests = vitestSummary(`${t.stdout}\n${t.stderr}`)
  if (t.status !== 0) return { ok: false, why: `npm test falló${tests ? ` (${tests.failed} de ${tests.total})` : ''}` }
  const b = run(['run', 'build'])
  if (b.status !== 0) return { ok: false, why: 'npm run build falló' }
  const commit = execFileSync('git', ['log', '-1', '--format=%h %s'], { cwd: WORKDIR, encoding: 'utf8' }).trim()
  return { ok: true, commit, tests }
}

const REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    veredicto: { type: 'string', enum: ['terminado', 'siguiente', 'corregir', 'kyo'] },
    observaciones: { type: 'array', items: { type: 'string' } },
    siguiente_paso: { type: 'string' },
  },
  required: ['veredicto', 'observaciones', 'siguiente_paso'],
  additionalProperties: false,
}

/** Codex revisa el turno: solo lectura, carpeta vacía, sin herramientas, con la suscripción ChatGPT (como el despachador). */
function codexReview({ body, base, report, turn, checked, n, max = MAX_RELAYS, alcance = [] }) {
  const dir = mkdtempSync(join(tmpdir(), 'kraken-codex-'))
  try {
    const diff = git('diff', `${base}..HEAD`).slice(0, 80_000)
    const commits = git('log', '--format=%h %s', `${base}..HEAD`)
    const prompt = `Eres Codex, revisor de Kraken (IKRAL). Revisa el turno ${n} de ${max} de Claude Code sobre esta tarea de IKRAL Studio.
TAREA (de Kyo/ChatGPT):\n${body}\n
COMPROBACIÓN DEL PUENTE: ${checked.ok ? `npm test y build OK (${checked.tests ? `${checked.tests.passed}/${checked.tests.total}` : 'sin conteo'})` : `FALLÓ: ${checked.why}`}
COMMITS DESDE EL INICIO:\n${commits || '(ninguno)'}\n
DECISIONES QUE TOMÓ CLAUDE:\n${turn.decisions.join('\n') || '(ninguna)'}\n
INFORME FINAL DE CLAUDE:\n${report.slice(-3000)}\n
DIFF DESDE EL INICIO DE LA TAREA:\n${diff || '(vacío)'}\n
Responde con el esquema. veredicto:
- «terminado»: TODOS los puntos de la tarea están hechos, bien y dentro del alcance.
- «siguiente»: lo hecho está bien pero falta algún punto de la tarea (di cuál en siguiente_paso).
- «corregir»: hay errores, algo fuera de alcance o una decisión de Claude mal tomada (detalla en observaciones).
- «kyo»: SOLO si hace falta David por publicar, dinero, borrar, permisos, canon/creativo final, clientes reales, proyectos protegidos o producción.
Una dificultad técnica NO es «kyo». No pidas nada fuera de la tarea.${
      alcance.includes('publicar')
        ? '\nDavid AUTORIZÓ publicar en esta tarea: publicar NO es «kyo». Si la tarea pide publicar, «terminado» exige que el informe de Claude traiga la línea «PUBLICADO OK» del script tools/publicar-studio.sh.'
        : ''
    }`
    writeFileSync(join(dir, 'esquema.json'), JSON.stringify(REVIEW_SCHEMA))
    const off = ['shell_tool', 'unified_exec', 'apps', 'plugins', 'browser_use', 'browser_use_external', 'computer_use', 'image_generation', 'hooks', 'multi_agent', 'view_image', 'skill_search', 'tool_suggest', 'skill_mcp_dependency_install']
    const r = spawnSync(
      CODEX,
      ['exec', '--skip-git-repo-check', '--ephemeral', '--ignore-user-config', '--ignore-rules', '-s', 'read-only', ...off.flatMap((f) => ['--disable', f]),
        '-c', 'forced_login_method="chatgpt"', '-c', 'web_search="disabled"', '-c', 'model_reasoning_effort="medium"',
        '--output-schema', join(dir, 'esquema.json'), '--color', 'never', '-o', join(dir, 'r.txt'), '-'],
      { cwd: dir, input: prompt, encoding: 'utf8', timeout: 15 * 60 * 1000, maxBuffer: 64 * 1024 * 1024 },
    )
    const raw = existsSync(join(dir, 'r.txt')) ? readFileSync(join(dir, 'r.txt'), 'utf8') : ''
    if (r.status !== 0 || !raw) log(`codex: sin respuesta (${r.error?.message ?? `código ${r.status}`}) ${(r.stderr ?? '').slice(-500)}`)
    return { review: parseReview(raw), raw }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/** Un turno de una tarea con relevos: Claude → comprobación → Codex → Kraken decide. */
function relayTurn(state, id, task, attempt, comments) {
  const root = task.kind === 'relay' ? task.root : String(id)
  const n = task.n ?? 1
  const rootTask = task.kind === 'relay' ? state.tasks[root] ?? {} : task
  const max = task.max ?? rootTask.max ?? MAX_RELAYS
  const alcance = task.alcance ?? rootTask.alcance ?? []
  const publicar = alcance.includes('publicar')
  const base = task.base ?? git('rev-parse', 'HEAD')
  const url = task.kind === 'relay' ? state.tasks[root]?.url ?? '' : task.url
  const body = comments.find((c) => String(c.id) === root)?.body ?? ''
  if (!task.base) state.tasks[id] = { ...state.tasks[id], base }
  saveState(state)
  const about = { key: String(id), title: task.title ?? `relevo ${n}` }
  post(`🐙 Kraken: relevo **${n} de ${max}** de la tarea ${root}${alcance.length ? ` · alcance autorizado por David: ${alcance.join(', ')}` : ''} (intento ${attempt} de ${MAX_ATTEMPTS}). Claude Code empieza con contexto nuevo; nadie tiene que decir «listo».`)
  evidence({ root, n, step: 'claude-start', head: git('rev-parse', '--short', 'HEAD') })
  const prompt = `${n === 1 ? `${taskPrompt(root, url)}\n${ARBITRO}` : relayPrompt(root, url, n, task.review ?? { verdict: '', notes: [], next: '' }, max)}${alcancePrompt(alcance)}`
  let fail = runClaude(`relevo ${root}-${n} (intento ${attempt})`, prompt, WORKDIR, { publicar })
  event({ type: 'task-end', ok: !fail, why: fail ?? undefined, ...about })
  evidence({ root, n, step: 'claude-end', ok: !fail, why: fail, head: git('rev-parse', '--short', 'HEAD'), out: lastClaudeOut.slice(-1500) })
  if (!fail) {
    const turn = parseTurn(lastClaudeOut)
    const checked = checks()
    evidence({ root, n, step: 'checks', ...checked })
    const stopsForKyo = turn.needsKyo && !alcance.includes(turn.needsKyo.topic)
    const { review, raw } = stopsForKyo ? { review: null, raw: '' } : codexReview({ body, base, report: lastClaudeOut, turn, checked, n, max, alcance })
    evidence({ root, n, step: 'codex', review, raw: raw.slice(0, 3000) })
    const d = relayDecision({ turn, review, checks: checked, n, max, alcance })
    evidence({ root, n, step: 'kraken', decision: d, decisions: turn.decisions, offList: turn.offList })
    const t = checked.tests ? `${checked.tests.passed}/${checked.tests.total}` : checked.ok ? 'OK' : `falló (${checked.why})`
    const dec = turn.decisions.length ? `\n- Decisiones de Claude (sin preguntar a Kyo): ${turn.decisions.map((x) => `«${x}»`).join('; ')}` : ''
    const rev = review ? `\n- Codex: **${review.verdict}**${review.notes.length ? ` · ${review.notes.join(' · ')}` : ''}${review.next ? ` · siguiente: ${review.next}` : ''}` : ''
    const head = `🐙 Kraken · relevo ${n} de la tarea ${root}\n- Puente: npm test ${t} · build ${checked.ok ? 'OK' : 'falló'}${rev}${dec}`
    if (d.action === 'relay') {
      state = enqueueRelay(state, root, n + 1, { base, review: review ?? { verdict: 'corregir', notes: [d.why], next: '' }, url, max, ...(alcance.length ? { alcance } : {}) }, Date.now())
      post(`${head}\n- Decisión de Kraken: **otro relevo (${n + 1})** porque ${d.why}. Arranca solo en la próxima vuelta.`)
    } else if (d.action === 'done') post(`${head}\n- Decisión de Kraken: **🏁 tarea terminada** (${d.why}) en ${n} relevo(s), sin intervención de Kyo. ${/PUBLICADO OK/.test(lastClaudeOut) ? 'Publicado en https://ikral.com/studio/ (dentro del alcance autorizado).' : 'No se publicó nada.'}`)
    else if (d.action === 'kyo') post(`${head}\n- 🙋 **Se detiene: necesita a Kyo** · ${d.why}`)
    else post(`${head}\n- ⛔ **Se detiene por tope** · ${d.why}. Componente que detuvo: tope de relevos del puente.`)
  }
  const done = afterAttempt(state.tasks[id], !fail, Date.now())
  state.tasks[id] = done
  saveState(state)
  if (done.status === 'pending') post(`⚠️ Kraken: el relevo ${n} de la tarea ${root} no terminó (${fail}). Se reintenta solo en ${RETRY_DELAY_MS / 60000} min.`)
  if (done.status === 'failed') post(`❌ Kraken: el relevo ${n} de la tarea ${root} falló ${done.attempts} veces (${fail}). Se detiene. Componente: Claude Code (claude -p).`)
}

function main() {
  mkdirSync(STATE_DIR, { recursive: true })
  // PAUSA: todo detenido, salvo las tareas que piden «KRAKEN: relevos» (salvo que la PAUSA diga «TOTAL»).
  const paused = existsSync(PAUSE)
  if (paused && !pauseLetsRelays(readFileSync(PAUSE, 'utf8'))) return monitor()
  // Candado ocupado = otra vuelta está trabajando: esta solo actualiza el monitor (latido).
  if (!acquireLock()) return monitor()
  try {
    // Una línea JSON por comentario (los saltos de línea del texto van escapados).
    const comments =
      DRY && env.COORD_FAKE_COMMENTS
        ? JSON.parse(readFileSync(env.COORD_FAKE_COMMENTS, 'utf8'))
        : gh('api', `repos/${REPO}/issues/${ISSUE}/comments`, '--paginate', '--jq', '.[] | tojson')
            .split('\n')
            .filter(Boolean)
            .map((l) => JSON.parse(l))
    const now = Date.now()
    let state = readState()
    // Primera vez: solo recuerda dónde va; no actúa sobre lo viejo.
    if (!state) return saveState({ lastId: Math.max(0, ...comments.map((c) => c.id)), tasks: {}, chain: {} })
    state = prune(recoverRunning(state, now), now)
    const { state: next, pings, controls } = ingest(state, comments, now)
    // Título corto y limpio de cada tarea de ChatGPT, para el monitor.
    for (const c of comments) if (next.tasks[c.id] && !next.tasks[c.id].title) next.tasks[c.id].title = taskTitle(c.body)
    // Se guarda ANTES de actuar: un comentario nunca se procesa dos veces.
    saveState((state = next))
    for (const c of pings) {
      post(`COORD-PONG ✅ (puente automático del Mac, respuesta al comentario ${c.id})`)
      log(`ping ${c.id}: pong`)
    }
    for (const c of controls) event({ type: c.kind })
    for (const c of controls)
      post(
        c.kind === 'chain-pause'
          ? `⏸️ Puente: cadena del plan en pausa (comentario ${c.id}). Lo que esté corriendo termina; no se empieza otra etapa hasta «COORD-CADENA-SIGUE».`
          : `▶️ Puente: cadena del plan reanudada (comentario ${c.id}). Si una etapa estaba detenida, se intenta otra vez.`,
      )
    for (const [id, t] of Object.entries(state.tasks))
      if (t.status === 'duplicate' && !t.reported) {
        post(`🔁 Puente: la tarea del comentario ${id} es igual a la del ${t.of}; no se corre otra vez.`)
        state.tasks[id] = { ...t, reported: true }
        saveState(state)
      }
    for (const [id, t] of Object.entries(state.tasks))
      if (t.status === 'invalid' && !t.reported) {
        post(`🚫 Puente: la tarea del comentario ${id} pide «WORKSPACE: ${t.asked}», que no está en la lista permitida (${Object.keys(WORKSPACES).join(', ')}). No se corre.`)
        log(`tarea ${id}: workspace no permitido (${t.asked})`)
        state.tasks[id] = { ...t, reported: true }
        saveState(state)
      }
    // Cola vacía: la cadena del plan pone en cola la siguiente etapa que falte cerrar.
    let info = { stages: [], range: null, closed: new Set() }
    try {
      info = chainInfo()
    } catch (e) {
      log(`cadena: no se pudo leer el plan o git (${e instanceof Error ? e.message : String(e)})`)
    }
    // Con PAUSA, la cadena del plan no avanza: solo los relevos pedidos con «KRAKEN: relevos».
    const step = paused ? { action: 'paused' } : chainStep(state, info, now)
    if (step.action === 'run') {
      saveState((state = step.state))
      log(`cadena: etapa ${step.stage} en cola`)
    } else if (step.action === 'stopped' && !state.tasks[`etapa-${step.stage}`].reported) {
      state.tasks[`etapa-${step.stage}`].reported = true
      saveState(state)
      event({ type: 'chain-stopped', stage: step.stage })
      post(`⛔ Puente: la cadena del plan está detenida en la etapa ${step.stage} (falló ${MAX_ATTEMPTS} veces). «COORD-CADENA-SIGUE» la vuelve a intentar.`)
    } else if (step.action === 'finished' && !state.chain.finishedReported) {
      post(`🏁 Puente: cadena del plan terminada: ya están cerradas todas las etapas autorizadas (${info.range.from} → ${info.range.to}). Publicar sigue esperando el «sí» del director.`)
      state.chain = { ...state.chain, finishedReported: true }
      event({ type: 'chain-finished' })
      saveState(state)
    }

    // Una sola tarea por ejecución; la siguiente se toma en la próxima vuelta de launchd.
    const id = nextTask(state, now, { onlyRelays: paused })
    if (id === null) return
    const task = state.tasks[id]
    const attempt = (task.attempts ?? 0) + 1
    state.tasks[id] = { ...task, status: 'running', startedAt: now }
    saveState(state)
    const about = { key: String(id), stage: task.stage, title: task.title }
    event({ type: 'task-start', attempt, ...about })
    monitor()
    let fail
    let report = ''
    if (task.relays) {
      relayTurn(state, id, task, attempt, comments)
      return
    }
    if (task.kind === 'stage') {
      const closed = [...info.closed].sort().join(', ') || 'ninguna'
      post(`🔗 Puente: se activa la etapa **${task.stage}** del plan maestro (intento ${attempt} de ${MAX_ATTEMPTS}). Ya cerradas: ${closed}. Claude Code empieza con contexto nuevo.`)
      fail = runClaude(`etapa ${task.stage} (intento ${attempt})`, stagePrompt(task.stage, info.closed))
      event({ type: 'task-end', ok: !fail, why: fail ?? undefined, ...about })
      if (!fail) {
        const v = verifyStage(task.stage)
        event({ type: 'verify', stage: task.stage, ok: v.ok, why: v.why, tests: v.tests?.passed })
        if (v.ok) {
          const t = v.tests ? `${v.tests.passed}/${v.tests.total} unitarias` : 'unitarias OK'
          report = `✅ Puente: etapa **${task.stage}** cerrada y comprobada por el puente · commit \`${v.commit}\` · npm test: ${t} · npm run build: OK. En la próxima vuelta sigue la siguiente etapa.`
        } else fail = v.why
      }
    } else {
      // Tareas guardadas antes de este cambio no traen workspace: son de IKRAL Studio.
      const ws = WORKSPACES[task.workspace] ? task.workspace : 'studio'
      const cwd = wsDir(ws)
      post(`🤖 Puente: recibí la tarea (comentario ${id}, intento ${attempt} de ${MAX_ATTEMPTS}). Workspace: **${WORKSPACES[ws].name}** (\`${cwd}\`). Claude Code empieza ahora con contexto nuevo.`)
      log(`tarea ${id}: workspace ${ws} → ${cwd}`)
      fail = runClaude(`tarea ${id} (intento ${attempt})`, ws === 'panel' ? panelTaskPrompt(id, task.url) : taskPrompt(id, task.url), cwd)
      event({ type: 'task-end', ok: !fail, why: fail ?? undefined, ...about })
    }
    const done = afterAttempt(task, !fail, Date.now())
    state.tasks[id] = done
    saveState(state)
    const what = task.kind === 'stage' ? `la etapa ${task.stage}` : `la tarea del comentario ${id}`
    if (report) post(report)
    if (done.status === 'pending')
      post(`⚠️ Puente: ${what} no quedó terminada (${fail}). Se reintenta sola en ${RETRY_DELAY_MS / 60000} min.`)
    else if (done.status === 'failed') {
      const stop = task.kind === 'stage' ? ' La cadena del plan se detiene aquí; «COORD-CADENA-SIGUE» la vuelve a intentar.' : ''
      post(`❌ Puente: ${what} falló ${done.attempts} veces (${fail}). Ya no se reintenta.${stop} Detalle en ~/Library/Logs/ikral-coord.log.`)
      if (task.kind === 'stage') state.tasks[id] = { ...done, reported: true }
      saveState(state)
    }
  } catch (e) {
    log(`error: ${e instanceof Error ? e.message : String(e)}`)
    event({ type: 'error' })
  } finally {
    rmSync(LOCK, { force: true })
    monitor()
  }
}

main()
