import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, Maximize, Pause, Play, Repeat, RotateCcw, Volume2, VolumeX, Clapperboard } from 'lucide-react'
import { useProject } from '../../stores/projectStore'
import { useSegments } from '../../stores/selectors'
import { playback, usePlayback } from '../../features/playback/engine'
import { useMediaUrl } from '../../features/media-library/media'
import { shotStoryboardIds, storyboardMediaIds, totalDuration } from '../../features/script-sync/derive'
import { hasCoverage } from '../../features/coverage/shots'
import { formatTime, pad2 } from '../../utils'

function FrameView({ fit }: { fit: 'contain' | 'cover' }) {
  const segments = useSegments()
  const index = usePlayback((s) => s.index)
  const shotIdx = usePlayback((s) => s.shot)
  const seg = segments[index]
  // Con cobertura, se ven las imágenes del plano que toca; sin cobertura, las de la escena.
  const part = seg && hasCoverage(seg.scene) ? seg.parts[Math.min(shotIdx, seg.parts.length - 1)] : undefined
  const ids = part ? shotStoryboardIds(part.shot) : seg ? storyboardMediaIds(seg.scene) : []
  const from = (seg?.start ?? 0) + (part?.start ?? 0)
  const span = part?.duration ?? seg?.duration ?? 1
  // Con varias imágenes, se reparten a lo largo de la duración provisional.
  const frameIdx = usePlayback((s) => {
    if (!seg || ids.length < 2) return 0
    const p = (s.time - from) / span
    return Math.min(ids.length - 1, Math.max(0, Math.floor(p * ids.length)))
  })
  const url = useMediaUrl(ids[frameIdx])
  if (!seg) return null
  if (!ids.length)
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-ink-3">
        <Clapperboard size={28} />
        <span className="text-[13px]">
          Escena {pad2(index + 1)} · {seg.scene.title}
          {part && ` · Plano ${part.index + 1}`}
        </span>
        <span className="text-[11.5px]">Sin imágenes ni video</span>
      </div>
    )
  return url ? <img src={url} alt="" className="absolute inset-0 h-full w-full" style={{ objectFit: fit }} /> : null
}

