import { create } from 'zustand'
import { uid } from '../utils'

export interface Toast {
  id: string
  text: string
  kind: 'ok' | 'error' | 'info'
}

interface ConfirmRequest {
  title: string
  body?: string
  confirmLabel?: string
  danger?: boolean
  resolve: (ok: boolean) => void
}

/** target: a dónde va la imagen recortada (imagen inicial/final o un fotograma). */
export type LightboxItem = { mediaId: string; kind: 'image' | 'video'; title?: string; target?: { sceneId: string; slot?: 'start' | 'end'; frameId?: string } }
export type ModalName = 'projects' | 'settings' | 'help' | 'importScript' | 'pasteScene' | 'camera' | 'shotlist' | 'regenerate' | 'trash' | null

interface UIState {
  /** Pantalla principal: inicio, Preproducción (Biblia) o Edición. */
  view: 'home' | 'studio' | 'bible'
  toasts: Toast[]
  confirm: ConfirmRequest | null
  lightbox: LightboxItem | null
  modal: ModalName
  leftCollapsed: boolean
  rightCollapsed: boolean
  /** Pide a la tarjeta de esa escena que se desplace a la vista. */
  scrollRequest: { id: string; n: number } | null
  /** Herramienta del timeline. */
  tool: 'select' | 'razor'
  /** Zoom del timeline en píxeles por segundo. */
  zoom: number
  /** Guion completo abierto en la columna alta de la derecha. */
  scriptDock: boolean
  /** Escena que se va a llenar con «Pegar escena de IA». */
  pasteSceneId: string | null
  /** Texto de un .json soltado sobre «Importar guion». */
  importText: string | null
  /** Imagen que se va a volver a generar. */
  regenerate: { sceneId: string; slot: 'start' | 'end' } | null
}

// Al recargar se queda en la misma pantalla; una pestaña nueva empieza en el inicio.
const VIEW_KEY = 'ikral-studio:view'
function savedView(): UIState['view'] {
  try {
    const v = sessionStorage.getItem(VIEW_KEY)
    return v === 'studio' || v === 'bible' ? v : 'home'
  } catch {
    return 'home'
  }
}

export const useUI = create<UIState>()(() => ({
  view: savedView(),
  toasts: [],
  confirm: null,
  lightbox: null,
  modal: null,
  leftCollapsed: false,
  rightCollapsed: false,
  scrollRequest: null,
  tool: 'select',
  zoom: 24,
  scriptDock: false,
  pasteSceneId: null,
  importText: null,
  regenerate: null,
}))

useUI.subscribe((s, prev) => {
  if (s.view === prev.view) return
  try {
    sessionStorage.setItem(VIEW_KEY, s.view)
  } catch {
    /* sin almacenamiento: no pasa nada */
  }
})

export function openCameraLibrary(sceneId: string) {
  useUI.setState({ modal: 'camera', pasteSceneId: sceneId })
}

export function openPasteScene(sceneId: string) {
  useUI.setState({ modal: 'pasteScene', pasteSceneId: sceneId })
}

export function zoomBy(f: number) {
  useUI.setState((s) => ({ zoom: Math.min(200, Math.max(4, s.zoom * f)) }))
}

export function toast(text: string, kind: Toast['kind'] = 'ok') {
  const t = { id: uid(), text, kind }
  useUI.setState((s) => ({ toasts: [...s.toasts, t].slice(-4) }))
  setTimeout(() => useUI.setState((s) => ({ toasts: s.toasts.filter((x) => x.id !== t.id) })), kind === 'error' ? 6000 : 2600)
}

export function askConfirm(opts: Omit<ConfirmRequest, 'resolve'>): Promise<boolean> {
  return new Promise((resolve) => useUI.setState({ confirm: { ...opts, resolve } }))
}

let scrollN = 0
export function requestScroll(id: string) {
  useUI.setState({ scrollRequest: { id, n: ++scrollN } })
}
