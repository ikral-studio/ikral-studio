// Lógica pura del monitor del puente (sin red, sin disco): se prueba en tools/coord-monitor.test.mjs.
// El monitor es una página que el puente reescribe en cada vuelta de launchd. Solo lectura.
// Solo muestra señales comprobables: procesos vivos, estado del puente, commits, cambios en disco y GitHub.
// Nunca muestra comandos, rutas, nombres de archivo, registros internos ni credenciales.
import { isAbsolute, join, resolve, sep } from 'node:path'
import { chainStep, nextStage } from './coord-bridge-core.mjs'

/** Si la página no se reescribe en este tiempo, el estado que enseña es viejo («Sin señal»). launchd corre cada 45 s. */
export const STALE_MS = 3 * 60 * 1000
/** Trabajando sin ninguna señal nueva en este tiempo → se avisa «sin avances nuevos». */
export const STALL_MS = 30 * 60 * 1000

export const STATUS = {
  working: { label: 'Trabajando', icon: '🟢', color: '#16a34a' },
  queued: { label: 'En cola', icon: '🔵', color: '#2563eb' },
  idle: { label: 'Sin tareas', icon: '⚪', color: '#6b7280' },
  paused: { label: 'Pausado', icon: '⏸️', color: '#a16207' },
  approval: { label: 'Esperando aprobación', icon: '🟣', color: '#7c3aed' },
  error: { label: 'Error', icon: '🔴', color: '#dc2626' },
  nosignal: { label: 'Sin señal', icon: '⚫', color: '#111827' },
  disconnected: { label: 'No conectado', icon: '🔌', color: '#9ca3af' },
}

// ---- Privacidad ----

const CLI_WORDS = 'npm|npx|node|git|gh|cargo|launchctl|touch|rm|cp|mv|cat|codex|claude|security|curl|sudo|open'
const CLI = new RegExp(`^\\s*(${CLI_WORDS})\\b`)

/** Texto seguro de una línea: sin rutas, nombres de archivo, comandos, llaves, correos ni marcas internas. */
export function sanitize(text, max = 110) {
  let t = String(text ?? '')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/```[\s\S]*?(```|$)/g, ' ')
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.replace(/[#>*_\-\s]/g, '')) ?? ''
  t = t
    // `algo`: si parece ruta, archivo o comando se oculta; si no, se queda el texto.
    .replace(/`([^`]*)`/g, (_, s) => (/[/\\$=~]|\.\w{1,5}\b|^\s*-|\s-{1,2}\w/.test(s) || CLI.test(s) ? '…' : s))
    .replace(new RegExp(`\\b(${CLI_WORDS}) (run|exec|test|api|log|push|commit|issue|bootout|bootstrap|add)\\b[^.,;]*`, 'g'), '…')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, '…')
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '•••')
    .replace(/\b(gh[pousr]_\w+|github_pat_\w+|sk-[\w-]+|xox\w-[\w-]+)\b/g, '•••')
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, '•••')
    .replace(/(^|\s)(~|\.{1,2})?\/[^\s,;)»]+/g, '$1…')
    .replace(/\b[\w.-]+\.(mjs|cjs|js|jsx|ts|tsx|json|jsonl|md|rs|toml|plist|log|sh|py|html|css|yml|yaml|env|pid|txt)\b/gi, '…')
    .replace(/\[COORD-TASK\]/g, '')
    .replace(/[*_#>]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t
}

/** Título corto de una tarea de ChatGPT (para guardarlo en el estado del puente). */
export const taskTitle = (body) => sanitize(body, 90) || 'Tarea de ChatGPT'

/** Quién escribió un comentario del Issue, por sus marcas (no por el usuario: todos publican con la misma cuenta). */
export function commentAuthor(body) {
  const b = String(body ?? '')
  if (b.includes('<!-- chatgpt-coord -->')) return 'ChatGPT'
  if (b.includes('<!-- claude -->')) return /^\s*(🔗|✅|🤖|⚠️|❌|⏸️|▶️|🏁|🔁|⛔|COORD-PONG)/u.test(b) ? 'Puente' : 'Claude'
  return 'Director'
}

// ---- Procesos ----

/** «[[dd-]hh:]mm:ss» de ps → segundos. */
export function parseEtime(s) {
  const m = /^(?:(\d+)-)?(?:(\d+):)?(\d+):(\d+)$/.exec(String(s).trim())
  if (!m) return null
  return ((Number(m[1] ?? 0) * 24 + Number(m[2] ?? 0)) * 60 + Number(m[3])) * 60 + Number(m[4])
}

/**
 * Lee la salida de `ps -axo pid=,ppid=,etime=,args=` y mira solo los procesos que cuelgan del puente (rootPid).
 * Devuelve qué hay de verdad: Claude Code (y desde cuándo), pruebas o compilación. Los comandos no salen de aquí.
 */
export function inspectProcesses(psText, rootPid, now) {
  const rows = []
  for (const line of String(psText ?? '').split('\n')) {
    const m = /^\s*(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/.exec(line)
    if (m) rows.push({ pid: Number(m[1]), ppid: Number(m[2]), secs: parseEtime(m[3]), args: m[4] })
  }
  const out = { claude: null, tests: false, build: false }
  if (!rootPid) return out
  const kids = new Map()
  for (const r of rows) kids.set(r.ppid, [...(kids.get(r.ppid) ?? []), r])
  const seen = new Set()
  const stack = [...(kids.get(rootPid) ?? [])]
  while (stack.length) {
    const r = stack.pop()
    if (seen.has(r.pid)) continue
    seen.add(r.pid)
    stack.push(...(kids.get(r.pid) ?? []))
    if (/(^|\/)claude(\s|$)/.test(r.args) && !out.claude) out.claude = { since: r.secs === null ? null : now - r.secs * 1000 }
    // La línea de una shell solo dice qué va a correr; cuenta el proceso que de verdad corre.
    if (/^(\S*\/)?-?(zsh|bash|sh)\b/.test(r.args)) continue
    if (/\b(vitest|playwright)\b/.test(r.args)) out.tests = true
    if (/\bvite(\.js)? build\b|\btsc\b|\bcargo\b/.test(r.args)) out.build = true
  }
  return out
}

// ---- Plan ----

/** Nombre corto de cada sub-etapa del plan («3c» → «En personajes y Biblia»). */
export function stageTitles(planText) {
  const titles = {}
  for (const line of String(planText ?? '').split('\n')) {
    const sub = /^- \*\*(\d+[a-z])\.\*\*\s*(.+)$/.exec(line)
    if (sub) {
      const t = sub[2].replace(/\.\s.*$/, '').replace(/\.$/, '')
      titles[sub[1]] = sanitize(t.length > 50 ? t.replace(/,\s.*$/, '') : t, 70)
    }
    const ph = /^## Fase (\d+)\s*·?\s*(.*)$/.exec(line)
    if (ph) titles[ph[1]] = sanitize(ph[2], 70)
  }
  return titles
}

// ---- Estado ----

const fmtMin = (ms) => {
  const m = Math.max(0, Math.round(ms / 60000))
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`
}
const clock = (ts) => new Date(ts).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })

/** Nombre legible de una tarea del puente. */
export function taskName(key, t, titles = {}) {
  if (t?.kind === 'stage') return `Etapa ${t.stage}${titles[t.stage] ? ` · ${titles[t.stage]}` : ''}`
  return t?.title || `Tarea de ChatGPT (comentario ${key})`
}

/**
 * Decide el indicador con señales reales. snap = {
 *   state (estado del puente), pauseFile, lockAlive, procs (inspectProcesses), plan {stages, range, closed, titles},
 *   git {commits:[{at}], lastChangeAt}, events:[{at}]
 * }. Devuelve { code, detail, task, progress }.
 */
export function computeStatus(snap, now) {
  const tasks = Object.entries(snap.state?.tasks ?? {})
  const titles = snap.plan?.titles ?? {}
  const paused = Boolean(snap.pauseFile || snap.state?.chain?.paused)
  const running = tasks.find(([, t]) => t.status === 'running')

  if (running) {
    const [key, t] = running
    const task = { name: taskName(key, t, titles), stage: t.kind === 'stage' ? t.stage : null, startedAt: t.startedAt ?? null, attempt: (t.attempts ?? 0) + 1 }
    if (!snap.lockAlive) return { code: 'error', detail: 'La tarea se interrumpió: su proceso ya no existe. El puente la reintenta solo.', task }
    const since = t.startedAt ?? 0
    const signals = [
      ...(snap.git?.commits ?? []).map((c) => c.at),
      snap.git?.lastChangeAt ?? 0,
      ...(snap.events ?? []).map((e) => e.at),
    ].filter((at) => at >= since)
    if (snap.procs?.tests || snap.procs?.build) signals.push(now)
    const lastProgressAt = signals.length ? Math.max(...signals) : null
    const quiet = now - (lastProgressAt ?? since)
    const progress = { lastProgressAt, stalled: quiet > STALL_MS, quietMs: quiet }
    let detail
    if (snap.procs?.claude) {
      detail = snap.procs.tests ? 'Claude Code está corriendo pruebas.' : snap.procs.build ? 'Claude Code está compilando.' : 'Claude Code está trabajando.'
    } else if (!(snap.events ?? []).some((e) => e.type === 'task-end' && e.at >= since)) detail = 'Claude Code está arrancando.'
    else detail = t.kind === 'stage' ? 'Claude terminó; el puente comprueba la etapa (pruebas y compilación).' : 'Claude terminó; el puente cierra la tarea.'
    if (progress.stalled) detail += ` Sin avances nuevos hace ${fmtMin(quiet)} (sigue en ejecución).`
    if (paused) detail += ' Hay pausa: al terminar no empieza otra.'
    return { code: 'working', detail, task, progress }
  }

  if (snap.pauseFile) return { code: 'paused', detail: 'El puente está en pausa: no lee el Issue ni empieza tareas.' }
  if (snap.state?.chain?.paused) return { code: 'paused', detail: 'La cadena del plan está en pausa («COORD-CADENA-SIGUE» la reanuda).' }

  const failedStage = tasks.find(([, t]) => t.kind === 'stage' && t.status === 'failed')
  if (failedStage) return { code: 'error', detail: `La cadena se detuvo en la etapa ${failedStage[1].stage}: falló 2 veces.`, task: { name: taskName(...failedStage, titles), stage: failedStage[1].stage } }
  const lastDone = Math.max(0, ...tasks.filter(([, t]) => t.status === 'done').map(([, t]) => t.finishedAt ?? 0))
  const failed = tasks.filter(([, t]) => t.status === 'failed' && (t.finishedAt ?? 0) > lastDone).sort(([, a], [, b]) => b.finishedAt - a.finishedAt)[0]
  if (failed) return { code: 'error', detail: 'La última tarea falló 2 veces y ya no se reintenta.', task: { name: taskName(...failed, titles) } }

  const pending = tasks.filter(([, t]) => t.status === 'pending').sort(([, a], [, b]) => (a.nextAt ?? 0) - (b.nextAt ?? 0))
  if (pending.length) {
    const [key, t] = pending[0]
    const when = (t.nextAt ?? 0) > now ? `Reintento a las ${clock(t.nextAt)} (tras un fallo).` : 'Empieza en la próxima vuelta del puente (menos de 1 min).'
    const more = pending.length > 1 ? ` Hay ${pending.length} en cola.` : ''
    return { code: 'queued', detail: when + more, task: { name: taskName(key, t, titles), stage: t.kind === 'stage' ? t.stage : null } }
  }

  const plan = snap.plan ?? {}
  const closed = plan.closed instanceof Set ? plan.closed : new Set(plan.closed ?? [])
  const step = chainStep(snap.state ?? { tasks: {} }, { stages: plan.stages ?? [], range: plan.range ?? null, closed }, now)
  if (step.action === 'run')
    return { code: 'queued', detail: 'La cadena del plan la empieza en la próxima vuelta del puente.', task: { name: taskName(`etapa-${step.stage}`, { kind: 'stage', stage: step.stage }, titles), stage: step.stage } }
  if (step.action === 'finished') return { code: 'approval', detail: 'Todas las etapas autorizadas están cerradas. Publicar espera el «sí» del director.' }
  return { code: 'idle', detail: 'No hay tareas en cola. El puente sigue atento al Issue.' }
}

