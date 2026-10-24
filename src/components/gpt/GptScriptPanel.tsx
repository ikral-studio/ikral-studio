// «Consultar GPT» en guion y diálogos de una escena: conversaciones (hilos) con historial y propuestas.
// GPT solo propone. Al Aceptar, la app cambia la escena con sus acciones de siempre (deshacer + guardado).
// Cada propuesta: Aceptar · Editar · Descartar · Pedir a Claude, y se puede deshacer.
import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Archive, ArchiveRestore, Check, MessageSquare, Pencil, Plus, RotateCcw, X } from 'lucide-react'
import { useProject } from '../../stores/projectStore'
import { askConfirm, toast } from '../../stores/uiStore'
import { isDesktop, readGptThreads, sendChat } from '../../database/db'
import { saveSectionThreads } from '../../features/gpt/threadsFile'
import { orderedScenes } from '../../features/script-sync/derive'
import { runScriptConsult } from '../../features/gpt/client'
import {
  acceptScriptProposal,
  describeScriptProposal,
  discardScriptProposal,
  editScriptProposal,
  isScriptStale,
  markScriptAskedClaude,
  scriptClaudeText,
  undoScriptProposal,
  type ProposalRef,
  type ScriptOps,
  type ScriptProposal,
} from '../../features/gpt/script'
import { newThread, setArchived, threadsFor, upsertThread, type GptThread, type GptThreadsFile } from '../../features/gpt/threads'
import { pad2, uid } from '../../utils'
import { ConsultGptButton } from './ConsultGptButton'

const CHIPS = ['Mejorar diálogos', 'Desarrollar la acción', 'Hacerlo más corto', 'Revisar que suene natural']

const DONE: Record<Exclude<ScriptProposal['status'], 'pending'>, string> = {
  accepted: '✓ Aceptada',
  discarded: 'Descartada',
  'asked-claude': 'Enviada a Claude',
}

const ops: ScriptOps = {
  setScriptField: (sceneId, field, value) => {
    const s = useProject.getState()
    const scene = s.scenes[sceneId]
    if (scene) s.updateScene(sceneId, { script: { ...scene.script, [field]: value } })
  },
}

