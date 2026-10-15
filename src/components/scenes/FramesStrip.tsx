import { ChevronLeft, ChevronRight, Plus, X } from 'lucide-react'
import { useProject } from '../../stores/projectStore'
import { toast, useUI } from '../../stores/uiStore'
import { useMediaUrl } from '../../features/media-library/media'
import { importFiles } from '../../features/scene-management/actions'
import { pickFiles, useFileDrop } from '../../hooks/useFileDrop'
import { IMAGE_ACCEPT } from './MediaSlot'
import type { StoryboardFrame } from '../../types'

function Frame({ sceneId, frame, n, count }: { sceneId: string; frame: StoryboardFrame; n: number; count: number }) {
  const url = useMediaUrl(frame.mediaId, true)
  const { moveFrame, removeFrame } = useProject.getState()
  return (
    <div className="group relative h-[64px] w-[96px] shrink-0 overflow-hidden rounded-lg bg-[#070c16]">
      {url && (
        <button className="h-full w-full" onClick={() => useUI.setState({ lightbox: { mediaId: frame.mediaId, kind: 'image', title: `Fotograma ${n}` } })} aria-label={`Ampliar fotograma ${n}`}>
          <img src={url} alt="" className="h-full w-full object-cover" />
        </button>
      )}
      <span className="chip pointer-events-none absolute left-1 top-1 !h-[17px] bg-black/70 !px-1.5 text-white">{n}</span>
      <div className="absolute inset-x-0 bottom-0 flex justify-between bg-black/60 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        <button className="icon-btn sm !text-white" disabled={n === 1} onClick={() => moveFrame(sceneId, frame.id, -1)} aria-label="Mover a la izquierda">
          <ChevronLeft size={14} />
        </button>
        <button className="icon-btn sm !text-white" onClick={() => removeFrame(sceneId, frame.id)} aria-label="Quitar fotograma">
          <X size={14} />
        </button>
        <button className="icon-btn sm !text-white" disabled={n === count} onClick={() => moveFrame(sceneId, frame.id, 1)} aria-label="Mover a la derecha">
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  )
}

export function FramesStrip({ sceneId }: { sceneId: string }) {
  const frames = useProject((s) => s.scenes[sceneId]?.storyboardFrames)
  const addFrames = useProject((s) => s.addFrames)
  const accept = async (files: File[]) => {
    const assets = await importFiles(files, 'image')
    if (assets.length) {
      addFrames(sceneId, assets.map((a) => a.id))
      toast(assets.length === 1 ? 'Fotograma agregado' : `${assets.length} fotogramas agregados`)
    }
  }
  const drop = useFileDrop(accept)
  const sorted = [...(frames ?? [])].sort((a, b) => a.order - b.order)
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="label">Fotogramas intermedios <span className="text-ink-3">(opcional)</span></span>
      </div>
      <div {...drop.props} className={`dropzone flex gap-2 overflow-x-auto p-2 ${drop.over ? 'over' : ''}`}>
        {sorted.map((f, i) => (
          <Frame key={f.id} sceneId={sceneId} frame={f} n={i + 1} count={sorted.length} />
        ))}
        <button
          className="flex h-[64px] min-w-[96px] shrink-0 flex-col items-center justify-center gap-1 rounded-lg border border-line text-[11px] text-ink-3 hover:border-line-2 hover:text-ink-2"
          onClick={async () => accept(await pickFiles(IMAGE_ACCEPT, true))}
        >
          <Plus size={15} /> Agregar
        </button>
      </div>
    </div>
  )
}
