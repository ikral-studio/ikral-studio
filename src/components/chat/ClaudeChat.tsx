import { useEffect, useRef, useState } from 'react'
import { MessageCircle, Send, Sparkles } from 'lucide-react'
import { useProject } from '../../stores/projectStore'
import { isDesktop, onChatChange, readChat, sendChat, type ChatMessage } from '../../database/db'
import { selectScene } from '../../features/scene-management/actions'
import { pad2, uid } from '../../utils'

const ONLINE_MS = 90_000

interface ChatState {
  messages: ChatMessage[]
  readUpTo?: string
  lastSeen?: string
  working?: string
}

/** Ventanita para escribirle a Claude desde la app de escritorio. */
export function ClaudeChat() {
  const projectId = useProject((s) => s.project?.id)
  const selected = useProject((s) => s.selectedSceneId)
  const sceneLabel = useProject((s) => {
    const id = s.selectedSceneId
    if (!id || !s.project) return null
    return `Escena ${pad2(s.project.sceneIds.indexOf(id) + 1)} · ${s.scenes[id]?.title ?? ''}`
  })
  const [chat, setChat] = useState<ChatState>({ messages: [] })
  const [text, setText] = useState('')
  const [attach, setAttach] = useState(true)
  const [now, setNow] = useState(Date.now())
  const listRef = useRef<HTMLDivElement>(null)
  const desktop = isDesktop()

  useEffect(() => {
    if (!desktop || !projectId) return
    let alive = true
    const load = async () => {
      const c = await readChat(projectId)
      if (!alive || !c) return
      const messages = [...c.user, ...c.claude.messages].sort((a, b) => a.at.localeCompare(b.at))
      setChat({ messages, readUpTo: c.claude.readUpTo, lastSeen: c.claude.lastSeen, working: c.claude.working })
      setNow(Date.now())
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
  }, [desktop, projectId])

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [chat.messages.length])

  const online = !!chat.lastSeen && now - Date.parse(chat.lastSeen) < ONLINE_MS
  const userMsgs = chat.messages.filter((m) => m.from === 'user')
  const readIdx = chat.readUpTo ? userMsgs.findIndex((m) => m.id === chat.readUpTo) : -1

  const send = async () => {
    const t = text.trim()
    if (!t || !projectId) return
    const msg: ChatMessage = {
      id: uid('msg_'),
      from: 'user',
      text: t,
      at: new Date().toISOString(),
      ...(attach && selected && sceneLabel ? { sceneId: selected, sceneLabel } : {}),
    }
    setText('')
    setChat((c) => ({ ...c, messages: [...c.messages, msg] }))
    await sendChat(projectId, msg)
  }

  return (
    <section className="panel flex min-h-[230px] flex-1 flex-col" aria-label="Chat con Claude">
      <div className="flex items-center gap-2 border-b border-line px-3.5 py-2.5">
        <Sparkles size={16} className="text-[#c4b5fd]" />
        <h2 className="flex-1 text-[13px] font-semibold tracking-wide">CLAUDE</h2>
        {desktop && (
          <span className={`chip ${online ? 'bg-ok/15 text-[#86efac]' : 'bg-white/5 text-ink-3'}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${online ? 'bg-ok' : 'bg-ink-3'}`} />
            {online ? 'Escuchando' : 'No conectado'}
          </span>
        )}
      </div>

      {!desktop ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-4 text-center text-[12.5px] text-ink-2">
          <MessageCircle className="text-ink-3" />
          El chat con Claude funciona en la app de escritorio de IKRAL Studio.
        </div>
      ) : (
        <>
          <div ref={listRef} className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-3 py-3">
            {chat.messages.length === 0 && (
              <p className="m-auto max-w-[34ch] text-center text-[12.5px] leading-relaxed text-ink-3">
                Pídeme cambios: «escribe el diálogo de la escena 3», «haz más lenta la cámara», «agrega una escena antes del final»…
              </p>
            )}
            {chat.messages.map((m) => {
              const mine = m.from === 'user'
              const i = mine ? userMsgs.indexOf(m) : -1
              return (
                <div key={m.id} className={`flex max-w-[88%] flex-col gap-0.5 ${mine ? 'self-end items-end' : 'self-start items-start'}`}>
                  {m.sceneLabel && (
                    <button className="text-[10.5px] text-[#93c5fd] hover:underline" onClick={() => m.sceneId && selectScene(m.sceneId, { seek: true })}>
                      {m.sceneLabel}
                    </button>
                  )}
                  <div className={`whitespace-pre-wrap rounded-2xl px-3 py-2 text-[13px] leading-snug ${mine ? 'rounded-br-md bg-sel text-white' : 'rounded-bl-md bg-card-2 text-ink'}`}>
                    {m.text}
                  </div>
                  <span className="text-[10.5px] text-ink-3">
                    {new Date(m.at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                    {mine && (i <= readIdx ? ' · Leído ✓' : ' · Enviado')}
                  </span>
                </div>
              )
            })}
            {online && chat.working && (
              <div className="self-start rounded-2xl rounded-bl-md bg-card-2 px-3 py-2 text-[12.5px] text-ink-2">✍️ {chat.working}</div>
            )}
          </div>
          {!online && (
            <p className="mx-3 mb-2 rounded-lg bg-warn/10 px-2.5 py-1.5 text-[11.5px] text-[#fcd34d]">
              Claude no está escuchando. En la terminal de Claude Code dile: «escucha IKRAL Studio». Tus mensajes se guardan y los leerá al conectarse.
            </p>
          )}
          <div className="border-t border-line p-2">
            {sceneLabel && (
              <label className="mb-1.5 flex items-center gap-1.5 text-[11.5px] text-ink-2">
                <input type="checkbox" checked={attach} onChange={(e) => setAttach(e.target.checked)} />
                Sobre la {sceneLabel}
              </label>
            )}
            <div className="flex items-end gap-1.5">
              <textarea
                className="field max-h-32 min-h-[40px] flex-1"
                rows={1}
                placeholder="Escríbele a Claude…"
                aria-label="Mensaje para Claude"
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
          </div>
        </>
      )}
    </section>
  )
}
