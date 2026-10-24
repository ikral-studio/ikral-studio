#!/usr/bin/env node
// Monitor en vivo del puente (solo lectura). El puente (tools/coord-bridge.mjs) llama a writeMonitor() en cada
// vuelta de launchd, también mientras Claude trabaja (las vueltas que encuentran el candado ocupado). Así la página
// se reescribe cada ~45 s aunque la ventana de Claude esté cerrada, y si deja de reescribirse enseña «Sin señal».
// Junta señales reales: estado y candado del puente, procesos vivos (ps), git, eventos del puente y GitHub.
// Página: ~/Library/Application Support/ikral-coord/monitor.html (solo en este Mac, no se publica).
// Multiproyecto: la misma página enseña todos los proyectos de tools/monitor-projects.json (ver docs/monitor-multiproyecto.md).
// A mano: `npm run monitor` la escribe una vez y dice dónde quedó. Lógica pura en coord-monitor-core.mjs.
import { appendFileSync, existsSync, lstatSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BLUEPRINT_FORMAT, summarize } from './blueprint-core.mjs'
import { chainRange, closedStages, normalizeState, pidAlive, planStages } from './coord-bridge-core.mjs'
import {
  MAX_STATUS_BYTES,
  OWN_PROJECT,
  STATUS_FILE,
  buildView,
  commentAuthor,
  inspectProcesses,
  parseRegistry,
  projectView,
  renderDashboard,
  sanitize,
  stageTitles,
  statusPayload,
} from './coord-monitor-core.mjs'

const MAX_EVENTS = 300

const readJson = (file, fallback) => {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return fallback
  }
}
/** Escritura atómica: el navegador nunca lee una página a medias. */
const writeAtomic = (file, text) => {
  writeFileSync(`${file}.tmp`, text)
  renameSync(`${file}.tmp`, file)
}

/** Guarda un evento seguro del puente (sin textos de GitHub ni comandos). Nunca falla. */
export function logEvent(stateDir, ev) {
  try {
    const file = join(stateDir, 'events.jsonl')
    appendFileSync(file, `${JSON.stringify({ at: Date.now(), ...ev })}\n`)
    if (statSync(file).size > 256 * 1024) writeAtomic(file, `${readFileSync(file, 'utf8').trim().split('\n').slice(-MAX_EVENTS).join('\n')}\n`)
  } catch {
    // El monitor nunca debe parar el puente.
  }
}

const readEvents = (stateDir) => {
  try {
    return readFileSync(join(stateDir, 'events.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .slice(-MAX_EVENTS)
      .map((l) => {
        try {
          return JSON.parse(l)
        } catch {
          return null
        }
      })
      .filter((e) => e && typeof e.at === 'number')
  } catch {
    return []
  }
}

function gitInfo(workdir) {
  const git = (...a) => execFileSync('git', a, { cwd: workdir, encoding: 'utf8', timeout: 15000 })
  const commits = git('log', '-10', '--format=%h%x1f%ct%x1f%s')
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      const [hash, ct, subject] = l.split('\x1f')
      return { hash, at: Number(ct) * 1000, subject }
    })
  // Solo cuántos archivos cambiaron y cuándo fue el último cambio: los nombres no salen de aquí.
  const entries = git('status', '--porcelain', '-z').split('\0').filter(Boolean)
  let lastChangeAt = 0
  let dirty = 0
  for (const e of entries) {
    if (!/^.. /.test(e)) continue // segunda parte de un renombre
    dirty++
    try {
      lastChangeAt = Math.max(lastChangeAt, statSync(join(workdir, e.slice(3))).mtimeMs)
    } catch {
      // borrado
    }
  }
  return { commits, dirty, lastChangeAt: lastChangeAt || null }
}

function githubInfo(repo, issue, prev) {
  const [owner, name] = repo.split('/')
  try {
    const q = `query{repository(owner:"${owner}",name:"${name}"){issue(number:${issue}){comments(last:5){nodes{createdAt body}}}}}`
    const out = execFileSync('gh', ['api', 'graphql', '-f', `query=${q}`], { encoding: 'utf8', timeout: 20000 })
    const nodes = JSON.parse(out).data.repository.issue.comments.nodes
    // Al caché solo va lo ya limpio: quién, cuándo y un título corto.
    const comments = nodes.map((n) => ({ who: commentAuthor(n.body), at: Date.parse(n.createdAt), title: sanitize(n.body, 100) }))
    return { ok: true, at: Date.now(), comments }
  } catch {
    return { ok: false, at: prev?.at ?? null, comments: prev?.comments ?? [] }
  }
}

/** Zona donde los puentes guardan su estado. Fuera de aquí el monitor no lee nada. */
export const MONITOR_ROOT = join(homedir(), 'Library', 'Application Support')

/**
 * status.json de otro proyecto: solo ese archivo, sin seguir enlaces y con tamaño acotado. null si no hay.
 * Un enlace simbólico se rechaza (podría apuntar a archivos de otro repo).
 */
export function readStatusFile(statusDir) {
  try {
    const file = join(statusDir, STATUS_FILE)
    const st = lstatSync(file)
    if (!st.isFile()) return '{}'
    if (st.size > MAX_STATUS_BYTES) return '{}'
    return readFileSync(file, 'utf8')
  } catch {
    return null
  }
}

