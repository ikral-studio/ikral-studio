// Revisión de continuidad con GPT (texto + imágenes). GPT solo propone: nada cambia hasta que el director acepta.
// Cada propuesta: Aceptar · Editar · Descartar · Pedir a Claude, y se puede deshacer.
import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Check, MessageSquare, Pencil, RotateCcw, X } from 'lucide-react'
import { useProject } from '../../stores/projectStore'
import { toast } from '../../stores/uiStore'
import { isDesktop, readGptReviews, saveGptReviews, sendChat } from '../../database/db'
import { orderedScenes } from '../../features/script-sync/derive'
import { runContinuityReview } from '../../features/gpt/client'
import {
  acceptProposal,
  addReview,
  claudeRequestText,
  discardProposal,
  editProposal,
  isStale,
  markAskedClaude,
  undoProposal,
  type GptProposal,
  type GptReview,
  type GptReviewsFile,
  type GptSeverity,
} from '../../features/gpt/proposals'
import { pad2, uid } from '../../utils'
import { ConsultGptButton } from './ConsultGptButton'

const SEVERITY: Record<GptSeverity, { label: string; cls: string }> = {
  alta: { label: 'Alta', cls: 'border-bad/50 bg-bad/10' },
  media: { label: 'Media', cls: 'border-warn/50 bg-warn/10' },
  baja: { label: 'Baja', cls: 'border-line bg-bg/60' },
}

const DONE: Record<Exclude<GptProposal['status'], 'pending'>, string> = {
  accepted: '✓ Aceptada',
  discarded: 'Descartada',
  'asked-claude': 'Enviada a Claude',
}

function ProposalRow({ p, n, stale, onAccept, onEdit, onDiscard, onAskClaude, onUndo }: {
  p: GptProposal
  n?: number
  stale: boolean
  onAccept: () => void
  onEdit: (rule: string) => void
  onDiscard: () => void
  onAskClaude: () => void
  onUndo: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [rule, setRule] = useState(p.rule ?? '')
  const sev = SEVERITY[p.severity]
  return (
    <li className={`flex flex-col gap-1 rounded-[10px] border p-2.5 text-[14px] ${sev.cls}`}>
      <div>
        <b>{sev.label}</b>
        {n !== undefined && <span className="text-ink-3"> · escena {pad2(n)}</span>} — {p.problem}
      </div>
      {p.evidence && <div className="pl-3 text-[13px] text-ink-2">Evidencia: {p.evidence}</div>}
      {p.correction && <div className="pl-3 text-[13px] text-ink-2">Corrección: {p.correction}</div>}
      {stale && (
        <div className="flex items-center gap-1.5 pl-3 text-[13px] text-warn" role="note">
          <AlertTriangle size={14} /> Esto cambió desde que GPT lo propuso. Revísalo antes de aceptar.
        </div>
      )}
      {editing ? (
        <div className="flex gap-1.5 pl-3">
          <input className="field !h-8 min-w-0 flex-1 !text-[13.5px]" aria-label="Regla propuesta" value={rule} onChange={(e) => setRule(e.target.value)} placeholder="Regla para las decisiones (opcional)" />
          <button
            className="btn btn-sm"
            onClick={() => {
              onEdit(rule)
              setEditing(false)
            }}
          >
            Guardar
          </button>
        </div>
      ) : (
        p.rule && <div className="pl-3 text-[13px]">Regla propuesta: «{p.rule}»</div>
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

export function GptPanel() {
  const project = useProject((s) => s.project)
  const scenesMap = useProject((s) => s.scenes)
  const pid = project?.id
  const [reviews, setReviews] = useState<GptReview[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const scenes = useMemo(() => (project ? orderedScenes(project, scenesMap) : []), [project, scenesMap])
  const number = useMemo(() => new Map(scenes.map((s, i) => [s.id, i + 1])), [scenes])

  useEffect(() => {
    setReviews([])
    setMessage(null)
    if (!pid || !isDesktop()) return
    let alive = true
    readGptReviews<GptReviewsFile>(pid)
      .then((f) => alive && setReviews(Array.isArray(f?.reviews) ? f.reviews : []))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [pid])

  if (!project) return null

  const save = (next: GptReview[]) => {
    setReviews(next)
    void saveGptReviews(project.id, { reviews: next } satisfies GptReviewsFile).catch(() => toast('No se pudo guardar la revisión de GPT', 'error'))
  }

  const consult = async () => {
    setBusy(true)
    setMessage(null)
    const r = await runContinuityReview(project, scenes, scenesMap)
    setBusy(false)
    if (!r.ok) return setMessage(r.message)
    save(addReview(reviews, r.review))
    const left = r.imagesLeftOut ? ` (${r.imagesLeftOut} imágenes no se mandaron por el tope)` : ''
    setMessage(r.review.proposals.length ? `GPT propone ${r.review.proposals.length} cambio(s). Nada cambió todavía.${left}` : `GPT no encontró problemas.${left}`)
  }

  const ops = () => {
    const s = useProject.getState()
    return { addDecision: s.addDecision, approveDecision: s.approveDecision, removeDecision: s.removeDecision }
  }

  const askClaude = async (r: GptReview, p: GptProposal) => {
    const n = p.sceneId ? number.get(p.sceneId) : undefined
    const label = n ? `Escena ${pad2(n)} · ${scenesMap[p.sceneId!]?.title ?? ''}` : undefined
    await sendChat(project.id, { id: uid('msg_'), from: 'user', at: new Date().toISOString(), text: `🔎 ${claudeRequestText(p, n)}`, sceneId: p.sceneId, sceneLabel: label })
    save(markAskedClaude(reviews, r.id, p.id))
    toast('Pedido enviado a Claude por el chat 🔎')
  }

  const latest = reviews[0]
  return (
    <div className="flex flex-col gap-2" aria-label="Revisión con GPT">
      <p className="text-[13px] text-ink-3">GPT revisa el guion como guionista (coherencia entre escenas) y la continuidad de las imágenes aprobadas. Solo propone: tú decides.</p>
      <textarea
        className="field !text-[14px]"
        rows={2}
        aria-label="Instrucciones de guionismo para GPT"
        placeholder="Instrucciones para GPT. Ej.: en una escena van los papelitos o la app, nunca los dos."
        value={project.bible?.reviewNotes ?? ''}
        onChange={(e) => useProject.getState().setBible({ reviewNotes: e.target.value })}
      />
      <ConsultGptButton busy={busy} onClick={consult} label="Revisar guion con GPT" />
      {message && (
        <p className="text-[13.5px] text-ink-2" role="status">
          {message}
        </p>
      )}
      {latest && (
        <div className="flex flex-col gap-1.5">
          <p className="text-[13.5px] text-ink-2">
            Última revisión de GPT ({new Date(latest.at).toLocaleString()}): {latest.summary}
          </p>
          {latest.proposals.length > 0 && (
            <ul className="flex flex-col gap-1.5" aria-label="Propuestas de GPT">
              {latest.proposals.map((p) => (
                <ProposalRow
                  key={p.id}
                  p={p}
                  n={p.sceneId ? number.get(p.sceneId) : undefined}
                  stale={p.status === 'pending' && isStale(p, scenesMap)}
                  onAccept={() => save(acceptProposal(reviews, latest.id, p.id, ops()))}
                  onEdit={(rule) => save(editProposal(reviews, latest.id, p.id, { rule }))}
                  onDiscard={() => save(discardProposal(reviews, latest.id, p.id))}
                  onAskClaude={() => void askClaude(latest, p)}
                  onUndo={() => save(undoProposal(reviews, latest.id, p.id, ops()))}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
