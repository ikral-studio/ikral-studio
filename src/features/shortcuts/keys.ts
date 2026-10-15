// Atajos de teclado configurables (solo teclas sin ⌘/Ctrl).

export type ActionId =
  | 'playPause'
  | 'playReverse'
  | 'playForward'
  | 'razor'
  | 'select'
  | 'zoomIn'
  | 'zoomOut'
  | 'prevScene'
  | 'nextScene'
  | 'deleteScene'

export type KeyBindings = Record<ActionId, string[]>

export const ACTIONS: { id: ActionId; label: string }[] = [
  { id: 'playPause', label: 'Reproducir / pausar' },
  { id: 'playReverse', label: 'Hacia atrás (otra vez = más rápido)' },
  { id: 'playForward', label: 'Hacia adelante (otra vez = más rápido)' },
  { id: 'razor', label: 'Tijera (clic en el timeline corta)' },
  { id: 'select', label: 'Selección (mouse normal)' },
  { id: 'zoomIn', label: 'Acercar timeline (zoom +)' },
  { id: 'zoomOut', label: 'Alejar timeline (zoom −)' },
  { id: 'prevScene', label: 'Escena anterior' },
  { id: 'nextScene', label: 'Escena siguiente' },
  { id: 'deleteScene', label: 'Eliminar escena seleccionada' },
]

export const DEFAULT_KEYS: KeyBindings = {
  playPause: ['Space'],
  playReverse: ['a'],
  playForward: ['d'],
  razor: ['c'],
  select: ['v'],
  zoomIn: ['w'],
  zoomOut: ['s'],
  prevScene: ['ArrowUp'],
  nextScene: ['ArrowDown'],
  deleteScene: ['Delete', 'Backspace'],
}

/** Nombre estable de la tecla: letras en minúscula, espacio = "Space". */
export function normalizeKey(e: { key: string }): string {
  if (e.key === ' ' || e.key === 'Spacebar') return 'Space'
  return e.key.length === 1 ? e.key.toLowerCase() : e.key
}

const NAMES: Record<string, string> = {
  Space: 'Espacio',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Delete: 'Supr',
  Backspace: '⌫',
  Enter: 'Enter',
  Escape: 'Esc',
}

export const keyLabel = (k: string) => NAMES[k] ?? (k.length === 1 ? k.toUpperCase() : k)

/** Teclas que no se pueden asignar (las usa el sistema o la app). */
export const RESERVED = ['Escape', 'Tab', 'Meta', 'Control', 'Alt', 'Shift', 'CapsLock']

export function mergeKeys(saved?: Partial<KeyBindings>): KeyBindings {
  return { ...DEFAULT_KEYS, ...(saved ?? {}) }
}

/** Asigna una tecla a una acción y se la quita a cualquier otra que la tuviera. */
export function assignKey(b: KeyBindings, action: ActionId, key: string): KeyBindings {
  const next = { ...b }
  for (const id of Object.keys(next) as ActionId[]) next[id] = next[id].filter((k) => k !== key)
  next[action] = [key]
  return next
}

export function actionFor(b: KeyBindings, key: string): ActionId | null {
  for (const id of Object.keys(b) as ActionId[]) if (b[id].includes(key)) return id
  return null
}
