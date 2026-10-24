// «Consultar GPT» en la Biblia: estilo, reglas, personajes, locaciones, objetos y vestuario. Conversaciones con historial y propuestas.
// GPT solo propone. Al Aceptar, la app cambia la Biblia con sus acciones de siempre (deshacer + guardado).
// Cada propuesta: Aceptar · Editar · Descartar · Pedir a Claude, y se puede deshacer.
import { useEffect, useState } from 'react'
import { AlertTriangle, Archive, ArchiveRestore, Check, MessageSquare, MessagesSquare, Pencil, Plus, RotateCcw, X } from 'lucide-react'
import { useProject } from '../../stores/projectStore'
import { askConfirm, toast } from '../../stores/uiStore'
import { isDesktop, readGptThreads, sendChat } from '../../database/db'
import { runBibleConsult } from '../../features/gpt/client'
import { orderedScenes } from '../../features/script-sync/derive'
import {
  acceptBibleProposal,
  bibleClaudeText,
  bibleGroup,
  canEditBible,
  describeBibleProposal,
  discardBibleProposal,
  editBibleProposal,
  isBibleStale,
  markBibleAskedClaude,
  resolveBibleTarget,
  targetLabel,
  undoBibleProposal,
  type BibleGroup,
  type BibleOps,
  type BibleProposal,
  type BibleProposalRef,
  type BibleSeen,
  type BibleThread,
} from '../../features/gpt/bible'
import { newThread, setArchived, threadsFor, upsertThread, type StoredThread } from '../../features/gpt/threads'
import { saveSectionThreads } from '../../features/gpt/threadsFile'
import { uid } from '../../utils'
import type { Project } from '../../types'
import { ConsultGptButton } from './ConsultGptButton'

const CHIPS: Record<BibleGroup, string[]> = {
  style: ['Afinar el estilo', 'Proponer reglas de estilo', 'Que todo combine'],
  rules: ['Proponer reglas de continuidad', '¿Qué no puede cambiar entre etapas?', '¿Falta alguna regla?'],
  characters: ['Desarrollar personalidad', 'Mejorar cómo se ve', 'Proponer relaciones'],
  item: ['Mejorar la descripción', 'Proponer otros nombres', '¿En qué etapas existe?'],
}

const DONE: Record<Exclude<BibleProposal['status'], 'pending'>, string> = {
  accepted: '✓ Aceptada',
  discarded: 'Descartada',
  'asked-claude': 'Enviada a Claude',
}

const ops = (): BibleOps => {
  const s = useProject.getState()
  return {
    project: () => useProject.getState().project,
    setStyle: s.setStyle,
    setBible: s.setBible,
    updateCharacter: s.updateCharacter,
    updateItem: s.updateItem,
    addRelation: s.addRelation,
    removeRelation: s.removeRelation,
    addDecision: s.addDecision,
    approveDecision: s.approveDecision,
    removeDecision: s.removeDecision,
  }
}

const isBible = (t: StoredThread) => t.section === 'bible'

