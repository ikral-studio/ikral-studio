// Una sola ventana edita a la vez. La más nueva (o la que pulsa «Usar esta ventana»)
// toma el control; las demás guardan lo pendiente y se ponen en pausa.
// Así dos ventanas no se pisan la edición.
import { useProject } from '../../stores/projectStore'
import { playback } from '../playback/engine'

type Msg = { t: 'claim'; tab: string } | { t: 'released'; tab: string; to: string }

const TAB = Math.random().toString(36).slice(2)
let channel: BroadcastChannel | null = null

export function startTabGuard() {
  if (typeof BroadcastChannel === 'undefined' || channel) return
  channel = new BroadcastChannel('ikral-studio-tabs')
  channel.onmessage = async (e: MessageEvent<Msg>) => {
    const msg = e.data
    if (msg.t === 'claim' && msg.tab !== TAB) {
      // Otra ventana toma el control: guardar lo pendiente y pausar esta.
      playback.pause()
      await useProject.getState().flushSave()
      useProject.getState().setPaused(true)
      channel?.postMessage({ t: 'released', tab: TAB, to: msg.tab } satisfies Msg)
    } else if (msg.t === 'released' && msg.to === TAB) {
      // La otra ventana ya guardó: leer lo último del disco.
      await useProject.getState().reloadCurrent()
    }
  }
  claim()
}

/** Esta ventana pasa a ser la que edita. */
export function claim() {
  useProject.getState().setPaused(false)
  channel?.postMessage({ t: 'claim', tab: TAB } satisfies Msg)
}

/** Retomar esta ventana: leer lo último guardado y avisar a las demás. */
export async function resumeHere() {
  await useProject.getState().reloadCurrent()
  claim()
}
