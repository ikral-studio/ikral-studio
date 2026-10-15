import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { DndContext, PointerSensor, KeyboardSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, horizontalListSortingStrategy, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Film, ImageIcon, Maximize2, Minus, Pause, Play, Plus, Repeat } from 'lucide-react'
import { useProject } from '../../stores/projectStore'
import { useSegments } from '../../stores/selectors'
import { playback, usePlayback } from '../../features/playback/engine'
import { useMediaUrl } from '../../features/media-library/media'
import { storyboardMediaIds, totalDuration, type Segment } from '../../features/script-sync/derive'
import { addSceneAndFocus, selectScene } from '../../features/scene-management/actions'
import { clamp, formatDuration, formatTime } from '../../utils'
import { accentFor } from '../common/StatusChip'

const MIN_W = 76
const LABEL_W = 116
const TRACK_PAD = 12

interface Layout {
  x: number
  w: number
}

function layoutFor(segments: Segment[], pps: number): Layout[] {
  let x = 0
  return segments.map((s) => {
    const w = Math.max(MIN_W, s.duration * pps)
    const l = { x, w }
    x += w
    return l
  })
}

function timeToX(t: number, segments: Segment[], layout: Layout[]): number {
  if (!segments.length) return 0
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i]
    if (t <= s.end || i === segments.length - 1) {
      const p = clamp((t - s.start) / s.duration, 0, 1)
      return layout[i].x + p * layout[i].w
    }
  }
  return 0
}

function xToTime(x: number, segments: Segment[], layout: Layout[]): number {
  for (let i = 0; i < segments.length; i++) {
    const l = layout[i]
    if (x <= l.x + l.w || i === segments.length - 1) {
      const p = clamp((x - l.x) / l.w, 0, 1)
      return segments[i].start + p * segments[i].duration
    }
  }
  return 0
}

function Mini({ mediaId }: { mediaId: string }) {
  const url = useMediaUrl(mediaId, true)
  return <div className="h-full min-w-0 flex-1 bg-black/30">{url && <img src={url} alt="" className="h-full w-full object-cover" />}</div>
}

const StoryBlock = memo(function StoryBlock({ seg, w, selected, playing }: { seg: Segment; w: number; selected: boolean; playing: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: seg.scene.id, disabled: playing })
  const ids = storyboardMediaIds(seg.scene)
  const maxThumbs = Math.max(1, Math.floor(w / 46))
  const shown = ids.length <= maxThumbs ? ids : ids.filter((_, i) => i % Math.ceil(ids.length / maxThumbs) === 0 || i === ids.length - 1)
  const color = accentFor(seg.index)
  return (
    <div
      ref={setNodeRef}
      style={{ width: w, transform: CSS.Translate.toString(transform), transition, zIndex: isDragging ? 20 : undefined }}
      className="h-full shrink-0 px-[2px]"
    >
      <button
        {...attributes}
        {...listeners}
        onClick={() => selectScene(seg.scene.id, { seek: true })}
        className={`flex h-full w-full flex-col overflow-hidden rounded-lg border text-left ${selected ? 'border-white ring-2 ring-sel-2' : 'border-black/30'} ${isDragging ? 'opacity-80 shadow-xl' : ''} ${playing ? '' : 'cursor-grab active:cursor-grabbing'}`}
        style={{ background: color }}
        aria-label={`Storyboard escena ${seg.index + 1}: ${seg.scene.title}, ${formatDuration(seg.scene.plannedDuration)} planeados`}
        title={`${seg.scene.title} · planeado ${formatDuration(seg.scene.plannedDuration)}${playing ? '' : ' · arrastra para reordenar'}`}
      >
        <div className="flex min-h-0 flex-1 gap-px">
          {shown.length ? shown.map((id, i) => <Mini key={id + i} mediaId={id} />) : (
            <div className="flex flex-1 items-center justify-center bg-black/25 text-white/60"><ImageIcon size={15} /></div>
          )}
        </div>
        <div className="flex items-center gap-1 px-1.5 py-[3px] text-[11px] font-medium text-white">
          <span className="truncate">Escena {seg.index + 1} · {seg.scene.title}</span>
          <span className="ml-auto shrink-0 tabular-nums text-white/75">{formatDuration(seg.scene.plannedDuration)}</span>
        </div>
      </button>
    </div>
  )
})

