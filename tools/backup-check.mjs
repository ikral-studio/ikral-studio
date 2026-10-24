#!/usr/bin/env node
// Revisión antes de un respaldo remoto (git push). Solo lee: nunca hace push, ni borra, ni cambia nada.
//   npm run revisar-respaldo
// Dice cuántos commits no están en GitHub, si el repositorio es público, archivos sin seguimiento,
// archivos pesados y posibles secretos o correos en lo que se subiría. Nunca imprime el secreto: solo dónde está.
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const run = (cmd, args) => {
  try {
    return execFileSync(cmd, args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 })
  } catch {
    return null
  }
}
const lines = (s) => (s ?? '').split('\n').filter(Boolean)

export const SECRET_PATTERNS = [
  ['llave de OpenAI', /sk-[A-Za-z0-9_-]{20,}/],
  ['llave de Anthropic', /sk-ant-[A-Za-z0-9_-]{20,}/],
  ['token de GitHub', /gh[pousr]_[A-Za-z0-9]{30,}/],
  ['llave de AWS', /AKIA[0-9A-Z]{16}/],
  ['llave de Google', /AIza[0-9A-Za-z_-]{35}/],
  ['llave privada', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['token JWT', /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\./],
  ['contraseña escrita', /(password|contraseña|passwd|secret)\s*[:=]\s*["'][^"']{6,}["']/i],
]
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g
/** Correos que sí pueden ir en el código (firmas de commits y servicios). */
const EMAIL_OK = /@(anthropic\.com|users\.noreply\.github\.com|example\.(com|org))$/

/** Revisa las líneas agregadas de un diff → [{ file, kind }]. No guarda el valor encontrado. */
export function scanDiff(diff) {
  const found = []
  let file = null
  for (const l of diff.split('\n')) {
    if (l.startsWith('+++ ')) file = l.slice(6)
    else if (l.startsWith('+') && file) {
      for (const [kind, re] of SECRET_PATTERNS) if (re.test(l)) found.push({ file, kind })
      for (const m of l.match(EMAIL) ?? []) if (!EMAIL_OK.test(m)) found.push({ file, kind: 'correo' })
    }
  }
  return [...new Map(found.map((f) => [`${f.file}|${f.kind}`, f])).values()]
}

function main() {
  const out = []
  const warn = []
  run('git', ['fetch', '--dry-run']) // no cambia nada; solo comprueba que hay red
  const upstream = run('git', ['rev-parse', '--abbrev-ref', '@{u}'])?.trim()
  const ahead = upstream ? Number(run('git', ['rev-list', '--count', `${upstream}..HEAD`])) : null
  out.push(upstream ? `Commits que solo están en este Mac (sin respaldo remoto): ${ahead}.` : 'Esta rama no tiene copia en GitHub configurada.')
  if (ahead) warn.push(`${ahead} commit(s) sin respaldo remoto: si el disco falla, se pierden.`)

  const remote = run('git', ['remote', 'get-url', 'origin'])?.trim() ?? ''
  const slug = remote.match(/github\.com[:/]([\w.-]+\/[\w.-]+?)(\.git)?$/)?.[1]
  const vis = slug ? run('gh', ['api', `repos/${slug}`, '--jq', '.visibility'])?.trim() : null
  out.push(`Repositorio remoto: ${slug ?? 'no es de GitHub'} · visibilidad: ${vis ?? 'no se pudo leer'}.`)
  if (vis === 'public') warn.push('El repositorio es PÚBLICO: hacer push = publicar el código. Necesita autorización del director.')

  const untracked = lines(run('git', ['ls-files', '--others', '--exclude-standard']))
  out.push(`Archivos sin seguimiento (no entrarían en el push): ${untracked.length}.`)
  for (const f of untracked.slice(0, 20)) out.push(`  · ${f}`)

  const range = upstream ? `${upstream}..HEAD` : 'HEAD'
  const big = []
  for (const l of lines(run('git', ['rev-list', '--objects', range]))) {
    const [hash, path] = [l.slice(0, l.indexOf(' ')), l.slice(l.indexOf(' ') + 1)]
    if (!path || l.indexOf(' ') < 0) continue
    const size = Number(run('git', ['cat-file', '-s', hash]))
    if (size > 5 * 1024 * 1024) big.push(`${path} (${(size / 1024 / 1024).toFixed(1)} MB)`)
  }
  out.push(`Archivos de más de 5 MB en lo que se subiría: ${big.length}.`)
  for (const b of [...new Set(big)]) warn.push(`Archivo pesado: ${b}`)

  const diff = upstream ? run('git', ['diff', `${upstream}..HEAD`, '--no-color', '-U0']) : run('git', ['show', '--no-color', '-U0', 'HEAD'])
  const hits = scanDiff(diff ?? '')
  out.push(`Posibles secretos o correos en lo que se subiría: ${hits.length}.`)
  for (const h of hits) warn.push(`Revisar ${h.kind} en ${h.file}`)

  console.log(out.join('\n'))
  console.log(warn.length ? `\nAntes de un push, revisar:\n${warn.map((w) => `- ${w}`).join('\n')}` : '\nNada que revisar.')
  console.log('\nEsta revisión no hace push. El push lo autoriza el director (ver docs/respaldo-y-recuperacion.md).')
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main()