function ProposalRow({ p, project, stale, onAccept, onEdit, onDiscard, onAskClaude, onUndo }: {
  p: BibleProposal
  project: Project
  stale: boolean
  onAccept: () => void
  onEdit: (text: string) => void
  onDiscard: () => void
  onAskClaude: () => void
  onUndo: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(p.text)
  return (
    <li className="flex flex-col gap-1 rounded-[10px] border border-line bg-bg/60 p-2.5 text-[14px]">
      <div>{describeBibleProposal(p, project)}</div>
      {p.reason && <div className="pl-3 text-[13px] text-ink-2">Motivo: {p.reason}</div>}
      {stale && (
        <div className="flex items-center gap-1.5 pl-3 text-[13px] text-warn" role="note">
          <AlertTriangle size={14} /> Esto cambió desde que GPT lo propuso. Revísalo antes de aceptar.
        </div>
      )}
      {editing && (
        <div className="flex flex-col gap-1.5 pl-3">
          <textarea className="field !text-[13.5px]" rows={2} aria-label="Texto propuesto" value={text} onChange={(e) => setText(e.target.value)} />
          <button
            className="btn btn-sm self-start"
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
            {canEditBible(p) && (
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

/** Botón «Consultar GPT» que abre y cierra el panel de un apartado de la Biblia. */
export function GptBibleToggle({ target, className = 'btn !h-9' }: { target: string; className?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button className={className} onClick={() => setOpen((v) => !v)} aria-expanded={open} title="GPT propone cambios a este apartado; tú decides">
        <MessagesSquare size={15} /> Consultar GPT
      </button>
      {open && (
        <div className="basis-full">
          <GptBiblePanel target={target} />
        </div>
      )}
    </>
  )
}

/** `target`: «style» o «<tipo>:<id>» (ver `targetKey`). */
export function GptBiblePanel({ target }: { target: string }) {
  const project = useProject((s) => s.project)
  const pid = project?.id
  const [all, setAll] = useState<StoredThread[]>([])
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [request, setRequest] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

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

  const t = project ? resolveBibleTarget(project, target) : null
  if (!project || !t) return null

  const threads = all.filter(isBible) as unknown as BibleThread[]
  const active = threadsFor(threads, target, false, 'bible')
  const archived = threadsFor(threads, target, true, 'bible')
  const current = threads.find((x) => x.id === currentId && x.sceneId === target) ?? active[0]
  const chips = CHIPS[bibleGroup(t)]

  const persist = (next: StoredThread[]) =>
    void saveSectionThreads(project.id, 'bible', next).catch(() => toast('No se pudo guardar la conversación con GPT', 'error'))

  /** Cambia los hilos de la Biblia y guarda. */
  const save = (next: BibleThread[]) => {
    const merged = [...next, ...all.filter((x) => !isBible(x))]
    setAll(merged)
    persist(merged)
  }

  const startThread = () => {
    const th = newThread<BibleProposal, BibleSeen>(target, `Conversación ${active.length + archived.length + 1}`, undefined, 'bible')
    save(upsertThread(threads, th))
    setCurrentId(th.id)
    setMessage(null)
  }

  const send = async () => {
    const text = request.trim()
    if (!text) return setMessage('Escribe qué quieres pedirle a GPT.')
    const base = current ?? newThread<BibleProposal, BibleSeen>(target, text.slice(0, 40), undefined, 'bible')
    setBusy(true)
    setMessage(null)
    const st = useProject.getState()
    const r = await runBibleConsult(project, orderedScenes(st.project, st.scenes), target, base, text)
    setBusy(false)
    if (!r.ok) return setMessage(r.message)
    // Se guarda sobre lo último (pudo cambiar mientras GPT pensaba).
    setAll((prev) => {
      const next = upsertThread(prev, { ...r.thread, archived: undefined } as StoredThread)
      persist(next)
      return next
    })
    setCurrentId(r.thread.id)
    setRequest('')
    const k = r.thread.messages.at(-1)?.proposals?.length ?? 0
    setMessage(k ? `GPT propone ${k} cambio(s). Nada cambió todavía.` : 'GPT respondió sin propuestas de cambio.')
  }

  const accept = async (ref: BibleProposalRef, p: BibleProposal) => {
    const now = useProject.getState().project
    if (!now) return
    if (isBibleStale(p, now)) {
      const ok = await askConfirm({
        title: '¿Aceptar de todos modos?',
        body: 'Esto cambió desde que GPT lo propuso. Si lo aceptas, se aplica sobre lo que hay ahora. Puedes deshacer.',
        confirmLabel: 'Aceptar',
      })
      if (!ok) return
    }
    const r = acceptBibleProposal(threads, ref, ops())
    if (!r.ok) return toast(r.error === 'missing' ? 'Eso ya no existe en la Biblia. No se cambió nada.' : 'Esta propuesta ya no está pendiente.', 'info')
    save(r.threads)
    toast(p.kind === 'rule' ? 'Regla aprobada por ti. Puedes deshacerla.' : 'Cambio aplicado. Puedes deshacerlo.')
  }

  const undo = (ref: BibleProposalRef) => {
    const r = undoBibleProposal(threads, ref, ops())
    if (!r.ok) return toast('Eso se editó después. Para no perder tus cambios, no lo regresé.', 'info')
    save(r.threads)
  }

  const askClaude = async (ref: BibleProposalRef, p: BibleProposal) => {
    await sendChat(project.id, { id: uid('msg_'), from: 'user', at: new Date().toISOString(), text: `📖 ${bibleClaudeText(p, project)}` })
    save(markBibleAskedClaude(threads, ref))
    toast('Pedido enviado a Claude por el chat 📖')
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line bg-[#0f1828] p-2.5" aria-label={`Consultar GPT sobre ${targetLabel(t)}`}>
      <p className="text-[13px] text-ink-3">GPT propone cambios a este apartado de la Biblia. Tú decides qué se queda.</p>

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
                        project={project}
                        stale={isBibleStale(p, project)}
                        onAccept={() => void accept(ref, p)}
                        onEdit={(text) => save(editBibleProposal(threads, ref, text))}
                        onDiscard={() => save(discardBibleProposal(threads, ref))}
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
              {chips.map((c) => (
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
              placeholder="Ej.: Dale más personalidad y dime cómo se lleva con los demás."
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
