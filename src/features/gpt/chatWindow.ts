// Mensajes entre la ventana principal y la ventana aparte de GPT.
// La principal manda: tiene el proyecto, consulta a GPT y guarda los hilos. La de GPT solo muestra y pide.
import type { GptMessage } from './threads'

export const GPT_WINDOW = 'gpt'
export const EV_STATE = 'gpt-chat:state'
export const EV_HELLO = 'gpt-chat:hello'
export const EV_SEND = 'gpt-chat:send'
export const EV_NEW = 'gpt-chat:new'
export const EV_SELECT = 'gpt-chat:select'

/** Lo que ve la ventana de GPT. */
export interface GptChatState {
  /** Título del proyecto abierto (null = no hay proyecto). */
  project: string | null
  /** La escena abierta, para que el director sepa de qué habla GPT. */
  scene: string | null
  threads: { id: string; title: string }[]
  currentId: string | null
  messages: GptMessage<never>[]
  busy: boolean
  message: string | null
}

export interface GptSendPayload {
  text: string
  /** true = sobre la escena abierta; false = todo el proyecto. */
  aboutScene: boolean
}

/** ¿Esta es la ventana aparte de GPT? */
export function isGptWindow(): boolean {
  const w = window as unknown as { __TAURI_INTERNALS__?: { metadata?: { currentWindow?: { label?: string } } } }
  return w.__TAURI_INTERNALS__?.metadata?.currentWindow?.label === GPT_WINDOW
}
