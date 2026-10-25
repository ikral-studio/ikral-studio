// Ventanita flotante de GPT: se mueve desde la barra de arriba, se minimiza y queda siempre encima,
// en cualquier vista. Platica sobre todo el proyecto; GPT no cambia nada por su cuenta.
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Bot, Loader2, Minus, Plus, Send, Volume2, X } from 'lucide-react'
import { useProject } from '../../stores/projectStore'
import { toast } from '../../stores/uiStore'
import { isDesktop, readGptThreads } from '../../database/db'
import { orderedScenes } from '../../features/script-sync/derive'
import { runChatConsult } from '../../features/gpt/client'
import { CHAT_KEY, type ChatThread } from '../../features/gpt/chat'
import { newThread, threadsFor, upsertThread, type StoredThread } from '../../features/gpt/threads'
import { saveSectionThreads } from '../../features/gpt/threadsFile'

const UI_KEY = 'ikral-studio:gpt-flotante'
const W = 380
const H = 460
const BAR = 44

interface FloatUi {
  open: boolean
  min: boolean
  x: number
  y: number
}

function loadUi(): FloatUi {
  const def = { open: false, min: false, x: 24, y: Math.max(24, window.innerHeight - H - 24) }
  try {
    const raw = localStorage.getItem(UI_KEY)
    return raw ? { ...def, ...(JSON.parse(raw) as Partial<FloatUi>) } : def
  } catch {
    return def
  }
}

function saveUi(ui: FloatUi) {
  try {
    localStorage.setItem(UI_KEY, JSON.stringify(ui))
  } catch {
    /* sin almacenamiento: solo no se recuerda */
  }
}

/** Que la barra de arriba siempre quede dentro de la pantalla. */
const clampPos = (x: number, y: number, h: number) => ({
  x: Math.min(Math.max(0, x), Math.max(0, window.innerWidth - Math.min(W, window.innerWidth))),
  y: Math.min(Math.max(0, y), Math.max(0, window.innerHeight - h)),
})

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

const isChat = (t: StoredThread) => t.section === 'chat'

