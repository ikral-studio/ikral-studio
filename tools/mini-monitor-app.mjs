#!/usr/bin/env node
// IKRAL Monitor (mini app de Mac): compilar e instalar. Lógica pura arriba (se prueba en mini-monitor.test.mjs).
//   npm run mini-monitor:compilar  → mac/ikral-monitor/build/IKRAL Monitor.app (necesita swiftc; no toca el sistema)
//   npm run mini-monitor:instalar  → copia a /Applications, acceso «IKRAL Monitor» en el Escritorio y en el Dock
// Instalar es idempotente: si el acceso o el icono del Dock ya están, no se duplican. Solo desde una sesión
// interactiva con permiso de macOS (el puente automático no puede escribir en /Applications, Escritorio ni Dock).
import { cpSync, existsSync, lstatSync, mkdirSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const APP_NAME = 'IKRAL Monitor'
export const BUNDLE_ID = 'com.ikral.monitor'

/** Info.plist de la app. Es una app normal (con icono en el Dock) que además pone su icono en la barra de menús. */
export function infoPlist(version = '1.0') {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleName</key><string>${APP_NAME}</string>
<key>CFBundleDisplayName</key><string>${APP_NAME}</string>
<key>CFBundleIdentifier</key><string>${BUNDLE_ID}</string>
<key>CFBundleExecutable</key><string>${APP_NAME}</string>
<key>CFBundleIconFile</key><string>AppIcon</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>${version}</string>
<key>CFBundleVersion</key><string>${version}</string>
<key>LSMinimumSystemVersion</key><string>12.0</string>
<key>NSHighResolutionCapable</key><true/>
</dict></plist>
`
}

/** ¿El Dock ya tiene la app? (texto de `defaults read com.apple.dock persistent-apps`). */
export const dockHasApp = (dockText, appPath) => {
  const p = appPath.replace(/\/$/, '')
  return String(dockText ?? '').includes(encodeURI(`file://${p}/`)) || String(dockText ?? '').includes(`file://${p}/`) || String(dockText ?? '').includes(`"_CFURLString" = "${p}"`)
}

/** Entrada del Dock para `defaults write com.apple.dock persistent-apps -array-add`. */
export const dockEntry = (appPath) =>
  `<dict><key>tile-data</key><dict><key>file-data</key><dict><key>_CFURLString</key><string>${encodeURI(`file://${appPath.replace(/\/$/, '')}/`)}</string><key>_CFURLStringType</key><integer>15</integer></dict></dict></dict>`

/**
 * Qué hacer con el acceso del Escritorio: 'ok' (ya apunta a la app), 'create' (no hay nada) o 'blocked'
 * (hay otro archivo con ese nombre: no se toca, se avisa).
 */
export function desktopLinkPlan(linkPath, appPath, fs = { lstatSync, readlinkSync }) {
  let st
  try {
    st = fs.lstatSync(linkPath)
  } catch {
    return 'create'
  }
  if (!st.isSymbolicLink()) return 'blocked'
  return fs.readlinkSync(linkPath) === appPath ? 'ok' : 'blocked'
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'mac', 'ikral-monitor')
const BUILT = join(SRC, 'build', `${APP_NAME}.app`)

function compile() {
  rmSync(BUILT, { recursive: true, force: true })
  mkdirSync(join(BUILT, 'Contents', 'MacOS'), { recursive: true })
  mkdirSync(join(BUILT, 'Contents', 'Resources'), { recursive: true })
  writeFileSync(join(BUILT, 'Contents', 'Info.plist'), infoPlist())
  execFileSync('swiftc', ['-O', '-o', join(BUILT, 'Contents', 'MacOS', APP_NAME), join(SRC, 'IKRALMonitor.swift'), '-framework', 'AppKit', '-framework', 'AVFoundation'], { stdio: 'inherit' })
  const icns = join(ROOT, 'src-tauri', 'icons', 'icon.icns')
  if (existsSync(icns)) cpSync(icns, join(BUILT, 'Contents', 'Resources', 'AppIcon.icns'))
  console.log(`Compilada: ${BUILT}`)
}

function install({ appsDir = '/Applications', desktopDir = join(homedir(), 'Desktop') } = {}) {
  if (!existsSync(BUILT)) throw new Error('Primero: npm run mini-monitor:compilar')
  const app = join(appsDir, `${APP_NAME}.app`)
  rmSync(app, { recursive: true, force: true })
  cpSync(BUILT, app, { recursive: true })
  console.log(`Instalada: ${app}`)
  const link = join(desktopDir, APP_NAME)
  const plan = desktopLinkPlan(link, app)
  if (plan === 'create') symlinkSync(app, link)
  console.log(plan === 'blocked' ? `Aviso: ya hay otro «${APP_NAME}» en el Escritorio; no se tocó.` : `Escritorio: «${APP_NAME}» ${plan === 'ok' ? 'ya estaba' : 'creado'}.`)
  let dock = ''
  try {
    dock = execFileSync('defaults', ['read', 'com.apple.dock', 'persistent-apps'], { encoding: 'utf8' })
  } catch {
    // Dock sin apps fijas
  }
  if (dockHasApp(dock, app)) console.log('Dock: ya estaba.')
  else {
    execFileSync('defaults', ['write', 'com.apple.dock', 'persistent-apps', '-array-add', dockEntry(app)])
    execFileSync('killall', ['Dock'])
    console.log('Dock: añadida.')
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const cmd = process.argv[2]
  if (cmd === 'compilar') compile()
  else if (cmd === 'instalar') install()
  else console.log('Uso: node tools/mini-monitor-app.mjs compilar | instalar')
}
