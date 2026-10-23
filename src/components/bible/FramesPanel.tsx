import { useState } from 'react'
import { ArrowRight, ArrowRightCircle, ChevronDown, ChevronRight, ClipboardCopy, ImagePlus, Loader2, Plus, RotateCcw, Sparkles } from 'lucide-react'
import { isDesktop } from '../../database/db'
import { useProject } from '../../stores/projectStore'
import { toast, useUI } from '../../stores/uiStore'
import { useMediaUrl } from '../../features/media-library/media'
import { importFiles } from '../../features/scene-management/actions'
import { pickFiles, useFileDrop } from '../../hooks/useFileDrop'
import { framePrompt, framesProgress, framesToApply, type FrameSlot } from '../../features/bible/frames'
import { effectiveDuration, orderedScenes } from '../../features/script-sync/derive'
import { requestFramePreview } from '../../features/chat/requests'
import { IMAGE_ACCEPT } from '../scenes/MediaSlot'
import { pad2, uid } from '../../utils'
import { TryThumb } from './CharacterSheet'

/** Una de las dos imágenes de la escena: la aprobada grande, su prompt y sus pruebas. */
function FrameBox({ sceneId, slot, n }: { sceneId: string; slot: FrameSlot; n: number }) {
  const project = useProject((s) => s.project)
  const scene = useProject((s) => s.scenes[sceneId])
  const plan = scene?.prep?.[slot]
  const url = useMediaUrl(plan?.approvedId)
  const [busy, setBusy] = useState(false)
  const { updateFramePlan } = useProject.getState()
  const which = slot === 'start' ? 'Imagen inicial' : 'Imagen final'
  const label = `${which} de escena ${pad2(n)}`
  const wide = project?.aspectRatio !== '9:16'

  const addTry = (mediaId: string) => {
    const cur = useProject.getState().scenes[sceneId]?.prep?.[slot]
    const tries = cur?.tries?.some((t) => t.mediaId === mediaId) ? cur.tries : [...(cur?.tries ?? []), { id: uid('try_'), mediaId, at: new Date().toISOString() }]
    updateFramePlan(sceneId, slot, { tries, approvedId: mediaId })
  }
  const accept = async (files: File[]) => {
    if (!files[0]) return
    setBusy(true)
    const [asset] = await importFiles([files[0]], 'image')
    setBusy(false)
    if (asset) {
      addTry(asset.id)
      toast(`${label} guardada`)
    }
  }
  const drop = useFileDrop(accept, addTry)
  if (!scene) return null
  const prompt = plan?.prompt ?? framePrompt(project, scene, slot, n)
  const tries = plan?.tries ?? []

  return (
    <div className="flex flex-col gap-2" aria-label={label}>
      <div className="flex items-center justify-between text-[14px] font-semibold">
        {which}
        <span className={`text-[12.5px] font-normal ${plan?.approvedId ? 'text-ok' : 'text-ink-3'}`}>{plan?.approvedId ? '✓ Aprobada' : 'Sin aprobar'}</span>
      </div>
      <div
        {...drop.props}
        className={`relative flex items-center justify-center overflow-hidden rounded-[10px] border border-dashed ${wide ? 'aspect-video' : 'mx-auto aspect-[9/16] w-1/2'} ${drop.over ? 'border-sel bg-sel/10' : 'border-line bg-bg'}`}
      >
        {busy ? (
          <Loader2 size={22} className="animate-spin text-ink-3" />
        ) : url ? (
          <img src={url} alt={`${label} aprobada`} className="h-full w-full object-cover" />
        ) : (
          <button className="flex flex-col items-center gap-1.5 p-2 text-center text-[13px] text-ink-3" onClick={() => void pickFiles(IMAGE_ACCEPT).then(accept)} aria-label={`Escoger ${label.toLowerCase()}`}>
            <ImagePlus size={22} />
            Suelta o escoge una imagen
          </button>
        )}
        {plan?.generating && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60 p-2 text-center text-[13px] text-white">
            <Loader2 size={22} className="animate-spin" />
            Claude está generando…
          </div>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <span className="flex items-center justify-between gap-2 text-[13px] text-ink-3">
          Prompt (puedes cambiarlo):
          {plan?.prompt !== undefined && (
            <button className="btn btn-sm btn-ghost" onClick={() => updateFramePlan(sceneId, slot, { prompt: undefined })} title="Volver al prompt que se arma solo con la escena y la Biblia">
              <RotateCcw size={12} /> Automático
            </button>
          )}
        </span>
        <textarea className="field !text-[13px] leading-snug" rows={4} aria-label={`Prompt de ${label.toLowerCase()}`} value={prompt} onChange={(e) => updateFramePlan(sceneId, slot, { prompt: e.target.value })} />
      </div>
      <div className="flex flex-wrap gap-2">
        {isDesktop() && (
          <button
            className="btn !h-9 !border-[#7c3aed]/60 !text-[#ddd6fe]"
            onClick={() => void requestFramePreview(sceneId, slot, prompt)}
            disabled={plan?.generating}
            title="Claude la hace con ChatGPT (gratis) y aparece aquí"
          >
            <Sparkles size={15} /> {tries.length ? 'Generar otra' : 'Generar'}
          </button>
        )}
        <button className="btn !h-9" onClick={() => void navigator.clipboard.writeText(prompt).then(() => toast('Prompt copiado'))}>
          <ClipboardCopy size={15} /> Copiar prompt
        </button>
        {plan?.generating && (
          <button className="btn !h-9 btn-ghost" onClick={() => updateFramePlan(sceneId, slot, { generating: false })} title="Quitar el aviso si ya no va a llegar">
            Cancelar espera
          </button>
        )}
      </div>
      {tries.length > 0 && (
        <ul className="flex gap-2 overflow-x-auto pb-1" aria-label={`Pruebas de ${label.toLowerCase()}`}>
          {tries.map((t, i) => (
            <TryThumb
              key={t.id}
              t={t}
              n={i + 1}
              wide={wide}
              approved={t.mediaId === plan?.approvedId}
              onApprove={() => {
                updateFramePlan(sceneId, slot, { approvedId: t.mediaId })
                toast(`Prueba ${i + 1} aprobada`)
              }}
              onRemove={() => updateFramePlan(sceneId, slot, { tries: tries.filter((x) => x.id !== t.id) })}
            />
          ))}
        </ul>
      )}
    </div>
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
  const { approved, total } = framesProgress(scenes)
  const pending = framesToApply(scenes)
  const replaces = pending.filter((x) => x.replaces).length

  const apply = () => {
    if (replaces && !confirm) return setConfirm(true)
    const { setImage } = useProject.getState()
    pending.forEach((x) => setImage(x.sceneId, x.slot, x.mediaId))
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
        <ul className="flex flex-col gap-1.5">
          {scenes.map((s, i) => {
            const open = openId === s.id
            const done = (s.prep?.start?.approvedId ? 1 : 0) + (s.prep?.end?.approvedId ? 1 : 0)
            return (
              <li key={s.id} className={`overflow-hidden rounded-[11px] border bg-card ${open ? 'border-[#7c3aed]/70' : 'border-line'}`}>
                <button className="flex w-full items-center gap-2.5 p-1.5 pr-3 text-left" aria-expanded={open} aria-label={`Escena ${pad2(i + 1)} · ${s.title}`} onClick={() => setOpenId(open ? undefined : s.id)}>
                  <span className="flex h-[46px] w-9 shrink-0 items-center justify-center rounded-[7px] bg-bg/70 text-[14px] font-semibold tabular-nums text-ink-2">{pad2(i + 1)}</span>
                  <SceneThumb id={s.prep?.start?.approvedId ?? s.startImageId} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-semibold">{s.title || 'Sin título'}</div>
                    <div className="text-[12.5px] text-ink-3">
                      {Math.round(effectiveDuration(s))} s · {done} de 2
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
                    <FrameBox sceneId={s.id} slot="start" n={i + 1} />
                    <FrameBox sceneId={s.id} slot="end" n={i + 1} />
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
