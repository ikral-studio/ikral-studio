import { useState } from 'react'
import { ArrowRight, ArrowRightCircle, ChevronDown, ChevronRight, Plus } from 'lucide-react'
import { useProject } from '../../stores/projectStore'
import { toast, useUI } from '../../stores/uiStore'
import { useMediaUrl } from '../../features/media-library/media'
import { framePrompt, framesProgress, framesToApply, type FrameSlot } from '../../features/bible/frames'
import { effectiveDuration, orderedScenes } from '../../features/script-sync/derive'
import { requestFramePreview } from '../../features/chat/requests'
import { pad2 } from '../../utils'
import { FramePlanBox } from './FramePlanBox'
import { CoveragePanel } from '../scenes/CoveragePanel'

/** Una de las dos imágenes de la escena: la aprobada grande, su prompt y sus pruebas. */
function FrameBox({ sceneId, slot, n }: { sceneId: string; slot: FrameSlot; n: number }) {
  const project = useProject((s) => s.project)
  const scene = useProject((s) => s.scenes[sceneId])
  if (!scene) return null
  const { updateFramePlan } = useProject.getState()
  const which = slot === 'start' ? 'Imagen inicial' : 'Imagen final'
  return (
    <FramePlanBox
      which={which}
      label={`${which} de escena ${pad2(n)}`}
      plan={scene.prep?.[slot]}
      current={() => useProject.getState().scenes[sceneId]?.prep?.[slot]}
      autoPrompt={framePrompt(project, scene, slot, n)}
      onPatch={(patch) => updateFramePlan(sceneId, slot, patch)}
      onRequest={(prompt) => void requestFramePreview(sceneId, slot, prompt)}
    />
  )
}

function SceneThumb({ id }: { id?: string }) {
  const url = useMediaUrl(id, true)
  return (
    <span className="h-[46px] w-[72px] shrink-0 overflow-hidden rounded-[7px] border border-line bg-bg">
      {url && <img src={url} alt="" className="h-full w-full object-cover" />}
    </span>
  )
}

