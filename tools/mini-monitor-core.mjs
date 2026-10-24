// Lógica pura del IKRAL Mini Monitor (sin red, sin disco): se prueba en tools/mini-monitor.test.mjs.
// El puente escribe mini.json en cada vuelta (junto a status.json y monitor.html). La app de Mac
// (mac/ikral-monitor) solo lee ese archivo: no es otra base de datos y no lee nada más.
// Reglas: una línea «Ahora» y una «Te necesito» (≤200 caracteres), «Sin señal» si los datos son viejos,
// y la cuota de Claude Code SOLO si viene de una fuente verificable: el JSON que Claude Code da a su
// statusLine (tools/usage-statusline.mjs lo guarda en usage.json). Si no: «Uso no disponible».
import { STALE_MS, STATUS, ago, isStale, sanitize } from './coord-monitor-core.mjs'

export const MINI_FILE = 'mini.json'
export const MINI_FORMAT = 'ikral-mini/1'
export const USAGE_FILE = 'usage.json'
export const USAGE_FORMAT = 'ikral-usage/1'
/** Donde el director ve su uso a mano cuando no hay dato verificable. */
export const USAGE_URL = 'https://claude.ai/settings/usage'
export const LINE_MAX = 200

/** Los 4 estados de la mini app (los del monitor grande se agrupan aquí). */
export const MINI_STATUS = {
  working: { label: 'Trabajando', icon: '🟢', color: '#16a34a' },
  waiting: { label: 'Esperando', icon: '🟡', color: '#ca8a04' },
  blocked: { label: 'Bloqueado', icon: '🔴', color: '#dc2626' },
  nosignal: { label: 'Sin señal', icon: '⚫', color: '#111827' },
}

/** Estado del monitor grande → estado de la mini app. */
export function miniCode(view, now) {
  if (!view?.connected || view.status === 'disconnected' || view.status === 'nosignal') return 'nosignal'
  if (view.generatedAt && isStale(view.generatedAt, now, STALE_MS)) return 'nosignal'
  if (view.status === 'working') return 'working'
  if (view.status === 'error') return 'blocked'
  return 'waiting'
}

const line = (t) => sanitize(t, LINE_MAX)

/**
 * Procesos de Claude Code que NO cuelgan del puente (ventanas interactivas). Solo se cuentan: abierta no
 * significa trabajando, y los comandos no salen de aquí.
 */
