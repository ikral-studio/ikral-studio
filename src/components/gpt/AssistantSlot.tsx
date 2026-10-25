// Hueco en la barra de la línea de tiempo donde se acomoda el botón doble «GPT | Claude».
// Si la vista no tiene este hueco, el botón queda flotando abajo a la izquierda.
import { useSyncExternalStore } from 'react'

let slot: HTMLElement | null = null
const subs = new Set<() => void>()

function setSlot(el: HTMLElement | null) {
  if (slot === el) return
  slot = el
  subs.forEach((f) => f())
}

export function useAssistantSlot() {
  return useSyncExternalStore(
    (f) => {
      subs.add(f)
      return () => subs.delete(f)
    },
    () => slot,
  )
}

export function AssistantSlot() {
  return <div ref={setSlot} className="flex items-center" />
}