export function GptFloat() {
  const project = useProject((s) => s.project)
  const scenesMap = useProject((s) => s.scenes)
  const selected = useProject((s) => s.selectedSceneId)
  const pid = project?.id
  const [ui, setUi] = useState(loadUi)
  const [threads, setThreads] = useState<StoredThread[]>([])
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ dx: number; dy: number } | null>(null)
  const scenes = useMemo(() => (project ? orderedScenes(project, scenesMap) : []), [project, scenesMap])

  const update = (patch: Partial<FloatUi>) =>
    setUi((prev) => {
      const next = { ...prev, ...patch }
      saveUi(next)
      return next
    })

  useEffect(() => {
    setThreads([])
    setCurrentId(null)
    setMessage(null)
    if (!pid || !isDesktop()) return
    let alive = true
    readGptThreads<{ threads?: StoredThread[] }>(pid)
      .then((f) => alive && setThreads(Array.isArray(f?.threads) ? f.threads.filter(isChat) : []))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [pid])

  // Si la ventana de la app se achica, la ventanita no se pierde fuera.
  useEffect(() => {
    const onResize = () => setUi((prev) => ({ ...prev, ...clampPos(prev.x, prev.y, prev.min ? BAR : H) }))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const chats = threadsFor(threads as unknown as ChatThread[], CHAT_KEY, false, 'chat')
  const current = chats.find((t) => t.id === currentId) ?? chats[0]
  const count = current?.messages.length ?? 0

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [count, ui.open, ui.min, busy])

  if (!project) return null

  const persist = (next: StoredThread[]) =>
    void saveSectionThreads(project.id, 'chat', next).catch(() => toast('No se pudo guardar la conversación con GPT', 'error'))

  const startThread = () => {
    const th = newThread<never, never>(CHAT_KEY, `Conversación ${chats.length + 1}`, undefined, 'chat')
    const next = upsertThread(threads, th as unknown as StoredThread)
    setThreads(next)
    persist(next)
    setCurrentId(th.id)
    setMessage(null)
  }

  const send = async () => {
    const t = text.trim()
    if (!t || busy) return
    const base = current ?? newThread<never, never>(CHAT_KEY, t.slice(0, 40), undefined, 'chat')
    setBusy(true)
    setMessage(null)
    const r = await runChatConsult(project, scenes, base, t, selected)
    setBusy(false)
    if (!r.ok) return setMessage(r.message)
    // Se guarda sobre lo último (pudo cambiar mientras GPT pensaba).
    setThreads((prev) => {
      const next = upsertThread(prev, r.thread as unknown as StoredThread)
      persist(next)
      return next
    })
    setCurrentId(r.thread.id)
    setText('')
  }

  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return
    drag.current = { dx: e.clientX - ui.x, dy: e.clientY - ui.y }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return
    setUi((prev) => ({ ...prev, ...clampPos(e.clientX - drag.current!.dx, e.clientY - drag.current!.dy, prev.min ? BAR : H) }))
  }
  const onUp = () => {
    if (!drag.current) return
    drag.current = null
    setUi((prev) => (saveUi(prev), prev))
  }

  if (!ui.open)
    return createPortal(
      <button
        className="no-print fixed bottom-5 left-5 z-[80] flex h-11 items-center gap-2 rounded-full border border-[#10a37f]/70 bg-card px-4 text-[13px] font-semibold shadow-2xl shadow-black/60 hover:bg-card-2"
        onClick={() => update({ open: true, min: false, ...clampPos(ui.x, ui.y, H) })}
        aria-label="Abrir la ventanita de GPT"
      >
        <Bot size={16} className="text-[#6ee7b7]" /> GPT
      </button>,
      document.body,
    )

  const pos = clampPos(ui.x, ui.y, ui.min ? BAR : H)
  return createPortal(
    <div
      className="no-print fixed z-[80] flex w-[min(380px,calc(100vw-16px))] flex-col rounded-[14px] border border-[#10a37f]/70 bg-card shadow-2xl shadow-black/60"
      style={{ left: pos.x, top: pos.y, height: ui.min ? BAR : `min(${H}px, calc(100vh - 16px))` }}
      role="region"
      aria-label="Ventanita de GPT"
    >
      <div
        className="flex h-11 shrink-0 cursor-move select-none items-center gap-2 px-3"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onDoubleClick={() => update({ min: !ui.min })}
        title="Arrastra para mover"
      >
        <Bot size={15} className="text-[#6ee7b7]" />
        <span className="flex-1 truncate text-[13px] font-semibold">GPT{busy ? ' · pensando…' : ''}</span>
        {!ui.min && (
          <button className="icon-btn sm" onClick={startThread} aria-label="Nueva conversación" title="Nueva conversación">
            <Plus size={15} />
          </button>
        )}
        <button className="icon-btn sm" onClick={() => update({ min: !ui.min })} aria-label={ui.min ? 'Abrir' : 'Minimizar'} title={ui.min ? 'Abrir' : 'Minimizar'}>
          <Minus size={15} />
        </button>
        <button className="icon-btn sm" onClick={() => update({ open: false })} aria-label="Cerrar la ventanita de GPT" title="Cerrar">
          <X size={15} />
        </button>
      </div>
      {!ui.min && (
        <>
          <div ref={listRef} className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-3 pb-2">
            {!isDesktop() && <p className="text-[13px] text-muted">Disponible en la app de Mac.</p>}
            {isDesktop() && !count && !busy && <p className="text-[13px] text-muted">Pregúntale lo que quieras del proyecto. GPT ve el guion, la Biblia y las decisiones aprobadas. No cambia nada.</p>}
            {current?.messages.map((m) =>
              m.from === 'director' ? (
                <div key={m.id} className="ml-8 self-end whitespace-pre-wrap rounded-xl bg-[#1e3a5f] px-3 py-2 text-[13.5px] leading-snug">
                  {m.text}
                </div>
              ) : (
                <div key={m.id} className="mr-4 flex items-start gap-1">
                  <div className="flex-1 whitespace-pre-wrap rounded-xl bg-card-2 px-3 py-2 text-[13.5px] leading-snug">{m.text}</div>
                  <button className="icon-btn sm" onClick={() => speak(m.text)} aria-label="Leer en voz alta" title="Leer en voz alta">
                    <Volume2 size={14} />
                  </button>
                </div>
              ),
            )}
            {busy && (
              <p className="flex items-center gap-1.5 text-[13px] text-muted">
                <Loader2 size={14} className="animate-spin" /> GPT está pensando… (puede tardar un minuto)
              </p>
            )}
            {message && <p className="text-[13px] text-[#fca5a5]">{message}</p>}
          </div>
          <div className="flex shrink-0 items-end gap-1.5 px-3 pb-3">
            <textarea
              className="field max-h-28 min-h-[40px] flex-1"
              rows={1}
              placeholder="Escríbele a GPT…"
              aria-label="Mensaje para GPT"
              value={text}
              disabled={!isDesktop()}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void send()
                }
              }}
            />
            <button className="btn btn-primary !h-10 !px-3" onClick={() => void send()} disabled={!text.trim() || busy || !isDesktop()} aria-label="Enviar a GPT">
              <Send size={16} />
            </button>
          </div>
        </>
      )}
    </div>,
    document.body,
  )
}
