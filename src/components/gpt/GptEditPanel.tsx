// «Consultar GPT» en Edición: ritmo, orden y duración de toda la película.
// Conversaciones con historial y propuestas (mover escenas o planos, cambiar duraciones).
// GPT solo propone. Al Aceptar, la app usa sus acciones de siempre (deshacer + guardado).
// Cada propuesta: Aceptar · Editar · Descartar · Pedir a Claude, y se puede deshacer.
import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Archive, ArchiveRestore, Check, MessageSquare, MessagesSquare, Pencil, Plus, RotateCcw, X } from 'lucide-react'
import { useProject } from '../../stores/projectStore'
import { askConfirm, toast } from '../../stores/uiStore'
import { isDesktop, readGptThreads, sendChat } from '../../database/db'
import { orderedScenes } from '../../features/script-sync/derive'
import { runEditConsult } from '../../features/gpt/client'
import {
  acceptEditProposal,
  describeEditProposal,
  discardEditProposal,
  EDIT_KEY,
  editClaudeText,
  editEditProposal,
  isEditStale,
  markEditAskedClaude,
  undoEditProposal,
  type EditOps,
  type EditProposal,
  type EditProposalRef,
  type EditSeen,
  type EditThread,
} from '../../features/gpt/edit'
import { newThread, setArchived, threadsFor, upsertThread, type StoredThread } from '../../features/gpt/threads'
import { saveSectionThreads } from '../../features/gpt/threadsFile'
import { doneText } from '../../features/gpt/done'
import { pad2, uid } from '../../utils'
import { ConsultGptButton } from './ConsultGptButton'

const CHIPS = ['Revisar el ritmo', '¿Sobra o falta tiempo en alguna escena?', 'Mejorar el orden', 'Ajustar duraciones al diálogo']


const ops = (): EditOps => {
  const s = useProject.getState()
  return {
    ordered: () => {
      const now = useProject.getState()
      return orderedScenes(now.project, now.scenes)
    },
    moveScene: s.moveScene,
    updateScene: (id, patch) => useProject.getState().updateScene(id, patch),
    moveShot: s.moveShot,
    updateShot: (sceneId, shotId, patch) => useProject.getState().updateShot(sceneId, shotId, patch),
  }
}

const isEdit = (t: StoredThread) => t.section === 'edit'
const isDuration = (p: EditProposal) => p.kind === 'scene-duration' || p.kind === 'shot-duration'

