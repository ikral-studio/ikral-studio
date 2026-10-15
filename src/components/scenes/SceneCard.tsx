import { memo, useEffect, useRef, useState } from 'react'
import { CheckCheck, ChevronDown, ChevronUp, ClipboardPaste, Clock3, Copy, Film, ImageIcon, Play, Timer, Trash2 } from 'lucide-react'
import { useProject } from '../../stores/projectStore'
import { openPasteScene, useUI } from '../../stores/uiStore'
import { useMediaUrl } from '../../features/media-library/media'
import { activeVideo } from '../../features/script-sync/derive'
import { confirmDeleteScene, duplicateAndFocus, selectScene } from '../../features/scene-management/actions'
import { usePlayback } from '../../features/playback/engine'
import { formatTime, pad2 } from '../../utils'
import { StatusChip, accentFor } from '../common/StatusChip'
import { suggestDuration } from '../../features/timing/suggest'
import { MediaSlot } from './MediaSlot'
import { FramesStrip } from './FramesStrip'
import { ScriptEditor } from './ScriptEditor'
import { VideoPanel } from './VideoPanel'

/** Alto fijo de las cajas en la tarjeta cerrada: todas las escenas miden lo mismo. */
const COMPACT_H = 112

function Thumb({ mediaId, label, aspect }: { mediaId?: string; label: string; aspect: string }) {
  const url = useMediaUrl(mediaId, true)
  return (
    <div className="min-w-0">
      <div className="label mb-1 truncate">{label}</div>
      <div className="media-frame flex w-full items-center justify-center" style={{ height: COMPACT_H }} data-aspect={aspect}>
        {url ? <img src={url} alt="" className="object-cover" /> : <ImageIcon size={18} className="text-ink-3" />}
      </div>
    </div>
  )
}

function DurationInput({ sceneId }: { sceneId: string }) {
  const planned = useProject((s) => s.scenes[sceneId]?.plannedDuration ?? 0)
  const [draft, setDraft] = useState(String(planned))
  useEffect(() => setDraft(String(planned)), [planned])
  const commit = () => {
    const v = Math.round(Number(draft.replace(',', '.')) * 10) / 10
    if (Number.isFinite(v) && v >= 0.5 && v <= 600) useProject.getState().updateScene(sceneId, { plannedDuration: v })
    else setDraft(String(planned))
  }
  return (
    <label className="flex items-center gap-1 rounded-lg px-1.5 text-ink-2 hover:bg-white/5" title="Duración planificada del storyboard (segundos)">
      <Clock3 size={14} />
      <input
        className="w-9 bg-transparent text-right text-[12.5px] tabular-nums text-ink outline-none"
        value={draft}
        inputMode="decimal"
        aria-label="Duración planificada en segundos"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
      <span className="text-[12px]">s</span>
    </label>
  )
}

/** «⏱ 9 s»: duración sugerida según el guion; clic para usarla. */
export function SuggestChip({ sceneId, full = false }: { sceneId: string; full?: boolean }) {
  const scene = useProject((s) => s.scenes[sceneId])
  const sug = scene ? suggestDuration(scene) : null
  if (!scene || !sug) return null
  const same = Math.abs(sug.seconds - scene.plannedDuration) < 1
  if (same && !full) return null
  const use = () => useProject.getState().updateScene(sceneId, { plannedDuration: sug.seconds })
  if (full)
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-[#0f1828] px-2.5 py-2 text-[12px]">
        <Timer size={14} className="text-[#fcd34d]" />
        <span>
          Duración sugerida: <b className="tabular-nums">{sug.seconds} s</b>
        </span>
        <span className="text-ink-3">({sug.reasons.join(' · ')})</span>
        {same ? (
          <span className="chip ml-auto bg-ok/15 text-[#86efac]">Ya la estás usando</span>
        ) : (
          <button className="btn btn-sm ml-auto" onClick={use}>
            Usar {sug.seconds} s
          </button>
        )}
      </div>
    )
  return (
    <button
      className="chip shrink-0 bg-warn/15 tabular-nums text-[#fcd34d] hover:bg-warn/25"
      onClick={use}
      title={`Duración sugerida según el guion: ${sug.reasons.join(' · ')}. Clic para usarla.`}
      aria-label={`Usar duración sugerida de ${sug.seconds} segundos`}
    >
      <Timer size={11} /> {sug.seconds} s
    </button>
  )
}