/** Fases del rango autorizado: cerrada, en curso o próxima. */
export function stageList(plan, currentStage) {
  const stages = plan?.stages ?? []
  const closed = plan?.closed instanceof Set ? plan.closed : new Set(plan?.closed ?? [])
  const next = nextStage(stages, plan?.range ?? null, closed)
  return stages
    .filter((s) => /^\d/.test(s))
    .map((s) => ({
      id: s,
      title: plan?.titles?.[s] ?? '',
      state: closed.has(s) ? 'closed' : s === currentStage ? 'current' : s === next ? 'next' : 'later',
    }))
}

// ---- Eventos del puente (los escribe el puente; aquí solo se traducen) ----

/** Texto legible de un evento guardado por el puente. Los motivos se pasan por sanitize. */
export function eventText(e, titles = {}) {
  const what = e.stage ? `Etapa ${e.stage}${titles[e.stage] ? ` · ${titles[e.stage]}` : ''}` : sanitize(e.title ?? 'Tarea de ChatGPT', 70)
  switch (e.type) {
    case 'task-start':
      return `▶️ Empieza: ${what} (intento ${e.attempt ?? 1})`
    case 'task-end':
      return e.ok ? `✔️ Claude terminó: ${what}` : `⚠️ No quedó: ${what} (${sanitize(e.why ?? 'falló', 60)})`
    case 'verify':
      return e.ok ? `✅ Puente comprobó la etapa ${e.stage}${e.tests ? ` · ${e.tests} pruebas OK` : ''} · compila` : `⚠️ Comprobación de la etapa ${e.stage}: ${sanitize(e.why ?? 'falló', 60)}`
    case 'tests-start':
      return '🧪 Pruebas en marcha'
    case 'tests-end':
      return '🧪 Pruebas terminadas'
    case 'build-start':
      return '🛠️ Compilación en marcha'
    case 'build-end':
      return '🛠️ Compilación terminada'
    case 'chain-stopped':
      return `⛔ Cadena detenida en la etapa ${e.stage}`
    case 'chain-finished':
      return '🏁 Cadena del plan terminada'
    case 'chain-pause':
      return '⏸️ Cadena en pausa'
    case 'chain-resume':
      return '▶️ Cadena reanudada'
    case 'error':
      return '❌ Error en una vuelta del puente'
    default:
      return null
  }
}