function ProposalRow({ p, stale, onAccept, onEdit, onDiscard, onAskClaude, onUndo }: {
  p: ScriptProposal
  stale: boolean
  onAccept: () => void
  onEdit: (patch: Partial<Pick<ScriptProposal, 'text' | 'speaker' | 'emotion'>>) => void
  onDiscard: () => void
  onAskClaude: () => void
  onUndo: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(p.text)
  const [speaker, setSpeaker] = useState(p.speaker ?? '')
  const [emotion, setEmotion] = useState(p.emotion ?? '')
  const lineKind = p.kind === 'line-edit' || p.kind === 'line-add'
  return (
    <li className="flex flex-col gap-1 rounded-[10px] border border-line bg-bg/60 p-2.5 text-[14px]">
      <div>{describeScriptProposal(p)}</div>
      {p.reason && <div className="pl-3 text-[13px] text-ink-2">Motivo: {p.reason}</div>}
      {stale && (
        <div className="flex items-center gap-1.5 pl-3 text-[13px] text-warn" role="note">
          <AlertTriangle size={14} /> Esto cambió desde que GPT lo propuso. Revísalo antes de aceptar.
        </div>
      )}
      {editing && (
        <div className="flex flex-col gap-1.5 pl-3">
          {lineKind && (
            <div className="flex gap-1.5">
              <input className="field !h-8 min-w-0 flex-1 !text-[13.5px]" aria-label="Personaje propuesto" value={speaker} onChange={(e) => setSpeaker(e.target.value)} placeholder="Personaje" />
              <input className="field !h-8 min-w-0 flex-1 !text-[13.5px]" aria-label="Emoción propuesta" value={emotion} onChange={(e) => setEmotion(e.target.value)} placeholder="Emoción" />
            </div>
          )}
          {p.kind !== 'line-remove' && (
            <textarea className="field !text-[13.5px]" rows={2} aria-label="Texto propuesto" value={text} onChange={(e) => setText(e.target.value)} />
          )}
          <button
            className="btn btn-sm self-start"
            onClick={() => {
              onEdit(lineKind ? { text: text.trim(), speaker: speaker.trim() || undefined, emotion: emotion.trim() || undefined } : { text: text.trim() })
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
            {p.kind !== 'line-remove' && (
              <button className="btn btn-sm btn-ghost" onClick={() => setEditing((e) => !e)} aria-label="Editar propuesta">
                <Pencil size={13} /> Editar
              </button>
            )}
            <button className="btn btn-sm btn-ghost" onClick={onDiscard} aria-label="Descartar propuesta">
              <X size={13} /> Descartar
            </button>
            <button className="btn btn-sm btn-ghost" onClick={onAskClaude} aria-label="Pedir a Claude">
              <MessageSquare size={13} /> Pedir a Claude
            </button>
          </>
        ) : (
          <>
            <span className="text-[13px] text-ink-2">{DONE[p.status]}</span>
            <button className="btn btn-sm btn-ghost" onClick={onUndo} aria-label="Deshacer propuesta">
              <RotateCcw size={13} /> Deshacer
            </button>
          </>
        )}
      </div>
    </li>
  )
}

export function GptScriptPanel({ sceneId, n }: { sceneId: string; n: number }) {
  const project = useProject((s) => s.project)
  const scenesMap = useProject((s) => s.scenes)
  const scene = scenesMap[sceneId]
  const pid = project?.id
  const [threads, setThreads] = useState<GptThread[]>([])
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [request, setRequest] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const scenes = useMemo(() => (project ? orderedScenes(project, scenesMap) : []), [project, scenesMap])

  useEffect(() => {
    setThreads([])
    setMessage(null)
    if (!pid || !isDesktop()) return
    let alive = true
    readGptThreads<GptThreadsFile>(pid)
      .then((f) => alive && setThreads(Array.isArray(f?.threads) ? f.threads : []))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [pid])

  if (!project || !scene) return null

  const active = threadsFor(threads, sceneId)
  const archived = threadsFor(threads, sceneId, true)
  const current = threads.find((t) => t.id === currentId && t.sceneId === sceneId) ?? active[0]

  const save = (next: GptThread[]) => {
    setThreads(next)
    void saveSectionThreads(project.id, 'script', next).catch(() => toast('No se pudo guardar la conversación con GPT', 'error'))
  }

  const startThread = () => {
    const t = newThread(sceneId, `Conversación ${active.length + archived.length + 1}`)
    save(upsertThread(threads, t))
    setCurrentId(t.id)
    setMessage(null)
  }

  const send = async () => {
    const text = request.trim()
    if (!text) return setMessage('Escribe qué quieres pedirle a GPT.')
    const base = current ?? newThread(sceneId, text.slice(0, 40))
    setBusy(true)
    setMessage(null)
    const r = await runScriptConsult(project, scenes, scene, base, text)
    setBusy(false)
    if (!r.ok) return setMessage(r.message)
    // Se guarda sobre lo último (pudo cambiar mientras GPT pensaba).
    setThreads((prev) => {
      const next = upsertThread(prev, { ...r.thread, archived: undefined })
      void saveSectionThreads(project.id, 'script', next).catch(() => toast('No se pudo guardar la conversación con GPT', 'error'))
      return next
    })
    setCurrentId(r.thread.id)
    setRequest('')
    const k = r.thread.messages.at(-1)?.proposals?.length ?? 0
    setMessage(k ? `GPT propone ${k} cambio(s). Nada cambió todavía.` : 'GPT respondió sin propuestas de cambio.')
  }

  const accept = async (ref: ProposalRef, p: ScriptProposal) => {
    const now = useProject.getState().scenes[sceneId]
    if (!now) return
    if (isScriptStale(p, now)) {
      const ok = await askConfirm({
        title: '¿Aceptar de todos modos?',
        body: 'Esto cambió desde que GPT lo propuso. Si lo aceptas, se aplica sobre lo que hay ahora. Puedes deshacer.',
        confirmLabel: 'Aceptar',
      })
      if (!ok) return
    }
    const r = acceptScriptProposal(threads, ref, now, ops)
    if (!r.ok) return toast(r.error === 'missing' ? 'Esa línea ya no existe. No se cambió nada.' : 'Esta propuesta ya no está pendiente.', 'info')
    save(r.threads)
    toast('Cambio aplicado. Puedes deshacerlo.')
  }

  const undo = (ref: ProposalRef) => {
    const r = undoScriptProposal(threads, ref, useProject.getState().scenes[sceneId], ops)
    if (!r.ok) return toast('Ese texto se editó después. Para no perder tus cambios, no lo regresé.', 'info')
    save(r.threads)
  }

  const askClaude = async (ref: ProposalRef, p: ScriptProposal) => {
    await sendChat(project.id, { id: uid('msg_'), from: 'user', at: new Date().toISOString(), text: `✍️ ${scriptClaudeText(p, n)}`, sceneId, sceneLabel: `Escena ${pad2(n)} · ${scene.title}` })
    save(markScriptAskedClaude(threads, ref))
    toast('Pedido enviado a Claude por el chat ✍️')
  }

  return (
    <div className="mt-3 flex flex-col gap-2 rounded-xl border border-line bg-[#0f1828] p-2.5" aria-label="Consultar GPT sobre el guion">
      <p className="text-[13px] text-ink-3">GPT propone cambios a la acción y los diálogos de esta escena. Tú decides qué se queda.</p>

      {isDesktop() && (
        <div className="flex flex-wrap items-center gap-1.5" aria-label="Conversaciones con GPT">
          {(showArchived ? archived : active).map((t) => (
            <button
              key={t.id}
              className={`btn btn-sm ${t.id === current?.id ? '' : 'btn-ghost'}`}
              aria-pressed={t.id === current?.id}
              onClick={() => setCurrentId(t.id)}
            >
              {t.title}
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
                        stale={isScriptStale(p, scene)}
                        onAccept={() => void accept(ref, p)}
                        onEdit={(patch) => save(editScriptProposal(threads, ref, patch))}
                        onDiscard={() => save(discardScriptProposal(threads, ref))}
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
              placeholder="Ej.: Haz que el diálogo de la abuela suene más cálido."
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
