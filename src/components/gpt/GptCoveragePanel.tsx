// «Consultar GPT» en cobertura y planos: proponer la lista de planos de una escena o diseñar un plano
// (cámara, prompt de imagen inicial/final y de video). Conversaciones con historial y propuestas.
// GPT solo propone. Al Aceptar, la app cambia los planos con sus acciones de siempre (deshacer + guardado).
// Cada propuesta: Aceptar · Editar · Descartar · Pedir a Claude, y se puede deshacer.
import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Archive, ArchiveRestore, Check, MessageSquare, MessagesSquare, Pencil, Plus, RotateCcw, X } from 'lucide-react'
import { useProject } from '../../stores/projectStore'
import { askConfirm, toast } from '../../stores/uiStore'
import { isDesktop, readGptThreads, sendChat } from '../../database/db'
import { orderedScenes } from '../../features/script-sync/derive'
import { runCoverageConsult } from '../../features/gpt/client'
import {
  acceptCoverageProposal,
  coverageClaudeText,
  coverageKey,
  describeCoverageProposal,
  discardCoverageProposal,
  editCoverageProposal,
  isCoverageStale,
  markCoverageAskedClaude,
  needsCoverage,
  undoCoverageProposal,
  type CoverageOps,
  type CoverageProposal,
  type CoverageProposalRef,
  type CoverageSeen,
  type CoverageThread,
} from '../../features/gpt/coverage'
import { shotsOf } from '../../features/coverage/shots'
import { newThread, setArchived, threadsFor, upsertThread, type StoredThread } from '../../features/gpt/threads'
import { saveSectionThreads } from '../../features/gpt/threadsFile'
import { doneText } from '../../features/gpt/done'
import { pad2, uid } from '../../utils'
import { ConsultGptButton } from './ConsultGptButton'

const CHIPS = {
  coverage: ['Proponer planos', 'Cubrir los diálogos', 'Ajustar las duraciones', 'Más variedad de cámara'],
  shot: ['Diseñar la cámara', 'Escribir el prompt de imagen', 'Escribir el prompt de video', 'Que combine con el plano anterior'],
}


const ops = (): CoverageOps => {
  const s = useProject.getState()
  return {
    scene: (id) => useProject.getState().scenes[id],
    addShot: s.addShot,
    moveShot: s.moveShot,
    updateShot: s.updateShot,
    updateShotFramePlan: s.updateShotFramePlan,
    removeShot: s.removeShot,
  }
}

const isCoverage = (t: StoredThread) => t.section === 'coverage'