export function Preview() {
  const aspect = useProject((s) => s.project?.aspectRatio ?? '16:9')
  const fit = useProject((s) => s.settings.fit)
  const { playing, loop, volume, muted, mode, error, index, shot } = usePlayback()
  const time = usePlayback((s) => s.time)
  const segments = useSegments()
  const total = totalDuration(segments)
  const seg = segments[index]
  const boxRef = useRef<HTMLDivElement>(null)
  const videoRef = useCallback((el: HTMLVideoElement | null) => playback.attach(el), [])
  const [isFull, setIsFull] = useState(false)

  useEffect(() => {
    const on = () => setIsFull(document.fullscreenElement === boxRef.current)
    document.addEventListener('fullscreenchange', on)
    return () => document.removeEventListener('fullscreenchange', on)
  }, [])

  const fullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void boxRef.current?.requestFullscreen?.()
  }

  const seekFromBar = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    void playback.seek(((e.clientX - rect.left) / rect.width) * total)
  }

  const provisional = mode === 'frames' && !!seg
  return (
    <section className="panel flex shrink-0 flex-col" aria-label="Vista previa">
      <div className="flex items-center gap-2 px-3.5 py-2.5">
        <Play size={16} className="text-ink-2" />
        <h2 className="shrink-0 whitespace-nowrap text-[13px] font-semibold tracking-wide">VISTA PREVIA</h2>
        {seg && (
          <span className="ml-auto min-w-0 truncate text-[11.5px] text-ink-2">
            Escena {pad2(index + 1)} · {seg.scene.title}
            {hasCoverage(seg.scene) && seg.parts[shot] && ` · Plano ${shot + 1} de ${seg.parts.length}`}
          </span>
        )}
        {provisional && (
          <span className="chip shrink-0 bg-warn/15 text-[#fcd34d]" title="Esta escena aún no tiene video: se muestra su storyboard">
            Provisional
          </span>
        )}
        <span className={`chip shrink-0 bg-white/5 text-ink-2 ${seg ? '' : 'ml-auto'}`}>{aspect}</span>
      </div>
      <div ref={boxRef} className={`flex flex-col bg-black ${isFull ? 'h-screen' : ''}`}>
        <div className={`relative flex items-center justify-center bg-black ${isFull ? 'min-h-0 flex-1' : ''}`}>
          <div
            className="relative bg-black"
            style={{
              aspectRatio: aspect === '16:9' ? '16 / 9' : '9 / 16',
              width: aspect === '16:9' ? (isFull ? '100%' : 'min(100%, calc(27vh * 16 / 9))') : 'auto',
              height: isFull ? '100%' : aspect === '9:16' ? 'min(var(--preview-vh, 340px), 34vh)' : 'auto',
              maxWidth: '100%',
              maxHeight: isFull ? '100%' : undefined,
            }}
          >
            <video
              ref={videoRef}
              className={`absolute inset-0 h-full w-full ${mode === 'video' ? '' : 'invisible'}`}
              style={{ objectFit: 'contain' }}
              playsInline
              preload="auto"
              onClick={() => playback.toggle()}
            />
            {mode === 'frames' && <FrameView fit={fit} />}
            {mode === 'empty' && (
              <div className="absolute inset-0 flex items-center justify-center text-[12.5px] text-ink-3">Agrega escenas para ver la película</div>
            )}
          </div>
        </div>
        {error && (
          <div className="flex items-center gap-1.5 bg-[#2a1515] px-3 py-1.5 text-[11.5px] text-[#fecaca]">
            <AlertTriangle size={13} /> {error}
          </div>
        )}
        <div className="flex items-center gap-2 bg-[#0d1524] px-2.5 py-2">
          <button className="icon-btn !text-white" onClick={() => playback.toggle()} disabled={!total} aria-label={playing ? 'Pausar' : 'Reproducir'} title="Reproducir / pausar (espacio)">
            {playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
          </button>
          <button className="icon-btn" onClick={() => playback.restart()} aria-label="Reiniciar" title="Reiniciar">
            <RotateCcw size={16} />
          </button>
          <span className="shrink-0 text-[12px] tabular-nums text-ink-2">
            {formatTime(time)} / {formatTime(total)}
          </span>
          <div
            className="group relative mx-1 h-5 min-w-[60px] flex-1 cursor-pointer touch-none"
            role="slider"
            aria-label="Progreso"
            aria-valuemin={0}
            aria-valuemax={Math.round(total)}
            aria-valuenow={Math.round(time)}
            tabIndex={0}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId)
              seekFromBar(e)
            }}
            onPointerMove={(e) => e.buttons === 1 && seekFromBar(e)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight') void playback.seek(time + 2)
              if (e.key === 'ArrowLeft') void playback.seek(time - 2)
            }}
          >
            <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-full bg-white/15">
              {segments.slice(1).map((s) => (
                <span key={s.scene.id} className="absolute top-0 h-full w-px bg-black/60" style={{ left: `${(s.start / (total || 1)) * 100}%` }} />
              ))}
              <div className="h-full bg-sel-2" style={{ width: `${(time / (total || 1)) * 100}%` }} />
            </div>
            <div className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow" style={{ left: `${(time / (total || 1)) * 100}%` }} />
          </div>
          <button
            className={`icon-btn ${loop ? '!text-sel-2' : ''}`}
            onClick={() => playback.setLoop(!loop)}
            aria-pressed={loop}
            aria-label="Repetir (loop)"
            title={loop ? 'Loop activado' : 'Loop desactivado'}
          >
            <Repeat size={16} />
          </button>
          <button className="icon-btn" onClick={() => playback.toggleMute()} aria-label={muted ? 'Activar sonido' : 'Silenciar'}>
            {muted || volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={muted ? 0 : volume}
            onChange={(e) => playback.setVolume(Number(e.target.value))}
            className="w-14 min-w-0 shrink"
            aria-label="Volumen"
          />
          <button className="icon-btn" onClick={fullscreen} aria-label="Pantalla completa" title="Pantalla completa">
            <Maximize size={16} />
          </button>
        </div>
      </div>
    </section>
  )
}
