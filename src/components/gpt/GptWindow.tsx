// La ventana aparte de GPT (ventana de Mac propia, como la de Claude Code).
// Se mueve, se achica y se minimiza con los botones de la Mac; el alfiler la deja siempre al frente.
// Solo muestra y pide: la conversación vive en la ventana principal.
import { useEffect, useRef, useState } from 'react'
import { emit, listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { Bot, Loader2, Pin, PinOff, Plus, Send, Volume2 } from 'lucide-react'
import { EV_HELLO, EV_NEW, EV_SELECT, EV_SEND, EV_STATE, type GptChatState, type GptSendPayload } from '../../features/gpt/chatWindow'

const PIN_KEY = 'ikral-studio:gpt-al-frente'

/** Lee en voz alta con la voz del sistema (español de México si existe). */
function speak(text: string) {
  if (!('speechSynthesis' in window)) return
  speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text.replace(/[*_`#>]/g, '').replace(/\p{Extended_Pictographic}/gu, ''))
  const voices = speechSynthesis.getVoices()
  u.voice = voices.find((v) => v.name.includes('Paulina')) ?? voices.find((v) => v.lang === 'es-MX') ?? voices.find((v) => v.lang.startsWith('es')) ?? null
  u.lang = u.voice?.lang ?? 'es-MX'
  speechSynthesis.speak(u)
}

function loadPin() {
  try {
    return localStorage.getItem(PIN_KEY) !== '0'
  } catch {
    return true
  }
}

export function GptWindow() {
  const [st, setSt] = useState<GptChatState | null>(null)
  const [text, setText] = useState('')
  const [aboutScene, setAboutScene] = useState(true)
  const [pinned, setPinned] = useState(loadPin)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const off = listen<GptChatState>(EV_STATE, (e) => setSt(e.payload))
    void off.then(() => emit(EV_HELLO))
    return () => void off.then((f) => f())
  }, [])

  useEffect(() => {
    void getCurrentWindow().setAlwaysOnTop(pinned).catch(() => {})
    try {
      localStorage.setItem(PIN_KEY, pinned ? '1' : '0')
    } catch {
      /* solo no se recuerda */
    }
  }, [pinned])

  const count = st?.messages.length ?? 0
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [count, st?.busy])

  const send = () => {
    const t = text.trim()
    if (!t || !st?.project || st.busy) return
    void emit(EV_SEND, { text: t, aboutScene: aboutScene && !!st.scene } satisfies GptSendPayload)
    setText('')
  }

  return (
    <div className="flex h-screen flex-col bg-bg text-[13.5px]">
      <div className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-2">
        <Bot size={16} className="text-[#6ee7b7]" />
        <span className="flex-1 truncate font-semibold">{st?.project ? `GPT · ${st.project}` : 'GPT'}</span>
        <button className="icon-btn sm" onClick={() => void emit(EV_NEW)} disabled={!st?.project} aria-label="Nueva conversación" title="Nueva conversación">
          <Plus size={15} />
        </button>
        <button
          className="icon-btn sm"
          onClick={() => setPinned((p) => !p)}
          aria-label={pinned ? 'Quitar de siempre al frente' : 'Siempre al frente'}
          title={pinned ? 'Está siempre al frente (clic para quitar)' : 'Ponerla siempre al frente'}
        >
          {pinned ? <Pin size={15} className="text-[#6ee7b7]" /> : <PinOff size={15} />}
        </button>
      </div>
      {st && st.threads.length > 1 && (
        <div className="shrink-0 px-3 pt-2">
          <select className="field w-full" value={st.currentId ?? ''} onChange={(e) => void emit(EV_SELECT, e.target.value)} aria-label="Conversación">
            {st.threads.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        </div>
      )}
      <div ref={listRef} className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3">
        {!st && <p className="text-muted">Conectando con IKRAL Studio…</p>}
        {st && !st.project && <p className="text-muted">Abre un proyecto en IKRAL Studio para platicar con GPT.</p>}
        {st?.project && !count && !st.busy && <p className="text-muted">Pregúntale lo que quieras. GPT ve el guion, la Biblia y las decisiones aprobadas. No cambia nada.</p>}
        {st?.messages.map((m) =>
          m.from === 'director' ? (
            <div key={m.id} className="ml-8 self-end whitespace-pre-wrap rounded-xl bg-[#1e3a5f] px-3 py-2 leading-snug">
              {m.text}
            </div>
          ) : (
            <div key={m.id} className="mr-4 flex items-start gap-1">
              <div className="flex-1 whitespace-pre-wrap rounded-xl bg-card-2 px-3 py-2 leading-snug">{m.text}</div>
              <button className="icon-btn sm" onClick={() => speak(m.text)} aria-label="Leer en voz alta" title="Leer en voz alta">
                <Volume2 size={14} />
              </button>
            </div>
          ),
        )}
        {st?.busy && (
          <p className="flex items-center gap-1.5 text-muted">
            <Loader2 size={14} className="animate-spin" /> GPT está pensando… (puede tardar un minuto)
          </p>
        )}
        {st?.message && <p className="text-[#fca5a5]">{st.message}</p>}
      </div>
      <div className="shrink-0 border-t border-line p-3">
        {st?.scene && (
          <label className="mb-2 flex items-center gap-2 text-[12.5px] text-muted">
            <input type="checkbox" checked={aboutScene} onChange={(e) => setAboutScene(e.target.checked)} />
            Sobre {st.scene}
          </label>
        )}
        <div className="flex items-end gap-1.5">
          <textarea
            className="field max-h-32 min-h-[40px] flex-1"
            rows={2}
            autoFocus
            placeholder="Escríbele a GPT… (para dictar: tecla de micrófono o Fn dos veces)"
            aria-label="Mensaje para GPT"
            value={text}
            disabled={!st?.project}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send()
              }
            }}
          />
          <button className="btn btn-primary !h-10 !px-3" onClick={send} disabled={!text.trim() || !st?.project || st.busy} aria-label="Enviar a GPT">
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}