// ---- Página ----

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

/** «hace 3 min» (va también dentro de la página, para que el tiempo corra solo). */
export function ago(ms) {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `hace ${s} s`
  const m = Math.round(s / 60)
  if (m < 60) return `hace ${m} min`
  const h = Math.floor(m / 60)
  return h < 48 ? `hace ${h} h ${m % 60} min` : `hace ${Math.floor(h / 24)} días`
}

/** ¿El estado de la página está viejo? (también corre dentro de la página). */
export const isStale = (generatedAt, now, staleMs) => now - generatedAt > staleMs

/** Arma la vista (todo ya traducido y limpio) a partir de la foto del momento. */
export function buildView(snap, now) {
  const st = computeStatus(snap, now)
  const titles = snap.plan?.titles ?? {}
  const timeline = [
    ...(snap.events ?? []).map((e) => ({ at: e.at, text: eventText(e, titles) })),
    ...(snap.git?.commits ?? []).map((c) => ({ at: c.at, text: `📦 Commit: ${sanitize(c.subject, 90)}` })),
  ]
    .filter((x) => x.text && x.at)
    .sort((a, b) => b.at - a.at)
    .slice(0, 14)
  const signals = [
    snap.git?.lastChangeAt ? { at: snap.git.lastChangeAt, text: 'Archivo del proyecto modificado' } : null,
    snap.git?.commits?.[0] ? { at: snap.git.commits[0].at, text: 'Commit' } : null,
    ...(snap.events ?? []).slice(-1).map((e) => ({ at: e.at, text: eventText(e, titles) })),
  ].filter((x) => x?.text)
  const lastSignal = signals.sort((a, b) => b.at - a.at)[0] ?? null
  return {
    generatedAt: now,
    bridgeBeatAt: snap.bridgeBeatAt ?? now,
    status: st.code,
    detail: st.detail,
    task: st.task ?? null,
    progress: st.progress ?? null,
    claude: snap.procs?.claude ? { since: snap.procs.claude.since } : null,
    lastSignal,
    dirty: snap.git?.dirty ?? 0,
    timeline,
    stages: stageList(snap.plan, st.task?.stage ?? null),
    blueprint: snap.blueprint ?? null,
    github: {
      ok: snap.github?.ok ?? false,
      at: snap.github?.at ?? null,
      comments: (snap.github?.comments ?? []).slice(-4).reverse().map((c) => ({ who: c.who, at: c.at, title: sanitize(c.title, 100) })),
    },
  }
}

// ---- Varios proyectos ----
// Cada puente escribe su propio status.json (la vista ya limpia) en SU carpeta de estado. El monitor solo lee
// los proyectos del registro (tools/monitor-projects.json), y de cada uno solo ese archivo. Lo vuelve a validar
// y a limpiar: un archivo ajeno o falso nunca enseña rutas, comandos ni actividad inventada.

export const STATUS_FILE = 'status.json'
export const STATUS_FORMAT = 'ikral-monitor/1'
/** Un status.json más grande que esto no se lee (nadie legítimo lo necesita). */
export const MAX_STATUS_BYTES = 512 * 1024

/** El proyecto de este repo (si el registro no se puede leer, el monitor sigue enseñándolo a él). */
export const OWN_PROJECT = {
  id: 'ikral-studio',
  name: 'IKRAL Studio',
  label: 'Editor de storyboard',
  source: { type: 'github-issue', repo: 'ikral-studio/coordinacion', issue: 1 },
  statusDir: 'propio',
  panelFicha: null,
  problem: null,
}

const PROJECT_ID = /^[a-z0-9][a-z0-9-]{0,39}$/

/** «~/x» → ruta absoluta, solo si queda dentro de root (la zona del monitor). Si no, null. */
export function resolveInside(dir, home, root) {
  const s = String(dir ?? '')
  const abs = s.startsWith('~/') ? join(home, s.slice(2)) : s
  if (!isAbsolute(abs)) return null
  const r = resolve(abs)
  return r.startsWith(resolve(root) + sep) ? r : null
}

