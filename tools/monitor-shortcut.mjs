#!/usr/bin/env node
// Acceso «Monitor IKRAL» en el Escritorio: un enlace (symlink) al monitor.html real del puente.
// Doble clic → abre el navegador; la página se recarga sola cada 15 s (meta refresh), así que siempre
// enseña lo último que escribió el puente. Solo lectura: no lanza procesos ni toca el puente.
// Uso: `npm run acceso-monitor`. No pisa un archivo ajeno con el mismo nombre.

import { existsSync, lstatSync, readlinkSync, symlinkSync, unlinkSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const SHORTCUT_NAME = 'Monitor IKRAL.html'

/**
 * Crea o corrige el acceso. Devuelve { status, link, target }:
 * 'created' | 'ok' (ya apuntaba bien) | 'fixed' (era un enlace viejo) | 'conflict' (hay otro archivo, no se toca).
 * `missing: true` si monitor.html aún no existe (el puente lo escribe en su próxima vuelta).
 */
export function ensureShortcut({ desktopDir, stateDir }) {
  const target = join(stateDir, 'monitor.html')
  const link = join(desktopDir, SHORTCUT_NAME)
  const missing = !existsSync(target)
  let st = null
  try {
    st = lstatSync(link)
  } catch {
    // no existe
  }
  if (st && !st.isSymbolicLink()) return { status: 'conflict', link, target, missing }
  if (st) {
    if (readlinkSync(link) === target) return { status: 'ok', link, target, missing }
    unlinkSync(link)
    symlinkSync(target, link)
    return { status: 'fixed', link, target, missing }
  }
  symlinkSync(target, link)
  return { status: 'created', link, target, missing }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const stateDir = process.env.COORD_STATE_DIR || join(homedir(), 'Library', 'Application Support', 'ikral-coord')
  const desktopDir = process.env.COORD_DESKTOP_DIR || join(homedir(), 'Desktop')
  const r = ensureShortcut({ desktopDir, stateDir })
  const msg = {
    created: 'Listo: creé «Monitor IKRAL» en el Escritorio.',
    ok: 'Ya estaba: «Monitor IKRAL» apunta al monitor real.',
    fixed: 'Corregí «Monitor IKRAL»: ahora apunta al monitor real.',
    conflict: `Ya hay otro archivo llamado «${SHORTCUT_NAME}» en el Escritorio; no lo toqué.`,
  }[r.status]
  console.log(`${msg}\n${r.link} → ${r.target}`)
  if (r.missing) console.log('Aviso: monitor.html aún no existe; el puente lo escribe en su próxima vuelta (o `npm run monitor`).')
  if (r.status === 'conflict') process.exitCode = 1
}
