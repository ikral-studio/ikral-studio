// Revisión de continuidad con GPT (texto + imágenes). GPT solo propone: nada cambia hasta que el director acepta.
// Cada propuesta dice lo que de verdad hace: «Guardar regla» (solo guarda la regla), «Revisar cambios» →
// «Aplicar corrección» (cambia fichas con vista previa) o «Marcar como revisado». También Editar · Descartar ·
// Pedir a Claude, y todo se puede deshacer. Las imágenes nunca cambian solas: «Regenerar imagen» es aparte.
import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Check, Eye, Image as ImageIcon, MessageSquare, Pencil, RotateCcw, X } from 'lucide-react'
import { useProject } from '../../stores/projectStore'
import { toast } from '../../stores/uiStore'
import { isDesktop, readGptReviews, saveGptReviews, sendChat } from '../../database/db'
import { orderedScenes } from '../../features/script-sync/derive'
import { runContinuityReview } from '../../features/gpt/client'
import { applyCorrection, outcomeText, planCorrection, regenTargets, type CorrectionPlan } from '../../features/gpt/corrections'
import { itemImagePrompt } from '../../features/bible/itemStates'
import { requestItemPreview } from '../../features/chat/requests'
import {
  acceptProposal,
  addReview,
  answerQuestion,
  undoAnswer,
  claudeRequestText,
  discardProposal,
  editProposal,
  isStale,
  markAskedClaude,
  proposalSpeechText,
  reviewSummarySpeechText,
  undoProposal,
  type GptProposal,
  type GptReview,
  type GptReviewsFile,
  type GptSeverity,
} from '../../features/gpt/proposals'
import { pad2, uid } from '../../utils'
import { ConsultGptButton } from './ConsultGptButton'
import { ListenButton } from '../common/ListenButton'

const SEVERITY: Record<GptSeverity, { label: string; cls: string }> = {
  alta: { label: 'Alta', cls: 'border-bad/50 bg-bad/10' },
  media: { label: 'Media', cls: 'border-warn/50 bg-warn/10' },
  baja: { label: 'Baja', cls: 'border-line bg-bg/60' },
}

/** Vista previa honesta: qué cambia en cada ficha (antes → después) y qué no se puede hacer solo. */
function ChangesPreview({ plan, rule }: { plan: CorrectionPlan; rule?: string }) {
  return (
    <div className="flex flex-col gap-1 pl-3 text-[13px]" aria-label="Vista previa de la corrección">
      {plan.ready.map((c, i) => (
        <div key={i} className="rounded-[8px] border border-line bg-bg/60 p-2">
          <div className="font-semibold">{c.title}</div>
          <div className="text-ink-3">Antes: {c.before}</div>
          <div>Después: {c.after}</div>
          {c.note && <div className="text-ink-3">{c.note}</div>}
        </div>
      ))}
      {rule && <div>También se guarda la regla: «{rule}»</div>}
      {plan.blocked.length > 0 && (
        <div className="text-warn" role="note">
          No se puede hacer solo: {plan.blocked.map((b) => b.reason).join(' ')}
        </div>
      )}
      <div className="text-ink-3">No cambia diálogos ni imágenes.</div>
    </div>
  )
}

