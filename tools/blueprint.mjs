#!/usr/bin/env node
// Blueprint con checklist: valida docs/blueprint/ikral-studio.json y genera PLAN.md (DS-010).
//   npm run blueprint            → valida (los commits deben existir) y reescribe PLAN.md
//   npm run blueprint -- --aplicar → además marca «hecho» las tareas cuyo commit ya existe,
//                                    SOLO si npm test y npm run build pasan en ese momento.
// Nunca marca la casilla del director ni cuenta comentarios o acuses como evidencia.
import { execFileSync } from 'node:child_process'
import { readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { applyUpdates, proposeUpdates, renderMarkdown, summarize, validateBlueprint } from './blueprint-core.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const file = join(root, 'docs', 'blueprint', 'ikral-studio.json')
const plan = join(root, 'PLAN.md')

const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
const commitExists = (h) => {
  try {
    return git('cat-file', '-t', h).trim() === 'commit'
  } catch {
    return false
  }
}
const writeAtomic = (path, text) => {
  writeFileSync(`${path}.tmp`, text)
  renameSync(`${path}.tmp`, path)
}
const passes = (script) => {
  try {
    execFileSync('npm', ['run', script], { cwd: root, stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

let bp = JSON.parse(readFileSync(file, 'utf8'))

if (process.argv.includes('--aplicar')) {
  const commits = git('log', '--format=%h%x09%s', '-200')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((l) => ({ hash: l.slice(0, l.indexOf('\t')), subject: l.slice(l.indexOf('\t') + 1) }))
  const found = proposeUpdates(bp, commits, true)
  if (found.ready.length) {
    console.log(`Hay evidencia para: ${found.ready.map((u) => u.id).join(', ')}. Corriendo npm test y npm run build…`)
    const ok = passes('test') && passes('build')
    const { ready, waiting } = proposeUpdates(bp, commits, ok)
    if (ok) {
      bp = applyUpdates(bp, ready, new Date().toISOString().slice(0, 10))
      writeAtomic(file, `${JSON.stringify(bp, null, 2)}\n`)
      console.log(`Marcadas «hecho»: ${ready.map((u) => u.id).join(', ')}.`)
    } else console.log(`No se marca nada: las pruebas o el build fallaron (${waiting.map((u) => u.id).join(', ')} siguen igual).`)
  } else console.log('Ninguna tarea tiene evidencia nueva.')
  for (const w of found.waiting) console.log(`En espera: ${w.id} (sus dependencias aún no están hechas).`)
}

const { errors, warnings } = validateBlueprint(bp, { commitExists })
for (const w of warnings) console.log(`Aviso: ${w}`)
if (errors.length) {
  for (const e of errors) console.error(`Error: ${e}`)
  console.error(`El Blueprint tiene ${errors.length} error(es). PLAN.md no se actualizó.`)
  process.exit(1)
}
writeAtomic(plan, renderMarkdown(bp))
const s = summarize(bp)
console.log(`Blueprint válido: ${s.hechas} de ${s.total} hechas · ${s.enCurso} en curso · ${s.bloqueadas} bloqueadas. PLAN.md actualizado.`)
if (s.siguiente) console.log(`Siguiente: ${s.siguiente.id} · ${s.siguiente.titulo}`)