function ProposalRow({ p, stale, onAccept, onEdit, onDiscard, onAskClaude, onUndo }: {
  p: CoverageProposal
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
      <div>{describeCoverageProposal(p)}</div>
      {p.reason && <div className="pl-3 text-[13px] text-ink-2">Motivo: {p.reason}</div>}
      {stale && (
        <div className="flex items-center gap-1.5 pl-3 text-[13px] text-warn" role="note">
          <AlertTriangle size={14} /> Esto cambió desde que GPT lo propuso. Revísalo antes de aceptar.
        </div>
      )}
      {editing && (
        <div className="flex flex-col gap-1.5 pl-3">
          <textarea
            className="field !text-[13.5px]"
            rows={2}
            aria-label={p.kind === 'add-shot' ? 'Nombre del plano propuesto' : 'Texto propuesto'}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
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

/** Botón «Consultar GPT» que abre y cierra el panel de la cobertura de una escena o de un plano. */
export function GptCoverageToggle({
  sceneId,
  shotId,
  className = 'btn btn-sm btn-ghost',
  label = 'Consultar GPT',
}: {
  sceneId: string
  shotId?: string
  className?: string
  label?: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        className={className}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title={shotId ? 'GPT propone cámara y prompts para este plano; tú decides' : 'GPT propone los planos de esta escena; tú decides'}
      >
        <MessagesSquare size={14} /> {label}
      </button>
      {open && (
        <div className="basis-full">
          <GptCoveragePanel sceneId={sceneId} shotId={shotId} />
        </div>
      )}
    </>
  )
}

/** Panel de GPT para la cobertura de una escena (`shotId` vacío) o para un plano. */
export function GptCoveragePanel({ sceneId, shotId }: { sceneId: string; shotId?: string }) {
  const project = useProject((s) => s.project)
  const scenesMap = useProject((s) => s.scenes)
  const scene = scenesMap[sceneId]
  const pid = project?.id
  const key = coverageKey(sceneId, shotId)
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

  if (!project || !scene) return null
  const n = scenes.findIndex((s) => s.id === sceneId) + 1
  const shotIndex = shotId ? shotsOf(scene).findIndex((s) => s.id === shotId) : -1
  if (shotId && shotIndex < 0) return null

  const threads = all.filter(isCoverage) as unknown as CoverageThread[]
  const active = threadsFor(threads, key, false, 'coverage')
  const archived = threadsFor(threads, key, true, 'coverage')
  const current = threads.find((x) => x.id === currentId && x.sceneId === key) ?? active[0]
  const chips = CHIPS[shotId ? 'shot' : 'coverage']
  const label = shotId ? `el plano ${shotIndex + 1}` : 'los planos de cámara'

  const persist = (next: StoredThread[]) =>
    void saveSectionThreads(project.id, 'coverage', next).catch(() => toast('No se pudo guardar la conversación con GPT', 'error'))

  /** Cambia los hilos de cobertura y guarda. */
  const save = (next: CoverageThread[]) => {
    const merged = [...(next as unknown as StoredThread[]), ...all.filter((x) => !isCoverage(x))]
    setAll(merged)
    persist(merged)
  }

  const startThread = () => {
    const th = newThread<CoverageProposal, CoverageSeen>(key, `Conversación ${active.length + archived.length + 1}`, undefined, 'coverage')
    save(upsertThread(threads, th))
    setCurrentId(th.id)
    setMessage(null)
  }

  const send = async () => {
    const text = request.trim()
    if (!text) return setMessage('Escribe qué quieres pedirle a GPT.')
    const base = current ?? newThread<CoverageProposal, CoverageSeen>(key, text.slice(0, 40), undefined, 'coverage')
    setBusy(true)
    setMessage(null)
    const r = await runCoverageConsult(project, scenes, scene, key, base, text)
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

  const accept = async (ref: CoverageProposalRef, p: CoverageProposal) => {
    const now = useProject.getState().scenes[sceneId]
    if (!now) return
    if (isCoverageStale(p, now)) {
      const ok = await askConfirm({
        title: '¿Aceptar de todos modos?',
        body: 'Esto cambió desde que GPT lo propuso. Si lo aceptas, se aplica sobre lo que hay ahora. Puedes deshacer.',
        confirmLabel: 'Aceptar',
      })
      if (!ok) return
    }
    if (needsCoverage(now)) {
      // La escena aún es un solo plano: para cambiar planos pasa a cobertura (respaldo antes + Deshacer).
      const ok = await askConfirm({
        title: '¿Dividir la escena en tomas?',
        body: 'Para aplicar esto, la escena se divide en tomas. Antes se hace un respaldo y no se pierde ninguna imagen. Puedes deshacer.',
        confirmLabel: 'Dividir y aplicar',
      })
      if (!ok) return
      if (!(await useProject.getState().convertToCoverage(sceneId))) return toast('No se pudo dividir la escena en tomas. No se cambió nada.', 'error')
    }
    const r = acceptCoverageProposal(threads, ref, sceneId, ops())
    if (!r.ok) return toast(r.error === 'not-pending' ? 'Esta propuesta ya no está pendiente.' : 'Ese plano ya no existe. No se cambió nada.', 'info')
    save(r.threads)
    toast(p.kind === 'add-shot' ? 'Plano agregado. Puedes deshacerlo.' : 'Cambio aplicado. Puedes deshacerlo.')
  }

  const undo = (ref: CoverageProposalRef) => {
    const r = undoCoverageProposal(threads, ref, sceneId, ops())
    if (!r.ok) return toast('Ese plano se editó después. Para no perder tus cambios, no lo regresé.', 'info')
    save(r.threads)
  }

  const askClaude = async (ref: CoverageProposalRef, p: CoverageProposal) => {
    await sendChat(project.id, { id: uid('msg_'), from: 'user', at: new Date().toISOString(), text: `🎬 ${coverageClaudeText(p, n)}`, sceneId, sceneLabel: `Escena ${pad2(n)} · ${scene.title}` })
    save(markCoverageAskedClaude(threads, ref))
    toast('Pedido enviado a Claude por el chat 🎬')
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line bg-[#0f1828] p-2.5" aria-label={`Consultar GPT sobre ${label}`}>
      <p className="text-[13px] text-ink-3">
        {shotId ? 'GPT propone la cámara, los prompts de imagen y el de video de este plano.' : 'GPT propone planos para esta escena, con cámara y duración.'} Tú decides qué se queda.
      </p>

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
                        stale={isCoverageStale(p, scene)}
                        onAccept={() => void accept(ref, p)}
                        onEdit={(text) => save(editCoverageProposal(threads, ref, text))}
                        onDiscard={() => save(discardCoverageProposal(threads, ref))}
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
              placeholder={shotId ? 'Ej.: Haz la cámara más íntima y escribe el prompt de la imagen inicial.' : 'Ej.: Propón 4 planos para cubrir esta escena.'}
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