function ProposalRow({ p, stale, onAccept, onEdit, onDiscard, onAskClaude, onUndo }: {
  p: EditProposal
  stale: boolean
  onAccept: () => void
  onEdit: (text: string) => void
  onDiscard: () => void
  onAskClaude: () => void
  onUndo: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(String(p.value))
  return (
    <li className="flex flex-col gap-1 rounded-[10px] border border-line bg-bg/60 p-2.5 text-[14px]">
      <div>{describeEditProposal(p)}</div>
      {p.reason && <div className="pl-3 text-[13px] text-ink-2">Motivo: {p.reason}</div>}
      {stale && (
        <div className="flex items-center gap-1.5 pl-3 text-[13px] text-warn" role="note">
          <AlertTriangle size={14} /> Esto cambió desde que GPT lo propuso. Revísalo antes de aceptar.
        </div>
      )}
      {editing && (
        <div className="flex items-center gap-1.5 pl-3">
          <input
            className="field w-24 !text-[13.5px]"
            inputMode="decimal"
            aria-label={isDuration(p) ? 'Segundos propuestos' : 'Lugar propuesto'}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <span className="text-[13px] text-ink-3">{isDuration(p) ? 's' : 'lugar'}</span>
          <button
            className="btn btn-sm"
            onClick={() => {
              onEdit(text)
              setEditing(false)
            }}
          >
            Guardar
          </button>
        </div>
      )}
      <div className="flex flex-wrap gap-1.5 pl-3 pt-0.5">
        {p.status === 'pending' ? (
          <>
            <button className="btn btn-sm" onClick={onAccept} aria-label="Aceptar propuesta">
              <Check size={13} /> Aceptar
            </button>
            <button className="btn btn-sm btn-ghost" onClick={() => setEditing((e) => !e)} aria-label="Editar propuesta">
              <Pencil size={13} /> Editar
            </button>
            <button className="btn btn-sm btn-ghost" onClick={onDiscard} aria-label="Descartar propuesta">
              <X size={13} /> Descartar
            </button>
            <button className="btn btn-sm btn-ghost" onClick={onAskClaude} aria-label="Pedir a Claude">
              <MessageSquare size={13} /> Pedir a Claude
            </button>
          </>
        ) : (
          <>
            <span className="text-[13px] text-ink-2">{doneText(p)}</span>
            <button className="btn btn-sm btn-ghost" onClick={onUndo} aria-label="Deshacer propuesta">
              <RotateCcw size={13} /> Deshacer
            </button>
          </>
        )}
      </div>
    </li>
  )
}

/** Botón «Consultar GPT» de la línea de tiempo: abre y cierra el panel de Edición (flotante, para no apretar la línea de tiempo). */
export function GptEditToggle({ className = 'btn btn-sm btn-ghost' }: { className?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button className={className} onClick={() => setOpen((v) => !v)} aria-expanded={open} title="GPT propone ritmo, orden y duraciones; tú decides">
        <MessagesSquare size={14} /> Consultar GPT
      </button>
      {open && (
        <div className="fixed bottom-4 right-4 z-40 max-h-[75vh] w-[460px] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-xl shadow-2xl">
          <GptEditPanel onClose={() => setOpen(false)} />
        </div>
      )}
    </>
  )
}

/** Panel de GPT para la edición de toda la película. */
export function GptEditPanel({ onClose }: { onClose?: () => void }) {
  const project = useProject((s) => s.project)
  const scenesMap = useProject((s) => s.scenes)
  const pid = project?.id
  const [all, setAll] = useState<StoredThread[]>([])
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [request, setRequest] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const scenes = useMemo(() => (project ? orderedScenes(project, scenesMap) : []), [project, scenesMap])

  useEffect(() => {
    setAll([])
    setMessage(null)
    if (!pid || !isDesktop()) return
    let alive = true
    readGptThreads<{ threads?: StoredThread[] }>(pid)
      .then((f) => alive && setAll(Array.isArray(f?.threads) ? f.threads : []))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [pid])

  if (!project) return null

  const threads = all.filter(isEdit) as unknown as EditThread[]
  const active = threadsFor(threads, EDIT_KEY, false, 'edit')
  const archived = threadsFor(threads, EDIT_KEY, true, 'edit')
  const current = threads.find((x) => x.id === currentId) ?? active[0]

  const persist = (next: StoredThread[]) =>
    void saveSectionThreads(project.id, 'edit', next).catch(() => toast('No se pudo guardar la conversación con GPT', 'error'))

  /** Cambia los hilos de Edición y guarda. */
  const save = (next: EditThread[]) => {
    const merged = [...(next as unknown as StoredThread[]), ...all.filter((x) => !isEdit(x))]
    setAll(merged)
    persist(merged)
  }

  const startThread = () => {
    const th = newThread<EditProposal, EditSeen>(EDIT_KEY, `Conversación ${active.length + archived.length + 1}`, undefined, 'edit')
    save(upsertThread(threads, th))
    setCurrentId(th.id)
    setMessage(null)
  }

  const send = async () => {
    const text = request.trim()
    if (!text) return setMessage('Escribe qué quieres pedirle a GPT.')
    if (!scenes.length) return setMessage('Aún no hay escenas para revisar.')
    const base = current ?? newThread<EditProposal, EditSeen>(EDIT_KEY, text.slice(0, 40), undefined, 'edit')
    setBusy(true)
    setMessage(null)
    const r = await runEditConsult(project, scenes, base, text)
    setBusy(false)
    if (!r.ok) return setMessage(r.message)
    // Se guarda sobre lo último (pudo cambiar mientras GPT pensaba).
    setAll((prev) => {
      const next = upsertThread(prev, { ...r.thread, archived: undefined } as unknown as StoredThread)
      persist(next)
      return next
    })
    setCurrentId(r.thread.id)
    setRequest('')
    const k = r.thread.messages.at(-1)?.proposals?.length ?? 0
    setMessage(k ? `GPT propone ${k} cambio(s). Nada cambió todavía.` : 'GPT respondió sin propuestas de cambio.')
  }

  const accept = async (ref: EditProposalRef, p: EditProposal) => {
    if (isEditStale(p, ops().ordered())) {
      const ok = await askConfirm({
        title: '¿Aceptar de todos modos?',
        body: 'Esto cambió desde que GPT lo propuso. Si lo aceptas, se aplica sobre lo que hay ahora. Puedes deshacer.',
        confirmLabel: 'Aceptar',
      })
      if (!ok) return
    }
    const r = acceptEditProposal(threads, ref, ops())
    if (!r.ok) return toast(r.error === 'not-pending' ? 'Esta propuesta ya no está pendiente.' : 'Esa escena o plano ya no existe. No se cambió nada.', 'info')
    save(r.threads)
    toast('Cambio aplicado. Puedes deshacerlo.')
  }

  const undo = (ref: EditProposalRef) => {
    const r = undoEditProposal(threads, ref, ops())
    if (!r.ok) return toast('Eso se cambió después. Para no perder tus cambios, no lo regresé.', 'info')
    save(r.threads)
  }

  const askClaude = async (ref: EditProposalRef, p: EditProposal) => {
    const n = scenes.findIndex((s) => s.id === p.sceneId) + 1
    const scene = scenesMap[p.sceneId]
    await sendChat(project.id, {
      id: uid('msg_'),
      from: 'user',
      at: new Date().toISOString(),
      text: `🎬 ${editClaudeText(p)}`,
      ...(scene && n > 0 ? { sceneId: scene.id, sceneLabel: `Escena ${pad2(n)} · ${scene.title}` } : {}),
    })
    save(markEditAskedClaude(threads, ref))
    toast('Pedido enviado a Claude por el chat 🎬')
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line bg-[#0f1828] p-2.5" aria-label="Consultar GPT sobre la edición">
      <div className="flex items-start gap-2">
        <p className="flex-1 text-[13px] text-ink-3">GPT revisa el ritmo, el orden y la duración de las escenas y sus planos. Tú decides qué se queda.</p>
        {onClose && (
          <button className="btn btn-sm btn-ghost" onClick={onClose} aria-label="Cerrar Consultar GPT">
            <X size={13} />
          </button>
        )}
      </div>

      {isDesktop() && (
        <div className="flex flex-wrap items-center gap-1.5" aria-label="Conversaciones con GPT">
          {(showArchived ? archived : active).map((x) => (
            <button key={x.id} className={`btn btn-sm ${x.id === current?.id ? '' : 'btn-ghost'}`} aria-pressed={x.id === current?.id} onClick={() => setCurrentId(x.id)}>
              {x.title}
            </button>
          ))}
          {!showArchived && (
            <button className="btn btn-sm btn-ghost" onClick={startThread}>
              <Plus size={13} /> Nueva conversación
            </button>
          )}
          {current && (
            <button
              className="btn btn-sm btn-ghost"
              onClick={() => save(setArchived(threads, current.id, !current.archived))}
              aria-label={current.archived ? 'Sacar del archivo' : 'Archivar conversación'}
            >
              {current.archived ? <ArchiveRestore size={13} /> : <Archive size={13} />} {current.archived ? 'Sacar del archivo' : 'Archivar'}
            </button>
          )}
          {(archived.length > 0 || showArchived) && (
            <button
              className="text-[12px] text-sel-2 hover:underline"
              onClick={() => {
                setShowArchived((v) => !v)
                setCurrentId(null)
              }}
            >
              {showArchived ? 'Ver conversaciones activas' : `Ver archivadas (${archived.length})`}
            </button>
          )}
        </div>
      )}

      {current && current.messages.length > 0 && (
        <ul className="flex max-h-[420px] flex-col gap-2 overflow-y-auto" aria-label="Mensajes con GPT">
          {current.messages.map((m) => (
            <li key={m.id} className="flex flex-col gap-1.5">
              <div className={`rounded-[10px] px-2.5 py-1.5 text-[14px] ${m.from === 'director' ? 'self-end bg-sel/15' : 'bg-bg/60'}`}>
                <b className="text-[12px] text-ink-3">{m.from === 'director' ? 'Tú' : 'GPT'}</b>
                <div className="whitespace-pre-wrap">{m.text}</div>
              </div>
              {m.proposals && m.proposals.length > 0 && (
                <ul className="flex flex-col gap-1.5" aria-label="Propuestas de GPT">
                  {m.proposals.map((p) => {
                    const ref = { threadId: current.id, messageId: m.id, proposalId: p.id }
                    return (
                      <ProposalRow
                        key={p.id}
                        p={p}
                        stale={isEditStale(p, scenes)}
                        onAccept={() => void accept(ref, p)}
                        onEdit={(text) => save(editEditProposal(threads, ref, text))}
                        onDiscard={() => save(discardEditProposal(threads, ref))}
                        onAskClaude={() => void askClaude(ref, p)}
                        onUndo={() => undo(ref)}
                      />
                    )
                  })}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}

      {!current?.archived && (
        <>
          {isDesktop() && (
            <div className="flex flex-wrap gap-1.5">
              {CHIPS.map((c) => (
                <button key={c} className="btn btn-sm btn-ghost" onClick={() => setRequest(c)}>
                  {c}
                </button>
              ))}
            </div>
          )}
          {isDesktop() && (
            <textarea
              className="field"
              rows={2}
              aria-label="Pedido para GPT"
              placeholder="Ej.: El final se siente lento. ¿Qué escenas acortarías?"
              value={request}
              onChange={(e) => setRequest(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !busy) void send()
              }}
            />
          )}
          <ConsultGptButton busy={busy} onClick={() => void send()} label="Consultar GPT" busyLabel="GPT está pensando…" className="btn btn-sm self-start" />
        </>
      )}
      {message && (
        <p className="text-[13.5px] text-ink-2" role="status">
          {message}
        </p>
      )}
    </div>
  )
}
