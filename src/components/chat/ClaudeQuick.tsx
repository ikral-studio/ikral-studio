// Ventanita de Claude que se abre con el botón «Claude» (en la barra de la línea de tiempo o abajo a la izquierda).
// Mismo estilo que el aviso «Claude te escribió»: lo último de la plática y una cajita para escribirle.
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Send, Sparkles, X } from 'lucide-react'
import { useProject } from '../../stores/projectStore'
import { onChatChange, readChat, sendChat, type ChatMessage } from '../../database/db'
import { pad2, uid } from '../../utils'

/** docked: el botón está en la barra de la línea de tiempo; la ventanita se abre arriba a la derecha para no tapar las pistas. */
export function ClaudeQuick({ onClose, docked = false }: { onClose: () => void; docked?: boolean }) {
  const projectId = useProject((s) => s.project?.id)
  const selected = useProject((s) => s.selectedSceneId)
  const sceneLabel = useProject((s) => {
    const id = s.selectedSceneId
    if (!id || !s.project) return null
    return `Escena ${pad2(s.project.sceneIds.indexOf(id) + 1)} · ${s.scenes[id]?.title ?? ''}`
  })
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [text, setText] = useState('')
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!projectId) return
    let alive = true
    const load = async () => {
      const c = await readChat(projectId).catch(() => null)
      if (alive && c) setMessages([...c.user, ...c.claude.messages].sort((a, b) => a.at.localeCompare(b.at)).slice(-8))
    }
    void load()
    let off: (() => void) | undefined
    void onChatChange(load).then((f) => (off = f))
    const t = setInterval(load, 5000)
    return () => {
      alive = false
      off?.()
      clearInterval(t)
    }
  }, [projectId])

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [messages.length])

  const send = async () => {
    const t = text.trim()
    if (!t || !projectId) return
    const msg: ChatMessage = { id: uid('msg_'), from: 'user', text: t, at: new Date().toISOString(), ...(selected && sceneLabel ? { sceneId: selected, sceneLabel } : {}) }
    setText('')
    setMessages((m) => [...m, msg])
    await sendChat(projectId, msg)
  }

  return createPortal(
    <div className={`no-print fixed ${docked ? 'right-5 top-16' : 'bottom-[76px] left-5'} z-[80] flex w-[min(400px,calc(100vw-32px))] flex-col gap-2 rounded-[14px] border border-[#7c3aed]/70 bg-card p-3 shadow-2xl shadow-black/60`} role="region" aria-label="Ventanita de Claude">
      <div className="flex items-center gap-2">
        <Sparkles size={15} className="text-[#c4b5fd]" />
        <span className="flex-1 text-[13px] font-semibold">Claude</span>
        <button className="icon-btn sm" onClick={onClose} aria-label="Cerrar ventanita de Claude">
          <X size={15} />
        </button>
      </div>
      <div ref={listRef} className="flex max-h-64 flex-col gap-1.5 overflow-y-auto">
        {!messages.length && <p className="text-[12.5px] text-ink-3">Escríbele a Claude: «escribe el diálogo de la escena 3», «haz más lenta la cámara»…</p>}
        {messages.map((m) => (
          <div key={m.id} className={`whitespace-pre-wrap rounded-xl px-3 py-2 text-[13.5px] leading-snug ${m.from === 'user' ? 'ml-8 bg-[#1e3a5f]' : 'mr-4 bg-card-2'}`}>
            {m.text}
          </div>
        ))}
      </div>
      <div className="flex items-end gap-1.5">
        <textarea
          className="field max-h-28 min-h-[40px] flex-1"
          rows={1}
          autoFocus
          placeholder={sceneLabel ? `Escríbele a Claude (sobre ${sceneLabel})…` : 'Escríbele a Claude…'}
          aria-label="Mensaje rápido para Claude"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void send()
            }
          }}
        />
        <button className="btn btn-primary !h-10 !px-3" onClick={() => void send()} disabled={!text.trim()} aria-label="Enviar a Claude">
          <Send size={16} />
        </button>
      </div>
    </div>,
    document.body,
  )
}
