import { useEffect, useState } from 'react'
import { Ear, Loader2 } from 'lucide-react'
import { toast } from '../../stores/uiStore'
import { useProject } from '../../stores/projectStore'
import { isDesktop, onChatChange, readChat } from '../../database/db'

/** Claude está escuchando si dejó señal de vida hace poco (el oído la renueva cada 20 s). */
export const ONLINE_MS = 90_000
/** Mientras trabaja en un pedido no escucha; se le da más tiempo antes de apagar el foquito. */
const WORKING_MS = 10 * 60_000
/** Cuánto esperamos a que la sesión nueva se conecte después de tocar el botón. */
const CONNECT_MS = 3 * 60_000

let startedAt = 0
const startListeners = new Set<() => void>()

/** Lee la señal de vida de Claude en el proyecto abierto. */
export function useClaudeStatus() {
  const projectId = useProject((s) => s.project?.id)
  const [state, setState] = useState<{ lastSeen?: string; working?: string }>({})
  const [now, setNow] = useState(Date.now())
  const desktop = isDesktop()

  useEffect(() => {
    if (!desktop || !projectId) return
    let alive = true
    const load = async () => {
      const c = await readChat(projectId)
      if (!alive || !c) return
      setState({ lastSeen: c.claude.lastSeen, working: c.claude.working })
      setNow(Date.now())
    }
    void load()
    let off: (() => void) | undefined
    void onChatChange(load).then((f) => (off = f))
    const t = setInterval(load, 5000)
    const tick = () => setNow(Date.now())
    startListeners.add(tick)
    return () => {
      alive = false
      off?.()
      clearInterval(t)
      startListeners.delete(tick)
    }
  }, [desktop, projectId])

  const age = state.lastSeen ? now - Date.parse(state.lastSeen) : Infinity
  const online = age < (state.working ? WORKING_MS : ONLINE_MS)
  const connecting = !online && now - startedAt < CONNECT_MS
  return { desktop, online, connecting, working: online ? state.working : undefined }
}

/** Abre la Terminal con una sesión de Claude que se pone a escuchar. */
export async function startListening() {
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('empezar_a_escuchar')
    startedAt = Date.now()
    startListeners.forEach((l) => l())
    toast('Abrí la Terminal con Claude. En cuanto se conecte, el foquito se pone verde 🟢', 'info')
  } catch (e) {
    toast('No pude abrir la Terminal: ' + String(e), 'error')
  }
}

/** Foquito 🟢 Claude escuchando / ⚪ no escucha, con el botón «Empezar a escuchar». */
export function ClaudeLight() {
  const { desktop, online, connecting, working } = useClaudeStatus()
  if (!desktop) return null

  if (online)
    return (
      <span className="chip shrink-0 bg-ok/15 text-[#86efac]" title={working ? `Claude: ${working}` : 'Claude está escuchando el chat'} role="status">
        <span className="h-2 w-2 rounded-full bg-ok shadow-[0_0_6px_#22c55e]" />
        {working ? 'Claude trabajando' : 'Claude escuchando'}
      </span>
    )

  return (
    <span className="flex shrink-0 items-center gap-1.5" role="status">
      <span className="chip bg-white/5 text-ink-3" title="Ninguna sesión de Claude está escuchando el chat">
        <span className="h-2 w-2 rounded-full bg-ink-3" />
        Claude no escucha
      </span>
      <button className="btn !h-8 !px-2.5 !text-[12.5px]" onClick={() => void startListening()} disabled={connecting} title="Abre la Terminal con Claude escuchando el chat">
        {connecting ? <Loader2 size={14} className="animate-spin" /> : <Ear size={14} />}
        {connecting ? 'Conectando…' : 'Empezar a escuchar'}
      </button>
    </span>
  )
}