export function countInteractiveClaude(psText, bridgePid) {
  const rows = []
  for (const l of String(psText ?? '').split('\n')) {
    const m = /^\s*(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/.exec(l)
    if (m) rows.push({ pid: Number(m[1]), ppid: Number(m[2]), args: m[4] })
  }
  const parent = new Map(rows.map((r) => [r.pid, r.ppid]))
  const isClaude = (r) => /(^|\/)claude(\s|$)/.test(r.args)
  const underBridge = (pid) => {
    for (let p = pid, n = 0; p && n < 64; p = parent.get(p), n++) if (bridgePid && p === bridgePid) return true
    return false
  }
  return rows.filter((r) => isClaude(r) && !underBridge(r.pid)).length
}

/** Hasta aquí una lectura se llama «reciente»; después se enseña igual, pero como «última lectura HH:mm». */
export const USAGE_FRESH_MS = 10 * 60 * 1000
/** Ningún dato de cuota vive más que esto (la ventana más larga de Claude Code es de 7 días). */
export const USAGE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
const FIVE_HOURS = 5 * 60 * 60 * 1000
export const USAGE_SOURCE = 'statusline de Claude Code'

const pctOf = (x) => (typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= 100 ? x : null)

/** resets_at llega en segundos Unix (docs de statusline); también se aceptan milisegundos o texto ISO. */
export function toMs(x) {
  if (typeof x === 'string' && x.trim()) {
    const n = Number(x)
    x = Number.isFinite(n) ? n : Date.parse(x)
  }
  if (typeof x !== 'number' || !Number.isFinite(x) || x <= 0) return null
  return x < 1e12 ? Math.round(x * 1000) : Math.round(x)
}

/**
 * Del JSON que Claude Code manda por stdin a su statusLine (code.claude.com/docs/en/statusline) solo se toman
 * rate_limits.five_hour/seven_day (used_percentage, resets_at) y la versión. Nada de rutas, costos, transcript
 * ni id de sesión en claro. null si no viene rate_limits (antes de la primera respuesta, o cuenta sin ese dato):
 * entonces no se escribe nada y se queda la última lectura buena.
 */
export function usageFromStatusline(input, now, opts = {}) {
  let d = input
  if (typeof input === 'string')
    try {
      d = JSON.parse(input)
    } catch {
      return null
    }
  const rl = d?.rate_limits
  if (!rl || typeof rl !== 'object') return null
  const win = (w) => {
    const usedPct = pctOf(w?.used_percentage)
    return usedPct === null ? null : { usedPct, resetsAt: toMs(w?.resets_at) }
  }
  const session = win(rl.five_hour)
  const week = win(rl.seven_day)
  if (!session && !week) return null
  const out = { format: USAGE_FORMAT, source: USAGE_SOURCE, at: now, session, week }
  if (typeof d.version === 'string') out.version = sanitize(d.version, 20)
  if (typeof opts.sessionKey === 'string' && opts.sessionKey) out.sessionKey = opts.sessionKey.slice(0, 16)
  if (typeof opts.account === 'string' && opts.account.trim()) out.account = sanitize(opts.account, 60)
  return out
}

/**
 * Cuota de Claude Code desde usage.json (texto u objeto). Solo se acepta si dice de dónde salió (source),
 * cuándo (at: ni del futuro ni de hace más de 7 días) y trae porcentajes entre 0 y 100. Cada ventana deja de
 * enseñarse al pasar su hora de reinicio: ese % ya no vale y no se inventa otro. opts.account: si se da y el
 * dato es de otra cuenta, no se enseña. Cualquier otra cosa → no disponible.
 */
export function cleanUsage(raw, now, opts = {}) {
  const none = (text = 'Uso no disponible') => ({ available: false, text, url: USAGE_URL })
  if (raw == null) return none()
  let d = raw
  if (typeof raw === 'string')
    try {
      d = JSON.parse(raw)
    } catch {
      return none()
    }
  if (d?.format !== USAGE_FORMAT || typeof d.source !== 'string' || !d.source.trim()) return none()
  const at = typeof d.at === 'number' && Number.isFinite(d.at) ? d.at : null
  if (!at || at > now + 60_000 || now - at > USAGE_MAX_AGE_MS) return none()
  if (opts.account && d.account !== opts.account) return none('Uso de otra cuenta: esperando un dato de esta')
  const win = (w, maxAge) => {
    const usedPct = pctOf(w?.usedPct)
    if (usedPct === null) return { v: null, reset: false }
    const resetsAt = toMs(w?.resetsAt)
    // Ya reinició (o, sin hora de reinicio, es más viejo que la ventana): ese % ya no vale.
    if ((resetsAt && now >= resetsAt) || (!resetsAt && now - at > maxAge)) return { v: null, reset: true }
    return { v: { usedPct: Math.round(usedPct), resetsAt }, reset: false }
  }
  const s = win(d.session, FIVE_HOURS)
  const w = win(d.week, USAGE_MAX_AGE_MS)
  if (!s.v && !w.v) return none(s.reset || w.reset ? 'La cuota ya se reinició: esperando un dato nuevo de Claude Code' : 'Uso no disponible')
  return {
    available: true,
    source: sanitize(d.source, 60),
    at,
    fresh: now - at <= USAGE_FRESH_MS,
    session: s.v,
    week: w.v,
    sessionReset: s.reset,
    weekReset: w.reset,
    url: USAGE_URL,
  }
}

const clock = (ts) => new Date(ts).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false })
const dayClock = (ts) => `${new Date(ts).toLocaleDateString('es-MX', { weekday: 'short' }).replace('.', '')} ${clock(ts)}`