const cleanSource = (s) =>
  s?.type === 'github-issue' && /^[\w.-]+\/[\w.-]+$/.test(s.repo ?? '') && Number.isInteger(s.issue) && s.issue > 0 ? { type: s.type, repo: s.repo, issue: s.issue } : null
const sameSource = (a, b) => JSON.stringify(cleanSource(a)) === JSON.stringify(cleanSource(b))

/**
 * Registro de proyectos autorizados → { projects, errors }. Cada proyecto: { id, name, label, source, statusDir, panelFicha, problem }.
 * statusDir null = sin puente («No conectado»). Una carpeta fuera de root no se lee nunca (problem).
 * panelFicha = nombre de su ficha en el Panel de IKRAL (la fuente oficial); null = sin enlazar todavía. El registro
 * no reemplaza al Panel: solo dice dónde leer el estado en vivo.
 */
export function parseRegistry(data, { home, root }) {
  const projects = []
  const errors = []
  const seen = new Set()
  for (const raw of Array.isArray(data?.projects) ? data.projects : []) {
    const id = String(raw?.id ?? '')
    if (!PROJECT_ID.test(id) || seen.has(id)) {
      errors.push('Hay un proyecto con identificador no válido o repetido: no se muestra.')
      continue
    }
    seen.add(id)
    let statusDir = null
    let problem = null
    if (raw.statusDir) {
      statusDir = resolveInside(raw.statusDir, home, root)
      if (!statusDir) problem = 'Su carpeta de estado no está en la zona permitida del monitor: no se lee.'
    }
    projects.push({ id, name: sanitize(raw.name, 40) || id, label: sanitize(raw.label ?? '', 60), source: cleanSource(raw.source), statusDir, panelFicha: sanitize(raw.panelFicha ?? '', 80) || null, problem })
  }
  return { projects, errors }
}

/** Lo que un puente guarda en su status.json: su vista + quién es (para comprobar el origen). */
export const statusPayload = (project, view) => ({ format: STATUS_FORMAT, project: project.id, source: cleanSource(project.source), ...view })

const num = (x) => (typeof x === 'number' && Number.isFinite(x) && x > 0 ? x : null)
const arr = (x, max) => (Array.isArray(x) ? x.slice(0, max) : [])
const STAGE_STATES = new Set(['closed', 'current', 'next', 'later'])
const count = (x) => (Number.isInteger(x) && x >= 0 && x <= 999 ? x : 0)
const bpItem = (x) => (/^[\w.-]{1,8}$/.test(x?.id ?? '') && sanitize(x.titulo, 80) ? { id: x.id, titulo: sanitize(x.titulo, 80) } : null)

/** Resumen del Blueprint (de tools/blueprint-core.mjs summarize) validado y limpio; null si no hay o no cuadra. */
export function cleanBlueprint(b) {
  if (!b || typeof b !== 'object') return null
  const total = count(b.total)
  const hechas = count(b.hechas)
  if (!total || hechas > total) return null
  return {
    total,
    hechas,
    enCurso: count(b.enCurso),
    bloqueadas: count(b.bloqueadas),
    pendientes: count(b.pendientes),
    aprobadas: count(b.aprobadas),
    fase: b.fase && /^[\w.-]{1,8}$/.test(b.fase.id ?? '') ? { id: b.fase.id, titulo: sanitize(b.fase.titulo, 60) } : null,
    siguiente: bpItem(b.siguiente),
    bloqueos: arr(b.bloqueos, 8).map(bpItem).filter(Boolean),
  }
}

/**
 * Vista segura de un proyecto a partir de su status.json (texto u objeto; null = no existe).
 * Todo se vuelve a validar y limpiar. Sin datos → «No conectado»; nunca se finge actividad.
 */