function ProposalRow({ p, n, stale, plan, regen, onAccept, onApply, onAnswer, onUndoAnswer, onRegen, onEdit, onDiscard, onAskClaude, onUndo }: {
  p: GptProposal
  n?: number
  stale: boolean
  plan?: CorrectionPlan
  regen: { key: string; label: string; blocked?: string }[]
  onAccept: () => void
  onApply: () => void
  onAnswer: (option: string) => void
  onUndoAnswer: () => void
  onRegen: (key: string) => void
  onEdit: (rule: string) => void
  onDiscard: () => void
  onAskClaude: () => void
  onUndo: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [reviewing, setReviewing] = useState(false)
  const [rule, setRule] = useState(p.rule ?? '')
  const sev = SEVERITY[p.severity]
  const hasChanges = !!p.changes?.length
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
      {p.question && (
        <div className="flex flex-col gap-1 pl-3 text-[13px]" role="group" aria-label="Pregunta de GPT para el director">
          <div>
            <b>Decide tú:</b> {p.question.text}
          </div>
          {p.answer ? (
            <div className="flex items-center gap-1.5">
              Respondiste: «{p.answer}». Se guardó como decisión; no se reescribió nada.
              <button className="btn btn-sm btn-ghost" onClick={onUndoAnswer} aria-label="Deshacer respuesta">
                <RotateCcw size={13} /> Deshacer
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {p.question.options.map((o) => (
                <button key={o} className="btn btn-sm" onClick={() => onAnswer(o)}>
                  {o}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {p.status === 'pending' && reviewing && plan && <ChangesPreview plan={plan} rule={p.rule} />}
      <div className="pl-3 pt-0.5">
        <ListenButton id={`gpt-proposal:${p.id}`} text={proposalSpeechText(p, n)} />
      </div>
      <div className="flex flex-wrap gap-1.5 pl-3 pt-0.5">
        {p.status === 'pending' ? (
          <>
            {hasChanges && !reviewing && (
              <button className="btn btn-sm" onClick={() => setReviewing(true)} aria-label="Revisar cambios">
                <Eye size={13} /> Revisar cambios
              </button>
            )}
            {hasChanges && reviewing && plan && plan.ready.length > 0 && (
              <button className="btn btn-sm" onClick={onApply} aria-label="Aplicar corrección">
                <Check size={13} /> Aplicar corrección
              </button>
            )}
            {(!hasChanges || (reviewing && !plan?.ready.length)) && (
              <button className="btn btn-sm" onClick={onAccept} aria-label={p.rule ? 'Guardar regla' : 'Marcar como revisado'}>
                <Check size={13} /> {p.rule ? 'Guardar regla' : 'Marcar como revisado'}
              </button>
            )}
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
            <span className="text-[13px] text-ink-2" role="status">
              {outcomeText(p)}
            </span>
            <button className="btn btn-sm btn-ghost" onClick={onUndo} aria-label="Deshacer propuesta">
              <RotateCcw size={13} /> Deshacer
            </button>
            {/* Las imágenes nunca cambian solas: regenerar es una opción aparte. */}
            {regen.map((g) => (
              <button key={g.key} className="btn btn-sm btn-ghost" disabled={!!g.blocked} title={g.blocked} onClick={() => onRegen(g.key)}>
                <ImageIcon size={13} /> Regenerar imagen para {g.label}
              </button>
            ))}
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
    return { addDecision: s.addDecision, approveDecision: s.approveDecision, removeDecision: s.removeDecision, updateItem: s.updateItem }
  }

  const apply = (r: GptReview, p: GptProposal) => {
    save(applyCorrection(reviews, r.id, p.id, project, scenesMap, ops()))
    toast('Corrección aplicada. Las imágenes no cambiaron. Puedes deshacerla.')
  }

  /** Fotogramas que se pueden regenerar (solo si el director lo pide), con su prompt por escena. */
  const regenOf = (p: GptProposal) =>
    regenTargets(project, p).map((t) => {
      const it = project[t.kind]?.find((x) => x.id === t.itemId)
      const ip = it ? itemImagePrompt(project, t.kind, it, { mode: 'scene', sceneId: t.sceneId }, scenes) : undefined
      return { ...t, key: `${t.itemId}:${t.sceneId}`, prompt: ip?.prompt ?? '', stateId: ip?.state?.id, blocked: !ip ? 'Esa ficha ya no existe.' : ip.blocked }
    })

  const regen = (p: GptProposal, key: string) => {
    const t = regenOf(p).find((x) => x.key === key)
    if (!t || t.blocked || !t.stateId) return
    void requestItemPreview(t.kind, t.itemId, t.prompt, { stateId: t.stateId, sceneId: t.sceneId, label: t.label })
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
          <ListenButton id={`gpt-review:${latest.id}:resumen`} text={reviewSummarySpeechText(latest)} label="Escuchar resumen" />
          {latest.proposals.length > 0 && (
            <ul className="flex flex-col gap-1.5" aria-label="Propuestas de GPT">
              {latest.proposals.map((p) => (
                <ProposalRow
                  key={p.id}
                  p={p}
                  n={p.sceneId ? number.get(p.sceneId) : undefined}
                  stale={p.status === 'pending' && isStale(p, scenesMap)}
                  plan={p.status === 'pending' && p.changes?.length ? planCorrection(project, scenesMap, p) : undefined}
                  regen={p.status === 'accepted' ? regenOf(p) : []}
                  onAccept={() => save(acceptProposal(reviews, latest.id, p.id, ops()))}
                  onApply={() => apply(latest, p)}
                  onAnswer={(o) => save(answerQuestion(reviews, latest.id, p.id, o, ops()))}
                  onUndoAnswer={() => save(undoAnswer(reviews, latest.id, p.id, ops()))}
                  onRegen={(key) => regen(p, key)}
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