const VideoBlock = memo(function VideoBlock({ seg, w, selected }: { seg: Segment; w: number; selected: boolean }) {
  const url = useMediaUrl(seg.video?.mediaId, true)
  const color = accentFor(seg.index)
  if (!seg.video)
    return (
      <div style={{ width: w }} className="h-full shrink-0 px-[2px]">
        <button
          onClick={() => selectScene(seg.scene.id, { seek: true })}
          className={`flex h-full w-full items-center gap-1.5 overflow-hidden rounded-lg border border-dashed px-2 text-[11px] text-ink-3 ${selected ? 'border-sel-2' : 'border-line-2'}`}
          aria-label={`Escena ${seg.index + 1} sin video`}
        >
          <Film size={13} className="shrink-0" /> <span className="truncate">Sin video · {formatDuration(seg.duration)}</span>
        </button>
      </div>
    )
  return (
    <div style={{ width: w }} className="h-full shrink-0 px-[2px]">
      <button
        onClick={() => selectScene(seg.scene.id, { seek: true })}
        className={`flex h-full w-full items-center gap-1.5 overflow-hidden rounded-lg border pr-2 text-left text-[11px] font-medium text-white ${selected ? 'border-white ring-2 ring-sel-2' : 'border-black/30'}`}
        style={{ background: `linear-gradient(90deg, ${color}, ${color}cc)` }}
        aria-label={`Video escena ${seg.index + 1}, ${formatDuration(seg.duration)}`}
      >
        <div className="h-full w-[52px] shrink-0 bg-black/30">{url && <img src={url} alt="" className="h-full w-full object-cover" />}</div>
        <span className="truncate">Escena {seg.index + 1} · {formatDuration(seg.duration)}</span>
      </button>
    </div>
  )
})

function Playhead({ segments, layout }: { segments: Segment[]; layout: Layout[] }) {
  const time = usePlayback((s) => s.time)
  const x = timeToX(time, segments, layout)
  return (
    <div className="pointer-events-none absolute bottom-0 top-0 z-30" style={{ left: TRACK_PAD + x }} data-playhead>
      <div className="absolute -left-[6px] top-0 h-0 w-0 border-x-[6px] border-t-[8px] border-x-transparent border-t-sel-2" />
      <div className="absolute -left-px top-0 h-full w-[2px] bg-sel-2 shadow-[0_0_6px_#3b82f6]" />
    </div>
  )
}