export const SceneCard = memo(function SceneCard({ id, n }: { id: string; n: number }) {
  const scene = useProject((s) => s.scenes[id])
  const selected = useProject((s) => s.selectedSceneId === id)
  const aspect = useProject((s) => s.project?.aspectRatio ?? '16:9')
  const isPlayingHere = usePlayback((s) => s.playing && s.index === n - 1)
  const scrollReq = useUI((s) => s.scrollRequest)
  const ref = useRef<HTMLElement>(null)
  const video = scene ? activeVideo(scene) : undefined
  const videoThumb = useMediaUrl(video?.mediaId, true)

  useEffect(() => {
    if (scrollReq?.id === id) ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [scrollReq, id])

  if (!scene) return null
  const { updateScene } = useProject.getState()
  const fileBase = `escena-${pad2(n)}-${scene.title}`
  const toggle = () => updateScene(id, { collapsed: !scene.collapsed })

  return (
    <article
      ref={ref}
      data-scene-id={id}
      className={`scroll-mt-3 rounded-[14px] border bg-panel transition-colors ${selected ? 'border-sel shadow-[0_0_0_1px_var(--color-sel)]' : 'border-line hover:border-line-2'}`}
      onMouseDown={() => !selected && selectScene(id, { scroll: false })}
      onFocusCapture={() => !selected && selectScene(id, { scroll: false })}
      aria-label={`Escena ${n}: ${scene.title}`}
    >
      <header className="flex items-center gap-2 px-3 py-2.5">
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12.5px] font-bold text-white"
          style={{ background: accentFor(n - 1) }}
        >
          {n}
        </span>
        <span className="shrink-0 text-[13.5px] font-semibold text-ink-2">Escena {pad2(n)} ·</span>
        <input
          className="min-w-0 flex-1 rounded-md bg-transparent px-1 py-0.5 text-[14px] font-semibold outline-none hover:bg-white/5 focus:bg-[#0f1828] focus:ring-1 focus:ring-sel-2"
          value={scene.title}
          aria-label="Nombre de la escena"
          onChange={(e) => updateScene(id, { title: e.target.value }, `title:${id}`)}
        />
        {isPlayingHere && (
          <span className="chip bg-sel/20 text-[#bfdbfe]">
            <Play size={10} fill="currentColor" /> En vista previa
          </span>
        )}
        <DurationInput sceneId={id} />
        <SuggestChip sceneId={id} />
        {video && Math.abs(video.duration - scene.plannedDuration) >= 0.5 && (
          <span className="chip bg-white/5 text-ink-2" title="Duración real del video activo">
            <Film size={11} /> {formatTime(video.duration)}
          </span>
        )}
        <StatusChip status={scene.status} />
        <div className="flex shrink-0 items-center">
          <button
            className={`icon-btn ${scene.reviewed ? '!text-ok' : ''}`}
            onClick={() => updateScene(id, { reviewed: !scene.reviewed })}
            title={scene.reviewed ? 'Quitar «revisada»' : 'Marcar como revisada'}
            aria-pressed={scene.reviewed}
            aria-label="Marcar como revisada"
          >
            <CheckCheck size={16} />
          </button>
          <button className="icon-btn hover:!text-[#c4b5fd]" onClick={() => openPasteScene(id)} title="Pegar escena de IA (JSON de ChatGPT o Claude)" aria-label="Pegar escena de IA">
            <ClipboardPaste size={15} />
          </button>
          <button className="icon-btn" onClick={() => duplicateAndFocus(id)} title="Duplicar" aria-label="Duplicar escena">
            <Copy size={15} />
          </button>
          <button className="icon-btn hover:!text-bad" onClick={() => confirmDeleteScene(id)} title="Eliminar" aria-label="Eliminar escena">
            <Trash2 size={15} />
          </button>
          <button className="icon-btn" onClick={toggle} title={scene.collapsed ? 'Expandir' : 'Contraer'} aria-expanded={!scene.collapsed} aria-label={scene.collapsed ? 'Expandir escena' : 'Contraer escena'}>
            {scene.collapsed ? <ChevronDown size={17} /> : <ChevronUp size={17} />}
          </button>
        </div>
      </header>

      {scene.collapsed ? (
        <div className="grid grid-cols-[1fr_1fr_1.35fr_1fr] items-start gap-2.5 px-3 pb-3">
          <Thumb mediaId={scene.startImageId} label="Imagen inicial" aspect={aspect} />
          <Thumb mediaId={scene.endImageId} label="Imagen final" aspect={aspect} />
          <div className="min-w-0">
            <div className="label mb-1">Guion y dirección</div>
            <button
              className="field block w-full resize-none overflow-hidden text-left text-[11.5px] leading-snug text-ink-2"
              style={{ height: COMPACT_H, resize: 'none' }}
              onClick={toggle}
              title="Clic para editar"
            >
              {scene.script.action || scene.script.generationPrompt || <span className="text-ink-3">Sin guion todavía. Clic para escribir.</span>}
            </button>
          </div>
          <div className="min-w-0">
            <div className="label mb-1">Video generado</div>
            <div className="media-frame flex w-full items-center justify-center" style={{ height: COMPACT_H }}>
              {videoThumb ? (
                <>
                  <img src={videoThumb} alt="" className="object-cover" />
                  <span className="absolute inset-0 m-auto flex h-8 w-8 items-center justify-center rounded-full bg-black/60">
                    <Play size={14} fill="white" className="text-white" />
                  </span>
                  <span className="chip absolute bottom-1 right-1 bg-black/70 tabular-nums text-white">{formatTime(video?.duration ?? 0)}</span>
                </>
              ) : (
                <Film size={18} className="text-ink-3" />
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4 border-t border-line px-3 pb-4 pt-3">
          <div className="grid grid-cols-2 gap-3">
            <MediaSlot sceneId={id} slot="start" label="Imagen inicial" fileBase={fileBase} />
            <MediaSlot sceneId={id} slot="end" label="Imagen final" fileBase={fileBase} />
          </div>
          <FramesStrip sceneId={id} />
          <ScriptEditor sceneId={id} n={n} />
          <VideoPanel sceneId={id} fileBase={fileBase} />
        </div>
      )}
    </article>
  )
})