export function projectView(project, raw, now) {
  const off = (status, detail) => ({ connected: false, status, detail, stale: false, generatedAt: null, task: null, progress: null, claude: null, lastSignal: null, dirty: 0, timeline: [], stages: [], blueprint: null, github: null })
  if (project.problem) return off('error', project.problem)
  if (!project.statusDir) return off('disconnected', 'Este proyecto no tiene puente conectado. No se muestra actividad.')
  if (raw == null) return off('disconnected', 'Su puente todavía no ha escrito datos. No se muestra actividad.')
  let d = raw
  if (typeof raw === 'string')
    try {
      d = JSON.parse(raw)
    } catch {
      return off('error', 'Sus datos están dañados o incompletos: no se muestran.')
    }
  if (d?.format !== STATUS_FORMAT) return off('error', 'Sus datos tienen un formato desconocido: no se muestran.')
  if (d.project !== project.id || !sameSource(d.source, project.source)) return off('error', 'Los datos no son de este proyecto (el origen no coincide): no se muestran.')
  const generatedAt = num(d.generatedAt)
  if (!generatedAt) return off('error', 'Sus datos no dicen cuándo se escribieron: no se muestran.')
  const status = STATUS[d.status] && !['nosignal', 'disconnected'].includes(d.status) ? d.status : 'error'
  const item = (x, max) => (num(x?.at) && sanitize(x.text, max) ? { at: x.at, text: sanitize(x.text, max) } : null)
  return {
    connected: true,
    status,
    detail: sanitize(d.detail, 240) || STATUS[status].label,
    stale: isStale(generatedAt, now, STALE_MS),
    generatedAt,
    bridgeBeatAt: num(d.bridgeBeatAt) ?? generatedAt,
    task: d.task && sanitize(d.task.name, 100) ? { name: sanitize(d.task.name, 100), startedAt: num(d.task.startedAt), attempt: num(d.task.attempt) ?? 1 } : null,
    progress: d.progress ? { stalled: d.progress.stalled === true } : null,
    claude: d.claude ? { since: num(d.claude.since) } : null,
    lastSignal: item(d.lastSignal, 110),
    dirty: Math.min(num(d.dirty) ?? 0, 9999),
    timeline: arr(d.timeline, 14).map((x) => item(x, 110)).filter(Boolean),
    stages: arr(d.stages, 60)
      .filter((x) => /^[\w.-]{1,8}$/.test(x?.id ?? '') && STAGE_STATES.has(x.state))
      .map((x) => ({ id: x.id, title: sanitize(x.title, 70), state: x.state })),
    blueprint: cleanBlueprint(d.blueprint),
    github: d.github
      ? {
          ok: d.github.ok === true,
          at: num(d.github.at),
          comments: arr(d.github.comments, 4)
            .filter((c) => num(c?.at))
            .map((c) => ({ who: ['ChatGPT', 'Claude', 'Puente', 'Director'].includes(c.who) ? c.who : 'Director', at: c.at, title: sanitize(c.title, 100) })),
        }
      : null,
  }
}

/** Última actividad conocida de un proyecto (para la vista general). */
const lastActivity = (v) => Math.max(0, v.lastSignal?.at ?? 0, ...v.timeline.map((x) => x.at)) || null

const ts = (at) => (at ? `<span class="ago" data-ts="${Number(at)}">${esc(ago(Date.now() - at))}</span> <small>(${esc(clock(at))})</small>` : '—')
const sourceText = (s) => (s ? `Issue #${s.issue} de ${s.repo}` : 'sin origen registrado')
const fichaText = (p) => `Ficha en el Panel de IKRAL: ${p.panelFicha ? esc(p.panelFicha) : 'sin enlazar todavía'}`
const bpLine = (b) => `Blueprint: ${b.hechas} de ${b.total} hechas${b.siguiente ? ` · siguiente: ${b.siguiente.id}` : ''}`

function renderBlueprint(b) {
  if (!b) return ''
  return `<div class="card"><h2>Blueprint (checklist)</h2>
<div><b>${b.hechas} de ${b.total}</b> hechas · ${b.enCurso} en curso · ${b.bloqueadas} bloqueadas · ${b.pendientes} pendientes · ✅ ${b.aprobadas} aprobadas por el director</div>
${b.fase ? `<div>Fase actual: ${esc(b.fase.id)} · ${esc(b.fase.titulo)}</div>` : ''}
<div>Siguiente: ${b.siguiente ? `${esc(b.siguiente.id)} · ${esc(b.siguiente.titulo)}` : 'nada pendiente'}</div>
${b.bloqueos.length ? `<div class="warn">Bloqueos: ${b.bloqueos.map((x) => `${esc(x.id)} · ${esc(x.titulo)}`).join(' — ')}</div>` : ''}
<p class="muted">«Hecho» solo con evidencia verificable (commit, prueba, URL o decisión del director).</p></div>`
}

