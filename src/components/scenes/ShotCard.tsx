import { useState } from 'react'
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Copy, Film, Trash2 } from 'lucide-react'
import { useProject } from '../../stores/projectStore'
import { toast } from '../../stores/uiStore'
import { useMediaUrl } from '../../features/media-library/media'
import { shotFramePrompt } from '../../features/bible/frames'
import { requestShotPreview } from '../../features/chat/requests'
import { pad2 } from '../../utils'
import { FramePlanBox } from '../bible/FramePlanBox'
import { GptCoverageToggle } from '../gpt/GptCoveragePanel'
import type { Shot } from '../../types'

type TextKey = 'cameraDirection' | 'action' | 'sound' | 'continuity' | 'generationPrompt'
const TEXTS: { key: TextKey; label: string; hint: string; rows: number }[] = [
  { key: 'cameraDirection', label: 'Cámara', hint: 'Encuadre y movimiento (ej.: plano general, cámara fija)', rows: 2 },
  { key: 'action', label: 'Acción del plano', hint: 'Qué pasa en este plano', rows: 2 },
  { key: 'sound', label: 'Sonido', hint: 'Ej.: chisporroteo de la parrilla', rows: 1 },
  { key: 'continuity', label: 'Continuidad', hint: 'Ej.: la carne ya está volteada', rows: 1 },
  { key: 'generationPrompt', label: 'Prompt de video', hint: 'El prompt propio de este plano', rows: 3 },
]

function Thumb({ id }: { id?: string }) {
  const url = useMediaUrl(id, true)
  if (!url) return null
  return (
    <span className="flex h-[34px] w-[52px] shrink-0 items-center justify-center overflow-hidden rounded-[7px] border border-line bg-bg text-ink-3">
      <img src={url} alt="" className="h-full w-full object-cover" />
    </span>
  )
}

/** Imagen inicial o final de un plano: pruebas ligadas al id del plano (no a su número). */
function ShotFrame({ sceneId, shot, slot, n, count }: { sceneId: string; shot: Shot; slot: 'start' | 'end'; n: number; count: number }) {
  const project = useProject((s) => s.project)
  const scene = useProject((s) => s.scenes[sceneId])
  if (!scene) return null
  const sceneN = (project?.sceneIds.indexOf(sceneId) ?? -1) + 1
  const which = slot === 'start' ? 'Imagen inicial' : 'Imagen final'
  const { updateShotFramePlan } = useProject.getState()
  return (
    <FramePlanBox
      which={which}
      label={`${which} del plano ${n} de escena ${pad2(sceneN)}`}
      plan={shot.prep?.[slot]}
      current={() => useProject.getState().scenes[sceneId]?.shots?.find((x) => x.id === shot.id)?.prep?.[slot]}
      autoPrompt={shotFramePrompt(project, scene, shot, slot, sceneN, n, count)}
      onPatch={(patch) => updateShotFramePlan(sceneId, shot.id, slot, patch)}
      onRequest={(prompt) => void requestShotPreview(sceneId, shot.id, slot, prompt)}
    />
  )
}

