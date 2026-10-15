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

export type LightboxItem = { mediaId: string; kind: 'image' | 'video'; title?: string }
export type ModalName = 'projects' | 'settings' | 'help' | 'importScript' | null

interface UIState {
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
}

export const useUI = create<UIState>()(() => ({
  toasts: [],
  confirm: null,
  lightbox: null,
  modal: null,
  leftCollapsed: false,
  rightCollapsed: false,
  scrollRequest: null,
  tool: 'select',
  zoom: 24,
}))

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