function renderProject({ project: p, view: v }) {
  const s = STATUS[v.status] ?? STATUS.idle
  const stageIcon = { closed: '✓', current: '▶', next: '→', later: '·' }
  const rows = (items, fn) => items.map(fn).join('')
  const head = `<h2 class="pname">${esc(p.name)}${p.label ? ` <small>· ${esc(p.label)}</small>` : ''}</h2>`
  if (!v.connected)
    return `<section class="proj" id="s-${esc(p.id)}" data-id="${esc(p.id)}" data-title="${esc(`${s.icon} ${s.label} · ${p.name}`)}">${head}
<div class="badge live" style="background:${s.color}">${esc(s.icon)}<div>${esc(s.label)}<small>${esc(v.detail)}</small></div></div>
<p class="muted">Origen: ${esc(sourceText(p.source))}. ${fichaText(p)}.</p></section>`
  return `<section class="proj${v.stale ? ' stale' : ''}" id="s-${esc(p.id)}" data-id="${esc(p.id)}" data-gen="${v.generatedAt}" data-title="${esc(`${s.icon} ${s.label} · ${p.name}`)}" data-stale-title="${esc(`${STATUS.nosignal.icon} ${STATUS.nosignal.label} · ${p.name}`)}">${head}
<div class="badge stalebadge" style="background:${STATUS.nosignal.color}">${STATUS.nosignal.icon}<div>${STATUS.nosignal.label}<small>Sus datos no se actualizan desde <span class="ago" data-ts="${v.generatedAt}"></span>. Puede que el Mac esté dormido, sin red o su puente apagado. Lo de abajo es el último estado conocido.</small></div></div>
<div class="badge live" style="background:${s.color}">${esc(s.icon)}<div>${esc(s.label)}<small>${esc(v.detail)}</small></div></div>
<div class="card">
${v.task ? `<h2>${esc(v.task.name)}</h2>` : '<h2 class="muted">Sin tarea en curso</h2>'}
${v.task?.startedAt ? `<div>Empezó ${ts(v.task.startedAt)}${v.task.attempt > 1 ? ` · intento ${v.task.attempt}` : ''}</div>` : ''}
<div>Claude Code: ${v.claude ? `<b>corriendo</b>${v.claude.since ? ` desde ${ts(v.claude.since)}` : ''}` : 'no está corriendo'}</div>
<div>Última señal verificable: ${v.lastSignal ? `${esc(v.lastSignal.text)} · ${ts(v.lastSignal.at)}` : '—'}</div>
${v.progress?.stalled ? '<div class="warn">Sigue en ejecución, pero sin avances nuevos.</div>' : ''}
${v.dirty ? `<div class="muted">${v.dirty} archivo(s) con cambios todavía sin commit.</div>` : ''}
</div>
${renderBlueprint(v.blueprint)}
${v.stages.length ? `<div class="card"><h2>Etapas del plan</h2><div class="stages">${rows(v.stages, (x) => `<span class="st ${x.state}" title="${esc(x.title)}">${stageIcon[x.state]} ${esc(x.id)}${x.title ? ` · ${esc(x.title)}` : ''}</span>`)}</div>
<p class="muted">✓ cerrada · ▶ en curso · → la siguiente</p></div>` : ''}
<div class="grid">
${v.timeline.length ? `<div class="card"><h2>Historial reciente</h2><ul>${rows(v.timeline, (x) => `<li>${esc(x.text)}<br>${ts(x.at)}</li>`)}</ul></div>` : ''}
${v.github ? `<div class="card"><h2>Últimos comentarios en GitHub</h2><ul>${v.github.comments.length ? rows(v.github.comments, (c) => `<li><b>${esc(c.who)}</b>: ${esc(c.title)}<br>${ts(c.at)}</li>`) : '<li class="muted">Todavía nada.</li>'}</ul>
<p class="muted">${v.github.ok ? `Leído ${ts(v.github.at)}` : `<span class="warn">GitHub sin conexión</span>${v.github.at ? ` · último dato ${ts(v.github.at)}` : ''}`}</p></div>` : ''}
</div>
<p class="muted">${fichaText(p)}.</p>
<p class="muted">Origen: ${esc(sourceText(p.source))} · su puente: última vuelta ${ts(v.bridgeBeatAt)} · datos escritos ${ts(v.generatedAt)}.</p></section>`
}

function renderCard({ project: p, view: v }) {
  const s = STATUS[v.status] ?? STATUS.idle
  const last = lastActivity(v)
  const what = v.connected ? (v.task?.name ?? v.detail) : v.detail
  return `<a class="pc${v.stale ? ' stale' : ''}" href="#p-${esc(p.id)}" data-id="${esc(p.id)}"${v.connected ? ` data-gen="${v.generatedAt}"` : ''}>
<span class="lbl live" style="background:${s.color}">${esc(s.icon)} ${esc(s.label)}</span><span class="lbl stalebadge" style="background:${STATUS.nosignal.color}">${STATUS.nosignal.icon} ${STATUS.nosignal.label}</span>
<b>${esc(p.name)}</b><small>${esc(what)}</small>${v.blueprint ? `<small>${esc(bpLine(v.blueprint))}</small>` : ''}<small>Última actividad: ${last ? ts(last) : '—'}</small></a>`
}

