// Biblia · Etapas y decisiones: etapas de la historia (ANTES / DESPUÉS), reglas del director
// y el botón «Revisar continuidad» (auditor sin IA: solo avisa, no cambia nada).
import { useMemo, useState } from 'react'
import { AlertTriangle, ArrowDown, ArrowUp, Check, CircleAlert, Info, Plus, ShieldCheck, Trash2, X } from 'lucide-react'
import { useProject } from '../../stores/projectStore'
import { toast, useUI } from '../../stores/uiStore'
import { orderedScenes } from '../../features/script-sync/derive'
import { auditContinuity, type Finding, type Severity } from '../../features/continuity/continuity'
import { selectScene } from '../../features/scene-management/actions'
import type { Decision, DecisionAuthor } from '../../types'
import { Section } from './bibleUi'
import { GptPanel } from '../gpt/GptPanel'

const SEVERITY: Record<Severity, { label: string; cls: string; icon: React.ReactNode }> = {
  high: { label: 'Alta', cls: 'border-bad/50 bg-bad/10 text-[#fecaca]', icon: <CircleAlert size={15} /> },
  review: { label: 'Revisar', cls: 'border-warn/50 bg-warn/10 text-[#fde68a]', icon: <AlertTriangle size={15} /> },
  low: { label: 'Baja', cls: 'border-line bg-bg/60 text-ink-2', icon: <Info size={15} /> },
}

const RANK: Record<Severity, number> = { high: 0, review: 1, low: 2 }

const AUTHOR: Record<DecisionAuthor, string> = { director: 'Director', claude: 'Claude', gpt: 'GPT' }

const STATUS: Record<Decision['status'], { label: string; cls: string }> = {
  approved: { label: '✓ Aprobada', cls: 'text-ok' },
  proposed: { label: 'Propuesta, falta aprobar', cls: 'text-warn' },
  rejected: { label: 'Rechazada', cls: 'text-ink-3' },
}