/**
 * Página de todos los proyectos del registro (tools/monitor-projects.json). Este proyecto usa lo que acaba de
 * escribir; los demás, solo su status.json dentro de MONITOR_ROOT. Sin registro legible → solo este proyecto.
 */
function dashboardHtml(opts, own, payload, now) {
  const home = opts.home ?? homedir()
  const root = opts.monitorRoot ?? MONITOR_ROOT
  const data = opts.registry ?? readJson(opts.registryFile ?? join(opts.workdir, 'tools', 'monitor-projects.json'), null)
  const reg = data ? parseRegistry(data, { home, root }) : { projects: [], errors: [] }
  const projects = reg.projects.some((p) => p.id === own.id) ? reg.projects : [own, ...reg.projects]
  const items = projects.map((p) => {
    if (p.id === own.id) return { project: { ...p, problem: null, statusDir: 'propio' }, view: projectView({ ...p, problem: null, statusDir: 'propio' }, payload, now) }
    return { project: p, view: projectView(p, p.statusDir && !p.problem ? readStatusFile(p.statusDir) : null, now) }
  })
  return renderDashboard(items, now, reg.errors)
}

/**
 * Junta la foto del momento, guarda status.json (la vista limpia de este proyecto) y reescribe monitor.html. Nunca lanza error (el puente sigue aunque esto falle).
 * opts: { stateDir, workdir, pauseFile, repo, issue, now?, ps?, github?: false }
 */
export function writeMonitor(opts) {
  try {
    const now = opts.now ?? Date.now()
    const { stateDir, workdir } = opts
    const cacheFile = join(stateDir, 'monitor-cache.json')
    const cache = readJson(cacheFile, {})
    const state = normalizeState(readJson(join(stateDir, 'state.json'), null)) ?? { lastId: 0, tasks: {}, chain: {} }
    const lockPid = Number(readJson(join(stateDir, 'lock.pid'), null)) || null
    const lockAlive = pidAlive(lockPid)
    let psText = opts.ps
    if (psText === undefined)
      try {
        psText = execFileSync('ps', ['-axo', 'pid=,ppid=,etime=,args='], { encoding: 'utf8', timeout: 10000, maxBuffer: 16 * 1024 * 1024 })
      } catch {
        psText = ''
      }
    const procs = inspectProcesses(psText, lockAlive ? lockPid : null, now)
    // Pruebas / compilación: se anota cuándo se vieron empezar y terminar (se mira cada vuelta, ~45 s).
    for (const k of ['tests', 'build']) {
      const was = Boolean(cache.procs?.[k])
      if (procs[k] !== was) logEvent(stateDir, { type: `${k}-${procs[k] ? 'start' : 'end'}` })
    }
    let plan = { stages: [], range: null, closed: new Set(), titles: {} }
    let git = { commits: [], dirty: 0, lastChangeAt: null }
    try {
      const text = readFileSync(join(workdir, 'docs', 'plan-maestro-ikral-studio.md'), 'utf8')
      git = gitInfo(workdir)
      const subjects = execFileSync('git', ['log', '--format=%s', '-300'], { cwd: workdir, encoding: 'utf8', timeout: 15000 }).split('\n')
      plan = { stages: planStages(text), range: chainRange(text), closed: closedStages(subjects), titles: stageTitles(text) }
    } catch {
      // sin plan o sin git: se enseña lo demás
    }
    // Blueprint con checklist: solo su resumen (cuántas hechas, la siguiente, los bloqueos).
    const bp = readJson(join(workdir, 'docs', 'blueprint', 'ikral-studio.json'), null)
    const blueprint = bp?.formato === BLUEPRINT_FORMAT ? summarize(bp) : null
    const github = opts.github === false ? (cache.github ?? { ok: false, at: null, comments: [] }) : githubInfo(opts.repo, opts.issue, cache.github)
    const snap = {
      state,
      pauseFile: existsSync(opts.pauseFile),
      lockAlive,
      procs,
      plan,
      git,
      events: readEvents(stateDir),
      github,
      blueprint,
      bridgeBeatAt: now,
    }
    const view = buildView(snap, now)
    const own = { ...OWN_PROJECT, ...(opts.project ?? {}) }
    const payload = statusPayload(own, view)
    writeAtomic(join(stateDir, STATUS_FILE), JSON.stringify(payload))
    writeAtomic(join(stateDir, 'monitor.html'), dashboardHtml(opts, own, payload, now))
    writeAtomic(cacheFile, JSON.stringify({ github, procs: { tests: procs.tests, build: procs.build } }))
    return view
  } catch {
    return null
  }
}

// `npm run monitor`: la escribe una vez con la configuración real del puente.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const stateDir = process.env.COORD_STATE_DIR || join(homedir(), 'Library', 'Application Support', 'ikral-coord')
  const view = writeMonitor({
    stateDir,
    workdir: join(homedir(), 'Documents', 'editor de storiborad', 'ikral-studio'),
    pauseFile: join(homedir(), '.ikral-coord-pausa'),
    repo: 'ikral-studio/coordinacion',
    issue: 1,
  })
  console.log(view ? `Monitor: ${view.status} · ${join(stateDir, 'monitor.html')}` : 'No se pudo escribir el monitor.')
}