/** Un plano de la cobertura: nombre, duración, cámara, acción, sonido, continuidad, prompt e imágenes. */
export function ShotCard({ sceneId, shot, n, count }: { sceneId: string; shot: Shot; n: number; count: number }) {
  const [open, setOpen] = useState(false)
  const { updateShot, moveShot, duplicateShot, removeShot } = useProject.getState()
  const label = `Plano ${n}`
  const refs = shot.references?.length ?? 0
  const videos = shot.videoVersions?.length ?? 0

  return (
    <li className={`shrink-0 overflow-hidden rounded-[10px] border bg-bg/40 ${open ? 'border-[#7c3aed]/60' : 'border-line'}`} aria-label={`${label} · ${shot.name}`}>
      <div className="flex items-center gap-1 p-1.5">
        <button className="flex min-w-0 flex-1 items-center gap-2 text-left" aria-expanded={open} aria-label={`Abrir ${label.toLowerCase()}`} onClick={() => setOpen(!open)}>
          <span className="flex h-[34px] w-6 shrink-0 items-center justify-center rounded-[7px] bg-bg/70 text-[13px] font-semibold tabular-nums text-ink-2">{n}</span>
          <Thumb id={shot.startImageId ?? shot.prep?.start?.approvedId ?? shot.references?.[0]?.mediaId} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13.5px] font-semibold">{shot.name || 'Plano sin nombre'}</span>
            <span className="block text-[12px] text-ink-3">
              {shot.duration} s{refs > 0 && ` · ${refs} referencia${refs === 1 ? '' : 's'}`}
              {videos > 0 && (
                <>
                  {' · '}
                  <Film size={11} className="inline" /> {videos}
                </>
              )}
            </span>
          </span>
          {open ? <ChevronDown size={14} className="text-ink-3" /> : <ChevronRight size={14} className="text-ink-3" />}
        </button>
        <button className="icon-btn sm" disabled={n === 1} onClick={() => moveShot(sceneId, shot.id, -1)} aria-label={`Subir ${label.toLowerCase()}`} title="Subir">
          <ArrowUp size={14} />
        </button>
        <button className="icon-btn sm" disabled={n === count} onClick={() => moveShot(sceneId, shot.id, 1)} aria-label={`Bajar ${label.toLowerCase()}`} title="Bajar">
          <ArrowDown size={14} />
        </button>
      </div>
      {open && (
        <div className="flex flex-col gap-2.5 border-t border-line px-2.5 pb-2.5 pt-2.5">
          <div className="flex gap-2">
            <label className="flex min-w-0 flex-1 flex-col gap-1 text-[13px] text-ink-3">
              Nombre
              <input className="field !h-9 !text-[14px]" aria-label={`Nombre del ${label.toLowerCase()}`} value={shot.name} onChange={(e) => updateShot(sceneId, shot.id, { name: e.target.value }, true)} />
            </label>
            <label className="flex w-[92px] flex-col gap-1 text-[13px] text-ink-3">
              Segundos
              <input
                className="field !h-9 !text-[14px] tabular-nums"
                type="number"
                min={0.5}
                step={0.5}
                aria-label={`Duración del ${label.toLowerCase()}`}
                value={shot.duration}
                onChange={(e) => {
                  const v = Number(e.target.value)
                  if (Number.isFinite(v) && v > 0) updateShot(sceneId, shot.id, { duration: v }, true)
                }}
              />
            </label>
          </div>
          {TEXTS.map((t) => (
            <label key={t.key} className="flex flex-col gap-1 text-[13px] text-ink-3">
              {t.label}
              <textarea
                className="field !text-[13.5px] leading-snug"
                rows={t.rows}
                placeholder={t.hint}
                aria-label={`${t.label} del ${label.toLowerCase()}`}
                value={shot[t.key] ?? ''}
                onChange={(e) => updateShot(sceneId, shot.id, { [t.key]: e.target.value || undefined }, true)}
              />
            </label>
          ))}
          <ShotFrame sceneId={sceneId} shot={shot} slot="start" n={n} count={count} />
          <ShotFrame sceneId={sceneId} shot={shot} slot="end" n={n} count={count} />
          <div className="flex flex-wrap gap-2 pt-1">
            <GptCoverageToggle sceneId={sceneId} shotId={shot.id} />
            <button
              className="btn btn-sm"
              aria-label={`Duplicar ${label.toLowerCase()}`}
              onClick={() => {
                duplicateShot(sceneId, shot.id)
                toast(`${label} duplicado`)
              }}
            >
              <Copy size={13} /> Duplicar
            </button>
            <button
              className="btn btn-sm btn-ghost !text-bad"
              aria-label={`Quitar ${label.toLowerCase()}`}
              title="Va a la Papelera: se puede recuperar"
              onClick={() => {
                removeShot(sceneId, shot.id)
                toast(`${label} en la Papelera (se puede recuperar)`)
              }}
            >
              <Trash2 size={13} /> Quitar
            </button>
          </div>
        </div>
      )}
    </li>
  )
}