/** «Sesión 61% (reinicia 15:09) · Semana 6% (reinicia sáb 10:00) · leído 14:02», o por qué no hay dato. */
export function usageText(u) {
  if (!u?.available) return u?.text ?? 'Uso no disponible'
  const part = (name, x, fmt) => (x ? `${name} ${x.usedPct}%${x.resetsAt ? ` (reinicia ${fmt(x.resetsAt)})` : ''}` : null)
  return [part('Sesión', u.session, clock), part('Semana', u.week, dayClock), `${u.fresh ? 'leído' : 'última lectura'} ${clock(u.at)}`].filter(Boolean).join(' · ')
}

/** Qué está pasando, en una línea. */
function nowLine(code, v, now) {
  if (code === 'nosignal') return v?.connected ? `Sin datos nuevos ${ago(now - v.generatedAt)}. Lo último: ${v.task?.name ?? v.detail}` : (v?.detail ?? 'Sin datos del puente.')
  if (code === 'working') return `${v.task?.name ?? 'Tarea en curso'}. ${v.progress?.stalled ? 'Sigue, pero sin avances nuevos.' : v.detail}`
  return v.task?.name ? `${v.task.name}. ${v.detail}` : v.detail
}

/** Qué necesita del director, en una línea. «Nada por ahora» si no hay nada. */
function needLine(code, v) {
  if (code === 'nosignal') return 'Mira si el Mac está dormido o sin red. Si sigue así, avísale a Claude.'
  if (v.status === 'approval') return 'Tu «sí» para publicar (todas las etapas autorizadas están cerradas).'
  if (code === 'blocked') return `Revisar: ${v.detail}`
  const b = v.blueprint?.bloqueos?.length ?? 0
  return b ? `Nada urgente. ${b} bloqueo(s) esperan en el Blueprint.` : 'Nada por ahora.'
}

/**
 * Vista corta para la mini app a partir de la vista segura del proyecto (projectView). Todo ya limpio.
 * extra = { usage (cleanUsage), interactiveClaude (número) }.
 */
export function miniView(project, view, now, extra = {}) {
  const code = miniCode(view, now)
  const s = MINI_STATUS[code]
  const src = project?.source
  const last = [view?.lastSignal, ...(view?.timeline ?? [])].filter((x) => x?.at).sort((a, b) => b.at - a.at)[0] ?? null
  const usage = extra.usage ?? cleanUsage(null, now)
  const ahora = line(nowLine(code, view ?? {}, now))
  const teNecesito = line(needLine(code, view ?? {}))
  return {
    format: MINI_FORMAT,
    generatedAt: now,
    staleMs: STALE_MS,
    code,
    label: s.label,
    icon: s.icon,
    color: s.color,
    project: sanitize(project?.name ?? 'IKRAL Studio', 40),
    ahora,
    teNecesito,
    lastActivity: last ? { at: last.at, text: sanitize(last.text, 110) } : null,
    link: src ? `https://github.com/${src.repo}/issues/${src.issue}` : null,
    bridge: { beatAt: view?.bridgeBeatAt ?? null, claudeRunning: Boolean(view?.claude), status: STATUS[view?.status]?.label ?? null },
    interactiveClaude: Number.isInteger(extra.interactiveClaude) && extra.interactiveClaude >= 0 ? extra.interactiveClaude : null,
    usage,
    usageText: usageText(usage),
    speech: line(`${s.label}. ${ahora} Te necesito: ${teNecesito}`),
    staleSpeech: line(`Sin señal. Los datos no se actualizan. ${needLine('nosignal', {})}`),
  }
}