/**
 * Página única para todos los proyectos: vista general arriba (una tarjeta por proyecto) y el detalle del elegido.
 * items = [{ project, view: projectView(...) }]. Se recarga sola; cada proyecto se marca «Sin señal» por su cuenta.
 */
export function renderDashboard(items, now, errors = []) {
  const first = items[0]
  const s = first ? (STATUS[first.view.status] ?? STATUS.idle) : STATUS.idle
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<meta http-equiv="refresh" content="15">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(first ? `${s.icon} ${s.label} · ${first.project.name}` : 'Sin proyectos')} · Monitor IKRAL</title>
<style>
:root{font-family:-apple-system,system-ui,sans-serif;color:#111827;background:#f3f4f6}
body{max-width:860px;margin:0 auto;padding:24px;line-height:1.45}
.card{background:#fff;border-radius:16px;padding:18px 22px;margin:0 0 16px;box-shadow:0 1px 3px #0001}
.badge{display:flex;align-items:center;gap:14px;font-size:34px;font-weight:700;color:#fff;border-radius:16px;padding:18px 22px;margin-bottom:16px}
.badge small{display:block;font-size:17px;font-weight:500;opacity:.95}
h1{font-size:15px;margin:0 0 10px;color:#6b7280;font-weight:600}
h2{font-size:16px;margin:0 0 10px}.pname{font-size:22px;margin:8px 0 12px}
ul{list-style:none;padding:0;margin:0}li{padding:5px 0;border-bottom:1px solid #f1f1f1}li:last-child{border:0}
.muted,small{color:#6b7280}.warn{color:#b45309;font-weight:600}.badge small{color:#fff}
.stages{display:flex;flex-wrap:wrap;gap:8px}.st{border-radius:10px;padding:6px 10px;background:#f3f4f6;font-size:14px}
.st.closed{background:#dcfce7}.st.current{background:#2563eb;color:#fff;font-weight:700}.st.next{background:#dbeafe}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}@media(max-width:640px){.grid{grid-template-columns:1fr}}
.overview{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px;margin-bottom:20px}
.pc{display:flex;flex-direction:column;gap:4px;background:#fff;border-radius:14px;padding:12px 14px;box-shadow:0 1px 3px #0001;color:inherit;text-decoration:none;border:3px solid transparent}
.pc.on{border-color:#2563eb}.lbl{align-self:flex-start;color:#fff;border-radius:8px;padding:2px 8px;font-size:14px;font-weight:600}
.stalebadge{display:none}.stale .stalebadge{display:flex}.pc.stale .lbl.live{display:none}.proj.stale .live{opacity:.45}
</style></head><body>
<h1>Monitor en vivo · Proyectos IKRAL · solo lectura</h1>
<nav class="overview">${items.map(renderCard).join('')}</nav>
${errors.map((e) => `<p class="warn">${esc(e)}</p>`).join('')}
${items.length ? items.map(renderProject).join('\n') : '<p class="muted">No hay proyectos en el registro.</p>'}
<p class="muted">Página escrita ${ts(now)}. Se actualiza sola cada 15 s. Elige un proyecto arriba para ver su detalle.</p>
<script>
const STALE=${STALE_MS};const ago=${ago.toString()};const isStale=${isStale.toString()};
const ids=[...document.querySelectorAll('.proj')].map(s=>s.dataset.id);let cur=null;
function sel(id){cur=id;document.querySelectorAll('.proj').forEach(s=>s.hidden=s.dataset.id!==id);
document.querySelectorAll('.pc').forEach(c=>c.classList.toggle('on',c.dataset.id===id));try{localStorage.setItem('monitor-proyecto',id)}catch(e){}}
function pick(){const h=location.hash.slice(3);let m=null;try{m=localStorage.getItem('monitor-proyecto')}catch(e){}
sel(ids.includes(h)?h:ids.includes(m)?m:ids[0]);tick()}
function tick(){const n=Date.now();document.querySelectorAll('.ago').forEach(e=>e.textContent=ago(n-Number(e.dataset.ts)));
document.querySelectorAll('[data-gen]').forEach(e=>e.classList.toggle('stale',isStale(Number(e.dataset.gen),n,STALE)));
const s=document.querySelector('.proj:not([hidden])');if(s)document.title=(s.classList.contains('stale')?s.dataset.staleTitle:s.dataset.title)+' · Monitor IKRAL'}
window.addEventListener('hashchange',pick);if(ids.length)pick();setInterval(tick,1000);
</script>
</body></html>
`
}

/** Página de un solo proyecto (el de este repo) a partir de su vista. */
export function renderHtml(v) {
  return renderDashboard([{ project: OWN_PROJECT, view: projectView(OWN_PROJECT, statusPayload(OWN_PROJECT, v), v.generatedAt) }], v.generatedAt)
}
