// Aviso «La historia dice RESTAURANTE, pero ahora la Biblia dice FOOD TRUCK»: UNA decisión con 3 caminos, la vista
// previa de lo que cambiaría y, al aplicar, el resultado honesto con Deshacer. Nada se escoge solo y las imágenes no
// se tocan. Cada bloque se puede escuchar (🔊).
import { useMemo, useState } from 'react'
import { AlertTriangle, Check, Undo2, X } from 'lucide-react'
import { useProject } from '../../stores/projectStore'
import { toast } from '../../stores/uiStore'
import { orderedScenes } from '../../features/script-sync/derive'
import { CHOICES, changeSummary, conflictMessage, detectSettingConflict, settingImpact, settingLabel } from '../../features/continuity/setting'
import type { SettingChoice } from '../../types'
import { ListenButton } from '../common/ListenButton'

const CHOSEN: Record<SettingChoice, string> = { adapt: 'Adaptaste la historia', keep: 'Mantuviste el lugar de la historia', transform: 'Definiste una transformación' }

export function SettingConflictCard() {
  const project = useProject((s) => s.project)
  const scenesMap = useProject((s) => s.scenes)
  const scenes = useMemo(() => (project ? orderedScenes(project, scenesMap) : []), [project, scenesMap])
  const conflict = useMemo(() => detectSettingConflict(project, scenes), [project, scenes])
  const [choice, setChoice] = useState<SettingChoice | null>(null)
  const [hidden, setHidden] = useState(false)
  const impact = useMemo(() => (project && conflict && choice ? settingImpact(project, scenes, choice) : null), [project, scenes, conflict, choice])
  const done = project?.settingChange

  if (done) {
    if (hidden) return null
    const summary = `${CHOSEN[done.choice]}: ${settingLabel(done.choice === 'keep' ? done.story : done.bible)}. ${changeSummary(done)}`
    return (
      <section className="flex flex-col gap-2 rounded-[14px] border border-ok/40 bg-ok/5 p-3" aria-label="Decisión del lugar">
        <p className="text-[15px]" role="status">
          <Check size={15} className="mr-1 inline text-ok" />
          {summary}
        </p>
        {done.pending.length > 0 && (
          <ul className="flex list-disc flex-col gap-0.5 pl-5 text-[13.5px] text-ink-2" aria-label="Falta revisar">
            {done.pending.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <ListenButton id="setting-done" text={[summary, ...done.pending].join(' ')} label="Escuchar resultado" />
          <button
            className="btn !h-10"
            onClick={() => {
              const kept = useProject.getState().undoSettingChange()
              setChoice(null)
              toast(kept?.length ? `Deshecho. No regresé ${kept.length} texto(s) que cambiaste a mano.` : 'Deshecho: todo quedó como antes.')
            }}
          >
            <Undo2 size={15} /> Deshacer
          </button>
          <button className="btn btn-ghost !h-10" onClick={() => setHidden(true)}>
            Ocultar
          </button>
        </div>
      </section>
    )
  }
  if (!conflict) return null

  const message = conflictMessage(conflict)
  return (
    <section className="flex flex-col gap-2.5 rounded-[14px] border border-warn/50 bg-warn/10 p-3" aria-label="El guion y la Biblia no dicen el mismo lugar">
      <p className="flex items-start gap-2 text-[16px] font-semibold text-[#fde68a]">
        <AlertTriangle size={18} className="mt-0.5 shrink-0" />
        {message}
      </p>
      <p className="text-[13.5px] text-ink-2">
        Escenas {conflict.sceneHits.map((h) => String(h.n).padStart(2, '0')).join(', ')} · fichas {conflict.itemHits.map((h) => `«${h.name}»`).join(', ') || '—'}. No escojo por ti.
      </p>
      <ListenButton id="setting-question" text={`${message} ${CHOICES.map((c) => c.label(conflict)).join('. ')}.`} label="Escuchar pregunta" />
      <div className="flex flex-wrap gap-2" role="group" aria-label="¿Qué quieres conservar?">
        {CHOICES.map((c) => (
          <button key={c.choice} className={`btn !h-10 !text-[14px] ${choice === c.choice ? 'btn-hero' : ''}`} aria-pressed={choice === c.choice} onClick={() => setChoice(c.choice)}>
            {c.label(conflict)}
          </button>
        ))}
      </div>
      {impact && (
        <div className="flex flex-col gap-2 rounded-[10px] border border-line bg-bg/60 p-2.5" aria-label="Vista previa de impacto">
          <div className="text-[14px] font-semibold">Vista previa de impacto</div>
          <p className="text-[13.5px] text-ink-2">{CHOICES.find((c) => c.choice === impact.choice)!.help}</p>
          {impact.edits.length > 0 ? (
            <ul className="flex flex-col gap-1.5" aria-label="Textos que cambian">
              {impact.edits.map((e) => (
                <li key={`${e.where}`} className="text-[13.5px]">
                  <b>{e.where}</b>
                  <div className="text-ink-3 line-through">{e.before}</div>
                  <div className="text-ok">{e.after}</div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13.5px]">No cambia ningún texto.</p>
          )}
          {impact.pending.length > 0 && (
            <>
              <div className="text-[13.5px] font-semibold">Queda para ti (no lo cambio):</div>
              <ul className="flex list-disc flex-col gap-0.5 pl-5 text-[13.5px] text-ink-2" aria-label="Queda para revisar">
                {impact.pending.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </>
          )}
          <p className="text-[13px] text-ink-3">Se guarda la decisión: «{impact.decision}» Imágenes y Canon: sin tocar.</p>
          <ListenButton
            id={`setting-preview-${impact.choice}`}
            text={[CHOICES.find((c) => c.choice === impact.choice)!.help, `Cambian ${impact.edits.length} textos.`, ...impact.edits.map((e) => `${e.where}: ${e.after}`), ...impact.pending].join(' ')}
            label="Escuchar vista previa"
          />
          <div className="flex flex-wrap gap-2">
            <button
              className="btn btn-hero !h-10"
              onClick={() => {
                const c = useProject.getState().applySettingChoice(impact.choice)
                if (c) toast(changeSummary(c))
              }}
            >
              <Check size={15} /> Aplicar estos cambios
            </button>
            <button className="btn btn-ghost !h-10" onClick={() => setChoice(null)}>
              <X size={15} /> Cancelar
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
