// Lógica pura del monitor del puente (sin red, sin disco): se prueba en tools/coord-monitor.test.mjs.
// El monitor es una página que el puente reescribe en cada vuelta de launchd. Solo lectura.
// Solo muestra señales comprobables: procesos vivos, estado del puente, commits, cambios en disco y GitHub.
// Nunca muestra comandos, rutas, nombres de archivo, registros internos ni credenciales.
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
    github: {
      ok: snap.github?.ok ?? false,
      at: snap.github?.at ?? null,
      comments: (snap.github?.comments ?? []).slice(-4).reverse().map((c) => ({ who: c.who, at: c.at, title: sanitize(c.title, 100) })),
    },
  }
}

const ts = (at) => (at ? `<span class="ago" data-ts="${Number(at)}">${esc(ago(Date.now() - at))}</span> <small>(${esc(clock(at))})</small>` : '—')

/** HTML autónomo. Se recarga solo y el reloj corre en vivo; si deja de actualizarse, enseña «Sin señal». */
export function renderHtml(v) {
  const s = STATUS[v.status] ?? STATUS.idle
  const stageIcon = { closed: '✓', current: '▶', next: '→', later: '·' }
  const rows = (items, fn) => (items.length ? items.map(fn).join('') : '<li class="muted">Todavía nada.</li>')
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<meta http-equiv="refresh" content="15">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(s.icon)} ${esc(s.label)} · Monitor IKRAL Studio</title>
<style>
:root{font-family:-apple-system,system-ui,sans-serif;color:#111827;background:#f3f4f6}
body{max-width:860px;margin:0 auto;padding:24px;line-height:1.45}
.card{background:#fff;border-radius:16px;padding:18px 22px;margin:0 0 16px;box-shadow:0 1px 3px #0001}
.badge{display:flex;align-items:center;gap:14px;font-size:34px;font-weight:700;color:#fff;border-radius:16px;padding:18px 22px;margin-bottom:16px}
.badge small{display:block;font-size:17px;font-weight:500;opacity:.95}
h1{font-size:15px;margin:0 0 6px;color:#6b7280;font-weight:600}
h2{font-size:16px;margin:0 0 10px}
ul{list-style:none;padding:0;margin:0}li{padding:5px 0;border-bottom:1px solid #f1f1f1}li:last-child{border:0}
.muted,small{color:#6b7280}.warn{color:#b45309;font-weight:600}
.stages{display:flex;flex-wrap:wrap;gap:8px}.st{border-radius:10px;padding:6px 10px;background:#f3f4f6;font-size:14px}
.st.closed{background:#dcfce7}.st.current{background:#2563eb;color:#fff;font-weight:700}.st.next{background:#dbeafe}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}@media(max-width:640px){.grid{grid-template-columns:1fr}}
#stale{display:none}
</style></head><body>
<h1>Monitor en vivo · IKRAL Studio · solo lectura</h1>
<div id="stale" class="badge" style="background:${STATUS.nosignal.color}">${STATUS.nosignal.icon}<div>${STATUS.nosignal.label}<small>La página no se actualiza desde <span class="ago" data-ts="${v.generatedAt}"></span>. Puede que el Mac esté dormido, sin red o el puente apagado. Lo de abajo es el último estado conocido.</small></div></div>
<div id="live" class="badge" style="background:${s.color}">${esc(s.icon)}<div>${esc(s.label)}<small>${esc(v.detail)}</small></div></div>
<div class="card">
${v.task ? `<h2>${esc(v.task.name)}</h2>` : '<h2 class="muted">Sin tarea en curso</h2>'}
${v.task?.startedAt ? `<div>Empezó ${ts(v.task.startedAt)}${v.task.attempt > 1 ? ` · intento ${v.task.attempt}` : ''}</div>` : ''}
<div>Claude Code: ${v.claude ? `<b>corriendo</b>${v.claude.since ? ` desde ${ts(v.claude.since)}` : ''}` : 'no está corriendo'}</div>
<div>Última señal verificable: ${v.lastSignal ? `${esc(v.lastSignal.text)} · ${ts(v.lastSignal.at)}` : '—'}</div>
${v.progress?.stalled ? '<div class="warn">Sigue en ejecución, pero sin avances nuevos.</div>' : ''}
${v.dirty ? `<div class="muted">${v.dirty} archivo(s) con cambios todavía sin commit.</div>` : ''}
</div>
<div class="card"><h2>Etapas del plan</h2><div class="stages">${v.stages.map((x) => `<span class="st ${x.state}" title="${esc(x.title)}">${stageIcon[x.state]} ${esc(x.id)}${x.title ? ` · ${esc(x.title)}` : ''}</span>`).join('')}</div>
<p class="muted">✓ cerrada · ▶ en curso · → la siguiente</p></div>
<div class="grid">
<div class="card"><h2>Historial reciente</h2><ul>${rows(v.timeline, (x) => `<li>${esc(x.text)}<br>${ts(x.at)}</li>`)}</ul></div>
<div class="card"><h2>Últimos comentarios en GitHub</h2><ul>${rows(v.github.comments, (c) => `<li><b>${esc(c.who)}</b>: ${esc(c.title)}<br>${ts(c.at)}</li>`)}</ul>
<p class="muted">${v.github.ok ? `Leído ${ts(v.github.at)}` : `<span class="warn">GitHub sin conexión</span>${v.github.at ? ` · último dato ${ts(v.github.at)}` : ''}`}</p></div>
</div>
<p class="muted">Puente: última vuelta ${ts(v.bridgeBeatAt)} · página escrita ${ts(v.generatedAt)}. Se actualiza sola cada 15 s.</p>
<script>
const GEN=${Number(v.generatedAt)},STALE=${STALE_MS};const ago=${ago.toString()};const isStale=${isStale.toString()};
function tick(){const n=Date.now();document.querySelectorAll('.ago').forEach(e=>e.textContent=ago(n-Number(e.dataset.ts)));
const old=isStale(GEN,n,STALE);document.getElementById('stale').style.display=old?'flex':'none';document.getElementById('live').style.opacity=old?.45:1;
if(old)document.title='${STATUS.nosignal.icon} ${STATUS.nosignal.label} · Monitor IKRAL Studio'}
tick();setInterval(tick,1000);
</script>
</body></html>
`
}
