// Lógica pura del IKRAL Mini Monitor (sin red, sin disco): se prueba en tools/mini-monitor.test.mjs.
// El puente escribe mini.json en cada vuelta (junto a status.json y monitor.html). La app de Mac
// (mac/ikral-monitor) solo lee ese archivo: no es otra base de datos y no lee nada más.
// Reglas: una línea «Ahora» y una «Te necesito» (≤200 caracteres), «Sin señal» si los datos son viejos,
// y la cuota de Claude Code SOLO si viene de una fuente verificable (si no: «Uso no disponible»).
import { STALE_MS, STATUS, ago, isStale, sanitize } from './coord-monitor-core.mjs'

export const MINI_FILE = 'mini.json'
export const MINI_FORMAT = 'ikral-mini/1'
export const USAGE_FILE = 'usage.json'
export const USAGE_FORMAT = 'ikral-usage/1'
/** Un dato de cuota más viejo que esto ya no se enseña (la cuota cambia rápido). */
export const USAGE_STALE_MS = 10 * 60 * 1000
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

/**
 * Cuota de Claude Code desde usage.json (texto u objeto). Solo se acepta si dice de dónde salió (source),
 * cuándo (at, reciente) y trae porcentajes entre 0 y 100. Cualquier otra cosa → no disponible. Nunca se inventa.
 */
export function cleanUsage(raw, now) {
  const none = { available: false, text: 'Uso no disponible', url: USAGE_URL }
  if (raw == null) return none
  let d = raw
  if (typeof raw === 'string')
    try {
      d = JSON.parse(raw)
    } catch {
      return none
    }
  if (d?.format !== USAGE_FORMAT || typeof d.source !== 'string' || !d.source.trim()) return none
  const at = typeof d.at === 'number' && Number.isFinite(d.at) ? d.at : null
  if (!at || at > now + 60_000 || now - at > USAGE_STALE_MS) return none
  const pct = (x) => (typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= 100 ? Math.round(x) : null)
  const when = (x) => (typeof x === 'number' && Number.isFinite(x) && x > 0 ? x : null)
  const session = pct(d.session?.usedPct)
  const week = pct(d.week?.usedPct)
  if (session === null && week === null) return none
  return {
    available: true,
    source: sanitize(d.source, 60),
    at,
    session: session === null ? null : { usedPct: session, resetsAt: when(d.session?.resetsAt) },
    week: week === null ? null : { usedPct: week, resetsAt: when(d.week?.resetsAt) },
    url: USAGE_URL,
  }
}

const clock = (ts) => new Date(ts).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })

/** «Sesión 61% usado (reinicia 15:09) · Semana 6% usado» o «Uso no disponible». */
export function usageText(u) {
  if (!u?.available) return 'Uso no disponible'
  const part = (name, x) => (x ? `${name} ${x.usedPct}% usado${x.resetsAt ? ` (reinicia ${clock(x.resetsAt)})` : ''}` : null)
  return [part('Sesión', u.session), part('Semana', u.week)].filter(Boolean).join(' · ')
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
