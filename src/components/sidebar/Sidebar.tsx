import { memo } from 'react'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Copy, GripVertical, ImageIcon, PanelLeftClose, Plus } from 'lucide-react'
import { useProject } from '../../stores/projectStore'
import { useUI } from '../../stores/uiStore'
import { useMediaUrl } from '../../features/media-library/media'
import { effectiveDuration } from '../../features/script-sync/derive'
import { addSceneAndFocus, duplicateAndFocus, selectScene } from '../../features/scene-management/actions'
import { usePlayback } from '../../features/playback/engine'
import { formatDuration, pad2 } from '../../utils'
import { StatusChip } from '../common/StatusChip'
import { EMPTY_IDS } from '../../stores/selectors'

const SceneItem = memo(function SceneItem({ id, n }: { id: string; n: number }) {
  const scene = useProject((s) => s.scenes[id])
  const selected = useProject((s) => s.selectedSceneId === id)
  const playing = usePlayback((s) => s.playing)
  const thumb = useMediaUrl(scene?.startImageId ?? scene?.storyboardFrames[0]?.mediaId ?? scene?.endImageId, true)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled: playing })
  if (!scene) return null
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 10 : undefined }}
      className={`group relative flex items-center gap-2 rounded-xl border p-2 transition-colors ${
        selected ? 'border-sel bg-sel/10' : 'border-transparent bg-card/60 hover:bg-card'
      } ${isDragging ? 'opacity-80 shadow-xl shadow-black/40' : ''}`}
    >
      <button
        className="absolute inset-0 rounded-xl"
        onClick={() => selectScene(id, { seek: true })}
        aria-label={`Seleccionar escena ${n}: ${scene.title}`}
        aria-current={selected}
      />
      <span className="relative w-4 shrink-0 text-center text-[12px] font-semibold tabular-nums text-ink-2">{pad2(n)}</span>
      <div className="relative flex h-[38px] w-[56px] shrink-0 items-center justify-center overflow-hidden rounded-md bg-[#0b1322]">
        {thumb ? <img src={thumb} alt="" className="h-full w-full object-cover" /> : <ImageIcon size={16} className="text-ink-3" />}
      </div>
      <div className="pointer-events-none relative min-w-0 flex-1">
        <div className="truncate text-[12.5px] font-medium">{scene.title}</div>
        <div className="mt-1 flex items-center gap-1.5 text-[11px] text-ink-3">
          <span className="tabular-nums">{formatDuration(effectiveDuration(scene))}</span>
          <StatusChip status={scene.status} compact />
        </div>
      </div>
      <button
        className="icon-btn sm !absolute right-1 top-1 cursor-grab bg-panel/80 text-ink-3 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 active:cursor-grabbing disabled:cursor-not-allowed"
        aria-label={`Mover escena ${n} (arrastra o usa flechas)`}
        title={playing ? 'Pausa la reproducción para reordenar' : 'Arrastra para reordenar'}
        disabled={playing}
        {...attributes}
        {...listeners}
      >
        <GripVertical size={15} />
      </button>
    </li>
  )
})

export function Sidebar() {
  const sceneIds = useProject((s) => s.project?.sceneIds ?? EMPTY_IDS)
  const selected = useProject((s) => s.selectedSceneId)
  const moveScene = useProject((s) => s.moveScene)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return
    moveScene(String(e.active.id), sceneIds.indexOf(String(e.over.id)))
  }
  return (
    <aside className="area-left no-print flex flex-col gap-2 overflow-hidden bg-bg py-3 pl-3" aria-label="Escenas">
      <div className="flex gap-1.5">
        <button className="btn btn-primary !h-10 flex-1 text-[13.5px]" onClick={addSceneAndFocus}>
          <Plus size={18} /> Agregar escena
        </button>
        <button className="icon-btn !h-10" onClick={() => useUI.setState({ leftCollapsed: true })} title="Ocultar panel" aria-label="Ocultar panel de escenas">
          <PanelLeftClose size={17} />
        </button>
      </div>
      <button className="btn !h-9" disabled={!selected} onClick={() => selected && duplicateAndFocus(selected)}>
        <Copy size={15} /> Duplicar escena
      </button>
      <div className="flex items-center justify-between px-1 pt-2">
        <span className="eyebrow">Escenas</span>
        <span className="text-[11px] tabular-nums text-ink-3">{sceneIds.length}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {sceneIds.length === 0 ? (
          <div className="dropzone mt-1 p-4 text-center text-[12px] leading-relaxed text-ink-3">
            Todavía no hay escenas.
            <br />
            Pulsa «Agregar escena» para empezar.
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={sceneIds} strategy={verticalListSortingStrategy}>
              <ol className="flex flex-col gap-1.5">
                {sceneIds.map((id, i) => (
                  <SceneItem key={id} id={id} n={i + 1} />
                ))}
              </ol>
            </SortableContext>
          </DndContext>
        )}
        <button className="dropzone mt-2 flex h-11 w-full items-center justify-center gap-2 text-[12.5px] text-ink-3 hover:text-ink-2" onClick={addSceneAndFocus}>
          <Plus size={15} /> Agregar nueva escena
        </button>
      </div>
    </aside>
  )
}
