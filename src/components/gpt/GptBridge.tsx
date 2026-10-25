// En la ventana principal: botón «GPT» que abre la ventana aparte, y el puente que la atiende.
// Aquí vive la conversación (proyecto, consulta a GPT, guardado); la ventana de GPT solo muestra y pide.
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { invoke } from '@tauri-apps/api/core'
import { emitTo, listen } from '@tauri-apps/api/event'
import { Bot } from 'lucide-react'
import { useProject } from '../../stores/projectStore'
import { toast } from '../../stores/uiStore'
import { readGptThreads } from '../../database/db'
import { orderedScenes } from '../../features/script-sync/derive'
import { runChatConsult } from '../../features/gpt/client'
import { CHAT_KEY, type ChatThread } from '../../features/gpt/chat'
import { EV_HELLO, EV_NEW, EV_SELECT, EV_SEND, EV_STATE, GPT_WINDOW, type GptChatState, type GptSendPayload } from '../../features/gpt/chatWindow'
import { newThread, threadsFor, upsertThread, type StoredThread } from '../../features/gpt/threads'
import { saveSectionThreads } from '../../features/gpt/threadsFile'
import { pad2 } from '../../utils'

const isChat = (t: StoredThread) => t.section === 'chat'

export function GptBridge() {
  const project = useProject((s) => s.project)
  const scenesMap = useProject((s) => s.scenes)
  const selected = useProject((s) => s.selectedSceneId)
  const pid = project?.id
  const [threads, setThreads] = useState<StoredThread[]>([])
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const scenes = useMemo(() => (project ? orderedScenes(project, scenesMap) : []), [project, scenesMap])

  useEffect(() => {
    setThreads([])
    setCurrentId(null)
    setMessage(null)
    if (!pid) return
    let alive = true
    readGptThreads<{ threads?: StoredThread[] }>(pid)
      .then((f) => alive && setThreads(Array.isArray(f?.threads) ? f.threads.filter(isChat) : []))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [pid])

  const chats = threadsFor(threads as unknown as ChatThread[], CHAT_KEY, false, 'chat')
  const current = chats.find((t) => t.id === currentId) ?? chats[0]
  const sceneLabel = project && selected && scenesMap[selected] ? `Escena ${pad2(scenes.findIndex((s) => s.id === selected) + 1)} · ${scenesMap[selected].title}` : null

  const state: GptChatState = {
    project: project?.title ?? null,
    scene: sceneLabel,
    threads: chats.map((t) => ({ id: t.id, title: t.title })),
    currentId: current?.id ?? null,
    messages: current?.messages ?? [],
    busy,
    message,
  }
  const stateRef = useRef(state)
  stateRef.current = state
  const json = JSON.stringify(state)
  useEffect(() => {
    void emitTo(GPT_WINDOW, EV_STATE, JSON.parse(json)).catch(() => {})
  }, [json])

  // Lo último, para los oyentes (se registran una sola vez).
  const live = useRef({ project, scenes, selected, threads, current, busy })
  live.current = { project, scenes, selected, threads, current, busy }

  useEffect(() => {
    const persist = (pidNow: string, next: StoredThread[]) =>
      void saveSectionThreads(pidNow, 'chat', next).catch(() => toast('No se pudo guardar la conversación con GPT', 'error'))

    const send = async ({ text, aboutScene }: GptSendPayload) => {
      const { project: p, scenes: sc, selected: sel, current: cur, busy: b } = live.current
      const t = text.trim()
      if (!p || !t || b) return
      const base = cur ?? newThread<never, never>(CHAT_KEY, t.slice(0, 40), undefined, 'chat')
      setBusy(true)
      setMessage(null)
      const r = await runChatConsult(p, sc, base, t, aboutScene ? sel : null)
      setBusy(false)
      if (!r.ok) return setMessage(r.message)
      // Se guarda sobre lo último (pudo cambiar mientras GPT pensaba).
      setThreads((prev) => {
        const next = upsertThread(prev, r.thread as unknown as StoredThread)
        persist(p.id, next)
        return next
      })
      setCurrentId(r.thread.id)
    }

    const start = () => {
      const { project: p, threads: all } = live.current
      if (!p) return
      const n = threadsFor(all as unknown as ChatThread[], CHAT_KEY, false, 'chat').length
      const th = newThread<never, never>(CHAT_KEY, `Conversación ${n + 1}`, undefined, 'chat')
      setThreads((prev) => {
        const next = upsertThread(prev, th as unknown as StoredThread)
        persist(p.id, next)
        return next
      })
      setCurrentId(th.id)
      setMessage(null)
    }

    const offs = [
      listen<GptSendPayload>(EV_SEND, (e) => void send(e.payload)),
      listen(EV_NEW, start),
      listen<string>(EV_SELECT, (e) => setCurrentId(e.payload)),
      listen(EV_HELLO, () => void emitTo(GPT_WINDOW, EV_STATE, stateRef.current).catch(() => {})),
    ]
    return () => offs.forEach((o) => void o.then((f) => f()))
  }, [])

  if (!project) return null
  return createPortal(
    <button
      className="no-print fixed bottom-5 left-5 z-[80] flex h-11 items-center gap-2 rounded-full border border-[#10a37f]/70 bg-card px-4 text-[13px] font-semibold shadow-2xl shadow-black/60 hover:bg-card-2"
      onClick={() => void invoke('abrir_ventana_gpt').catch(() => toast('No se pudo abrir la ventana de GPT', 'error'))}
      aria-label="Abrir la ventana de GPT"
      title="Abre GPT en una ventana aparte, siempre al frente"
    >
      <Bot size={16} className="text-[#6ee7b7]" /> GPT
    </button>,
    document.body,
  )
}