export function Timeline() {
  const segments = useSegments()
  const selected = useProject((s) => s.selectedSceneId)
  const moveScene = useProject((s) => s.moveScene)
  const sceneIds = useMemo(() => segments.map((s) => s.scene.id), [segments])
  const playing = usePlayback((s) => s.playing)
  const loop = usePlayback((s) => s.loop)
  const time = usePlayback((s) => s.time)
  const total = totalDuration(segments)
  const [pps, setPps] = useState(24)
  const layout = useMemo(() => layoutFor(segments, pps), [segments, pps])
  const width = layout.length ? layout[layout.length - 1].x + layout[layout.length - 1].w : 0
  const scrollRef = useRef<HTMLDivElement>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const fit = () => {
    const el = scrollRef.current
    if (!el || !total) return
    setPps(clamp((el.clientWidth - TRACK_PAD * 2 - 8) / total, 4, 200))
  }

  // Seguir el cabezal mientras se reproduce.
  useEffect(() => {
    const el = scrollRef.current
    if (!el || !playing) return
    const x = TRACK_PAD + timeToX(time, segments, layout)
    if (x < el.scrollLeft + 40 || x > el.scrollLeft + el.clientWidth - 60) el.scrollLeft = x - 80
  }, [time, playing, segments, layout])

  const ticks = useMemo(() => {
    const steps = [1, 2, 5, 10, 15, 30, 60, 120, 300]
    const step = steps.find((s) => s * pps >= 64) ?? 600
    const out: number[] = []
    for (let t = 0; t <= total + 0.001; t += step) out.push(t)
    return out
  }, [pps, total])

  const seekAt = (clientX: number) => {
    const el = scrollRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const x = clientX - rect.left + el.scrollLeft - TRACK_PAD
    void playback.seek(xToTime(x, segments, layout))
  }

  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return
    moveScene(String(e.active.id), sceneIds.indexOf(String(e.over.id)))
  }

  return (
    <section className="area-tl no-print flex flex-col border-t border-line bg-panel" aria-label="Línea de tiempo">
      <div className="flex items-center gap-3 border-b border-line px-3 py-1.5">
        <button className="flex h-9 w-9 items-center justify-center rounded-full bg-card-2 text-white hover:bg-sel" onClick={() => playback.toggle()} disabled={!total} aria-label={playing ? 'Pausar' : 'Reproducir'}>
          {playing ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" className="ml-0.5" />}
        </button>
        <label className="flex cursor-pointer items-center gap-2 text-[12.5px] text-ink-2">
          <Repeat size={15} /> Loop
          <button
            role="switch"
            aria-checked={loop}
            onClick={() => playback.setLoop(!loop)}
            className={`relative h-5 w-9 rounded-full transition-colors ${loop ? 'bg-sel' : 'bg-line-2'}`}
          >
            <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${loop ? 'left-[18px]' : 'left-0.5'}`} />
          </button>
        </label>
        <span className="text-[13px] tabular-nums text-ink">
          {formatTime(time)} <span className="text-ink-3">/ {formatTime(total)}</span>
        </span>
        <span className="text-[11.5px] text-ink-3">{segments.length} escenas</span>
        <div className="ml-auto flex items-center gap-1">
          <span className="mr-1 text-[11.5px] text-ink-3">Zoom</span>
          <button className="icon-btn sm" onClick={() => setPps((p) => clamp(p / 1.4, 4, 200))} aria-label="Alejar">
            <Minus size={14} />
          </button>
          <input type="range" min={4} max={200} step={1} value={pps} onChange={(e) => setPps(Number(e.target.value))} className="w-24" aria-label="Zoom del timeline" />
          <button className="icon-btn sm" onClick={() => setPps((p) => clamp(p * 1.4, 4, 200))} aria-label="Acercar">
            <Plus size={14} />
          </button>
          <button className="btn btn-sm btn-ghost" onClick={fit} title="Ajustar al ancho">
            <Maximize2 size={13} /> Ajustar
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="flex shrink-0 flex-col border-r border-line" style={{ width: LABEL_W }}>
          <div className="h-7 border-b border-line" />
          <div className="flex flex-1 items-center gap-2 px-3 text-[12.5px] font-medium text-ink-2">
            <ImageIcon size={16} /> Storyboard
          </div>
          <div className="flex h-[52px] items-center gap-2 px-3 text-[12.5px] font-medium text-ink-2">
            <Film size={16} /> Videos
          </div>
        </div>
        <div ref={scrollRef} className="relative min-w-0 flex-1 overflow-x-auto overflow-y-hidden">
          <div className="relative flex h-full flex-col" style={{ width: width + TRACK_PAD * 2 + 40, minWidth: '100%' }}>
            <div
              className="relative h-7 shrink-0 cursor-pointer touch-none border-b border-line"
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId)
                seekAt(e.clientX)
              }}
              onPointerMove={(e) => e.buttons === 1 && seekAt(e.clientX)}
              role="slider"
              aria-label="Regla de tiempo"
              aria-valuemin={0}
              aria-valuemax={Math.round(total)}
              aria-valuenow={Math.round(time)}
            >
              {ticks.map((t) => (
                <div key={t} className="absolute top-0 h-full" style={{ left: TRACK_PAD + timeToX(t, segments, layout) }}>
                  <div className="h-2 w-px bg-ink-3" />
                  <span className="absolute left-1 top-1.5 text-[10.5px] tabular-nums text-ink-3">{formatTime(t)}</span>
                </div>
              ))}
            </div>
            {segments.length === 0 ? (
              <div className="flex flex-1 items-center px-4 text-[12.5px] text-ink-3">El timeline se llena cuando agregas escenas.</div>
            ) : (
              <>
                <div className="group/track relative min-h-0 flex-1 py-1.5" style={{ paddingLeft: TRACK_PAD }}>
                  {!playing &&
                    layout.slice(1).map((l, i) => (
                      <button
                        key={sceneIds[i + 1]}
                        className="absolute top-0 z-20 flex h-5 w-5 -translate-x-1/2 items-center justify-center rounded-full border border-sel-2 bg-bg text-[#bfdbfe] opacity-0 shadow transition-opacity hover:bg-sel hover:text-white focus-visible:opacity-100 group-hover/track:opacity-100"
                        style={{ left: TRACK_PAD + l.x }}
                        onClick={() => addSceneAndFocus(i + 1)}
                        title="Insertar escena aquí"
                        aria-label={`Insertar escena entre la ${i + 1} y la ${i + 2}`}
                      >
                        <Plus size={12} />
                      </button>
                    ))}
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                    <SortableContext items={sceneIds} strategy={horizontalListSortingStrategy}>
                      <div className="flex h-full">
                        {segments.map((s, i) => (
                          <StoryBlock key={s.scene.id} seg={s} w={layout[i].w} selected={s.scene.id === selected} playing={playing} />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                </div>
                <div className="flex h-[52px] shrink-0 py-1.5" style={{ paddingLeft: TRACK_PAD }}>
                  {segments.map((s, i) => (
                    <VideoBlock key={s.scene.id} seg={s} w={layout[i].w} selected={s.scene.id === selected} />
                  ))}
                </div>
              </>
            )}
            <Playhead segments={segments} layout={layout} />
          </div>
        </div>
      </div>
    </section>
  )
}
