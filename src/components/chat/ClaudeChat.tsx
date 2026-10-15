import { useEffect, useRef, useState } from 'react'
import { MessageCircle, Mic, MicOff, Send, Sparkles, Volume2, VolumeX } from 'lucide-react'
import { toast } from '../../stores/uiStore'
import { useProject } from '../../stores/projectStore'
import { isDesktop, onChatChange, readChat, sendChat, type ChatMessage } from '../../database/db'
import { selectScene } from '../../features/scene-management/actions'
import { pad2, uid } from '../../utils'

const ONLINE_MS = 90_000
const VOICE_KEY = 'ikral-studio:chat-voz'

function loadVoice() {
  try {
    return localStorage.getItem(VOICE_KEY) === '1'
  } catch {
    return false
  }
}

/** Lee en voz alta con la voz del sistema (español de México si existe). */
function speak(text: string) {
  if (!('speechSynthesis' in window)) return
  const clean = text.replace(/[*_`#>]/g, '').replace(/\p{Extended_Pictographic}/gu, '')
  const u = new SpeechSynthesisUtterance(clean)
  const voices = speechSynthesis.getVoices()
  u.voice = voices.find((v) => v.name.includes('Paulina')) ?? voices.find((v) => v.lang === 'es-MX') ?? voices.find((v) => v.lang.startsWith('es')) ?? null
  u.lang = u.voice?.lang ?? 'es-MX'
  speechSynthesis.speak(u)
}

type Recognition = { lang: string; interimResults: boolean; continuous: boolean; start(): void; stop(): void; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null }
const RecognitionCtor = (window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }).SpeechRecognition ??
  (window as unknown as { webkitSpeechRecognition?: new () => Recognition }).webkitSpeechRecognition

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
  const [voice, setVoice] = useState(loadVoice)
  const voiceRef = useRef(voice)
  voiceRef.current = voice
  const seen = useRef<Set<string> | null>(null)
  const [recording, setRecording] = useState(false)
  const rec = useRef<Recognition | null>(null)

  const toggleVoice = () => {
    const v = !voice
    setVoice(v)
    try {
      localStorage.setItem(VOICE_KEY, v ? '1' : '0')
    } catch {
      /* sin almacenamiento: solo dura esta sesión */
    }
    if (v) speak('Listo, te leo mis respuestas.')
    else window.speechSynthesis?.cancel()
  }

  const toggleMic = () => {
    if (recording) {
      rec.current?.stop()
      return
    }
    if (!RecognitionCtor) {
      toast('Usa el dictado de tu Mac: toca dos veces la tecla 🎤 (o Fn) y habla.', 'info')
      document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Mensaje para Claude"]')?.focus()
      return
    }
    const r = new RecognitionCtor()
    r.lang = 'es-MX'
    r.interimResults = true
    r.continuous = false
    const base = text ? text + ' ' : ''
    r.onresult = (e) => setText(base + Array.from(e.results).map((x) => x[0].transcript).join(''))
    r.onend = () => setRecording(false)
    r.onerror = () => {
      setRecording(false)
      toast('No pude usar el micrófono. Prueba el dictado de tu Mac (tecla 🎤).', 'info')
    }
    rec.current = r
    setRecording(true)
    r.start()
  }

  useEffect(() => {
    if (!desktop || !projectId) return
    let alive = true
    const load = async () => {
      const c = await readChat(projectId)
      if (!alive || !c) return
      const messages = [...c.user, ...c.claude.messages].sort((a, b) => a.at.localeCompare(b.at))
      // Leer en voz alta solo las respuestas nuevas de Claude.
      if (!seen.current) seen.current = new Set(messages.map((m) => m.id))
      else
        for (const m of messages)
          if (!seen.current.has(m.id)) {
            seen.current.add(m.id)
            if (m.from === 'claude' && voiceRef.current) speak(m.text)
          }
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
          <button
            className={`icon-btn sm ${voice ? '!text-[#c4b5fd]' : ''}`}
            onClick={toggleVoice}
            aria-pressed={voice}
            aria-label={voice ? 'Dejar de leer en voz alta' : 'Leer en voz alta las respuestas'}
            title={voice ? 'Leyendo en voz alta (clic para apagar)' : 'Leer en voz alta las respuestas'}
          >
            {voice ? <Volume2 size={15} /> : <VolumeX size={15} />}
          </button>
        )}
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
              <button
                className={`btn !h-10 !px-3 ${recording ? '!border-bad !bg-bad/20 !text-white' : ''}`}
                onClick={toggleMic}
                aria-pressed={recording}
                aria-label={recording ? 'Dejar de escuchar' : 'Hablarle a Claude'}
                title={recording ? 'Escuchando… clic para terminar' : 'Hablar en vez de escribir'}
              >
                {recording ? <MicOff size={16} /> : <Mic size={16} />}
              </button>
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