/** 7 · Escenas del proyecto: cada escena con su imagen inicial y final; al aprobarlas, pasan a Edición. */
export function FramesPanel() {
  const project = useProject((s) => s.project)
  const scenesMap = useProject((s) => s.scenes)
  const [openId, setOpenId] = useState<string>()
  const [confirm, setConfirm] = useState(false)
  if (!project) return null
  const scenes = orderedScenes(project, scenesMap)
  const phases = project.phases ?? []
  const { approved, total } = framesProgress(scenes)
  const pending = framesToApply(scenes)
  const replaces = pending.filter((x) => x.replaces).length

  const apply = () => {
    if (replaces && !confirm) return setConfirm(true)
    const { setImage, setShotImage } = useProject.getState()
    pending.forEach((x) => (x.shotId ? setShotImage(x.sceneId, x.shotId, x.slot, x.mediaId) : setImage(x.sceneId, x.slot, x.mediaId)))
    setConfirm(false)
    toast(`${pending.length} imagen${pending.length === 1 ? '' : 'es'} pasada${pending.length === 1 ? '' : 's'} a Edición ✓`)
  }

  return (
    <section className="bible-card flex min-w-0 flex-col gap-3 p-4" aria-label="Escenas del proyecto">
      <div className="flex items-center gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#6d5dfc] to-[#8b5cf6] text-[14px] font-bold text-white shadow-[0_0_14px_#7c3aed55]">7</span>
        <h2 className="text-[17px] font-semibold">Escenas del proyecto</h2>
        <span className="ml-auto text-[13.5px] text-ink-3">
          {scenes.length} escena{scenes.length === 1 ? '' : 's'}
        </span>
      </div>
      <button className="btn btn-hero !h-11 !justify-center !text-[15px]" onClick={() => useUI.setState({ view: 'studio' })}>
        Ir a escenas <ArrowRight size={17} />
      </button>
      <p className="text-[13.5px] text-ink-2">
        Imagen inicial y final de cada escena · <span className={approved && approved === total ? 'text-ok' : ''}>{approved} de {total} aprobadas</span>
      </p>
      {scenes.length === 0 ? (
        <p className="text-[14px] text-ink-3">Primero carga tu guion.</p>
      ) : (
        <ul className="-mr-2 flex max-h-[calc(100vh-330px)] min-h-[240px] flex-col gap-1.5 overflow-y-auto overscroll-contain pr-2" aria-label="Lista de escenas">
          {scenes.map((s, i) => {
            const open = openId === s.id
            const done = (s.prep?.start?.approvedId ? 1 : 0) + (s.prep?.end?.approvedId ? 1 : 0)
            return (
              <li key={s.id} className={`shrink-0 overflow-hidden rounded-[11px] border bg-card ${open ? 'border-[#7c3aed]/70' : 'border-line'}`}>
                <button className="flex w-full items-center gap-2.5 p-1.5 pr-3 text-left" aria-expanded={open} aria-label={`Escena ${pad2(i + 1)} · ${s.title}`} onClick={() => setOpenId(open ? undefined : s.id)}>
                  <span className="flex h-[46px] w-9 shrink-0 items-center justify-center rounded-[7px] bg-bg/70 text-[14px] font-semibold tabular-nums text-ink-2">{pad2(i + 1)}</span>
                  <SceneThumb id={s.prep?.start?.approvedId ?? s.startImageId} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-semibold">{s.title || 'Sin título'}</div>
                    <div className="text-[12.5px] text-ink-3">
                      {Math.round(effectiveDuration(s))} s · {done} de 2
                      {phases.length > 0 && <> · {phases.find((p) => p.id === s.phaseId)?.name ?? <span className="text-warn">sin etapa</span>}</>}
                    </div>
                  </div>
                  <span
                    className={`h-3 w-3 shrink-0 rounded-full ${done === 2 ? 'bg-ok shadow-[0_0_8px_#22c55e88]' : done === 1 ? 'bg-warn shadow-[0_0_8px_#f59e0b88]' : 'border-2 border-ink-3'}`}
                    title={done === 2 ? 'Inicio y final aprobados' : done === 1 ? 'Falta una imagen' : 'Sin preparar'}
                  />
                  {open ? <ChevronDown size={15} className="text-ink-3" /> : <ChevronRight size={15} className="text-ink-3" />}
                </button>
                {open && (
                  <div className="flex flex-col gap-4 border-t border-line px-3 pb-3 pt-3">
                    {phases.length > 0 && (
                      <label className="flex items-center gap-2 text-[14px]">
                        <span className="font-semibold">Etapa</span>
                        <select
                          className="field !h-9 min-w-0 flex-1 !text-[14px]"
                          aria-label={`Etapa de escena ${pad2(i + 1)}`}
                          value={phases.some((p) => p.id === s.phaseId) ? s.phaseId : ''}
                          onChange={(e) => useProject.getState().setScenePhase(s.id, e.target.value || undefined)}
                        >
                          <option value="">— Sin etapa —</option>
                          {phases.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    <FrameBox sceneId={s.id} slot="start" n={i + 1} />
                    <FrameBox sceneId={s.id} slot="end" n={i + 1} />
                    <CoveragePanel sceneId={s.id} />
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
      <div className="mt-auto flex flex-col gap-2 pt-1">
        {scenes.length > 0 && (
          <button className="btn !h-11 !justify-center !text-[15px]" disabled={!pending.length} onClick={apply}>
            <ArrowRightCircle size={17} />
            {confirm ? `Sí, reemplazar ${replaces} que ya había` : pending.length ? `Pasar ${pending.length} a Edición` : 'Pasar a Edición'}
          </button>
        )}
        {confirm && (
          <button className="btn btn-ghost !h-9 !justify-center" onClick={() => setConfirm(false)}>
            No, dejar como está
          </button>
        )}
        {!pending.length && approved > 0 && <p className="text-center text-[13px] text-ok">✓ Las aprobadas ya están en Edición</p>}
        <button
          className="btn !h-10 !justify-center !text-[14px]"
          onClick={() => {
            const id = useProject.getState().addScene()
            if (id) setOpenId(id)
          }}
        >
          <Plus size={16} /> Agregar escena
        </button>
      </div>
    </section>
  )
}