function PhasesList() {
  const phases = useProject((s) => s.project?.phases) ?? []
  const [name, setName] = useState('')
  const { addPhase, renamePhase, movePhase, removePhase } = useProject.getState()
  const add = () => {
    if (addPhase(name)) setName('')
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="text-[14px] font-semibold">Etapas de la historia</div>
      <p className="-mt-1 text-[13px] text-ink-3">En orden. Ej.: ANTES (comandas de papel) → TRANSICIÓN → DESPUÉS (con la app).</p>
      {phases.length > 0 && (
        <ol className="flex flex-col gap-1.5" aria-label="Etapas">
          {phases.map((p, i) => (
            <li key={p.id} className="flex items-center gap-1.5">
              <span className="w-6 shrink-0 text-center text-[13px] font-semibold tabular-nums text-ink-3">{i + 1}</span>
              <input className="field !h-9 min-w-0 flex-1 !text-[14px]" aria-label={`Nombre de la etapa ${i + 1}`} value={p.name} onChange={(e) => renamePhase(p.id, e.target.value)} />
              <button className="icon-btn sm" disabled={i === 0} onClick={() => movePhase(p.id, i - 1)} aria-label={`Subir ${p.name}`} title="Subir">
                <ArrowUp size={14} />
              </button>
              <button className="icon-btn sm" disabled={i === phases.length - 1} onClick={() => movePhase(p.id, i + 1)} aria-label={`Bajar ${p.name}`} title="Bajar">
                <ArrowDown size={14} />
              </button>
              <button
                className="icon-btn sm"
                onClick={() => {
                  removePhase(p.id)
                  toast(`Etapa «${p.name}» quitada (puedes deshacer)`)
                }}
                aria-label={`Quitar ${p.name}`}
                title="Quitar etapa"
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ol>
      )}
      <div className="flex gap-2">
        <input
          className="field !h-9 min-w-0 flex-1 !text-[14px]"
          aria-label="Nueva etapa"
          placeholder={phases.length ? 'Otra etapa…' : 'Ej.: ANTES'}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
        <button className="btn !h-9" onClick={add} disabled={!name.trim()}>
          <Plus size={15} /> Agregar etapa
        </button>
      </div>
    </div>
  )
}

function DecisionRow({ d }: { d: Decision }) {
  const { updateDecision, approveDecision, rejectDecision, removeDecision } = useProject.getState()
  const st = STATUS[d.status]
  return (
    <li className={`flex flex-col gap-1.5 rounded-[10px] border p-2 ${d.status === 'proposed' ? 'border-warn/40' : 'border-line'}`}>
      <textarea className="field !text-[14px] leading-snug" rows={2} aria-label="Texto de la decisión" value={d.text} onChange={(e) => updateDecision(d.id, { text: e.target.value })} />
      <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
        <span className="text-ink-3">Propone: {AUTHOR[d.proposedBy]}</span>
        <span className={st.cls}>{st.label}</span>
        {d.allowsBackstep && <span className="text-ink-3">· permite regresar de etapa</span>}
        <span className="ml-auto flex gap-1.5">
          {d.status !== 'approved' && (
            <button className="btn btn-sm" onClick={() => approveDecision(d.id)} aria-label="Aprobar decisión">
              <Check size={13} /> Aprobar
            </button>
          )}
          {d.status !== 'rejected' && (
            <button className="btn btn-sm btn-ghost" onClick={() => rejectDecision(d.id)} aria-label="Rechazar decisión">
              <X size={13} /> Rechazar
            </button>
          )}
          <button className="icon-btn sm" onClick={() => removeDecision(d.id)} aria-label="Quitar decisión" title="Quitar">
            <Trash2 size={13} />
          </button>
        </span>
      </div>
    </li>
  )
}

function DecisionsList() {
  const decisions = useProject((s) => s.project?.decisions) ?? []
  const [text, setText] = useState('')
  const add = () => {
    if (useProject.getState().addDecision(text)) setText('')
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="text-[14px] font-semibold">Decisiones del director</div>
      <p className="-mt-1 text-[13px] text-ink-3">Reglas que Claude y GPT deben respetar. Ellos pueden proponer; solo tú apruebas.</p>
      {decisions.length > 0 && (
        <ul className="flex flex-col gap-1.5" aria-label="Decisiones">
          {decisions.map((d) => (
            <DecisionRow key={d.id} d={d} />
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <input
          className="field !h-9 min-w-0 flex-1 !text-[14px]"
          aria-label="Nueva decisión"
          placeholder="Ej.: La plancha siempre a la izquierda."
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
        <button className="btn !h-9" onClick={add} disabled={!text.trim()}>
          <Plus size={15} /> Agregar decisión
        </button>
      </div>
    </div>
  )
}

function FindingRow({ f, n, onDismiss }: { f: Finding; n?: number; onDismiss: () => void }) {
  const sev = SEVERITY[f.severity]
  const go = () => {
    if (!f.sceneId) return
    useUI.setState({ view: 'studio' })
    setTimeout(() => selectScene(f.sceneId!, { seek: true }), 50)
  }
  return (
    <li className={`flex flex-col gap-1 rounded-[10px] border p-2.5 ${sev.cls}`}>
      <div className="flex items-start gap-2 text-[14px]">
        <span className="mt-0.5 shrink-0">{sev.icon}</span>
        <span className="min-w-0 flex-1">
          <b>{sev.label}</b>
          {n !== undefined && <span className="text-ink-3"> · escena {String(n).padStart(2, '0')}</span>} — {f.problem}
        </span>
      </div>
      {f.quote && (
        <div className="pl-6 text-[13px]">
          Dice: <mark className="rounded bg-white/15 px-1 text-inherit">«{f.quote}»</mark>
        </div>
      )}
      <div className="pl-6 text-[13px] text-ink-2">{f.suggestion}</div>
      <div className="flex gap-1.5 pl-6 pt-0.5">
        {f.sceneId && (
          <button className="btn btn-sm" onClick={go}>
            Ir a la escena
          </button>
        )}
        <button className="btn btn-sm btn-ghost" onClick={onDismiss}>
          Entendido
        </button>
      </div>
    </li>
  )
}

function Audit() {
  const project = useProject((s) => s.project)
  const scenesMap = useProject((s) => s.scenes)
  const [open, setOpen] = useState(false)
  // «Entendido» solo esconde el aviso en esta sesión: los avisos no se guardan en el proyecto.
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const scenes = useMemo(() => (project ? orderedScenes(project, scenesMap) : []), [project, scenesMap])
  const findings = useMemo(() => (project && open ? auditContinuity(project, scenes) : []), [project, scenes, open])
  if (!project) return null
  // Primero los altos, luego los de revisar y al final los bajos (sin perder el orden de las escenas).
  const visible = findings.filter((f) => !dismissed.has(f.id)).sort((a, b) => RANK[a.severity] - RANK[b.severity])
  const number = new Map(scenes.map((s, i) => [s.id, i + 1]))
  const high = visible.filter((f) => f.severity === 'high').length

  return (
    <div className="flex flex-col gap-2">
      <button className="btn btn-hero !h-11 !justify-center !text-[15px]" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <ShieldCheck size={17} /> {open ? 'Ocultar revisión' : 'Revisar continuidad'}
      </button>
      {open && (
        <div className="flex flex-col gap-2" aria-label="Resultado de la revisión">
          {!project.phases?.length && <p className="text-[13.5px] text-ink-3">Agrega etapas y di en qué etapas aparece cada locación u objeto para poder revisar.</p>}
          {visible.length === 0 ? (
            <p className="text-[14px] text-ok">✓ Sin avisos de continuidad.</p>
          ) : (
            <>
              <p className="text-[13.5px] text-ink-2">
                {visible.length} aviso{visible.length === 1 ? '' : 's'}
                {high ? ` · ${high} alto${high === 1 ? '' : 's'}` : ''}. Solo avisa: no cambia nada.
              </p>
              <ul className="flex flex-col gap-1.5" aria-label="Avisos de continuidad">
                {visible.map((f) => (
                  <FindingRow key={f.id} f={f} n={f.sceneId ? number.get(f.sceneId) : undefined} onDismiss={() => setDismissed((d) => new Set(d).add(f.id))} />
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  )
}

/** Sección de la Biblia: etapas, decisiones y revisión de continuidad. */
export function ContinuitySection({ n }: { n: number }) {
  const phases = useProject((s) => s.project?.phases?.length ?? 0)
  const approved = useProject((s) => s.project?.decisions?.filter((d) => d.status === 'approved').length ?? 0)
  return (
    <Section n={n} title="Etapas y decisiones" count={`${phases} etapa${phases === 1 ? '' : 's'} · ${approved} aprobada${approved === 1 ? '' : 's'}`}>
      <PhasesList />
      <hr className="border-line" />
      <DecisionsList />
      <hr className="border-line" />
      <Audit />
      <GptPanel />
    </Section>
  )
}
