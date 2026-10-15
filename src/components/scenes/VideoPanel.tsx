import { useState } from 'react'
import { AlertTriangle, CheckCircle2, Download, Film, Loader2, Maximize2, Plus, RefreshCw, SlidersHorizontal, Trash2 } from 'lucide-react'
import { useProject } from '../../stores/projectStore'
import { askConfirm, toast, useUI } from '../../stores/uiStore'
import { useMediaUrl } from '../../features/media-library/media'
import { importFiles } from '../../features/scene-management/actions'
import { pickFiles, useFileDrop } from '../../hooks/useFileDrop'
import { formatDuration } from '../../utils'
import { downloadMedia, orientationMismatch } from './MediaSlot'
import { videoRange } from '../../features/script-sync/derive'
import type { MediaAsset, VideoVersion } from '../../types'

const VIDEO_ACCEPT = 'video/mp4,video/webm,video/quicktime,.mp4,.m4v,.webm,.mov'

const toVersion = (a: MediaAsset) => ({ mediaId: a.id, duration: a.duration ?? 0, width: a.width, height: a.height })

function VersionMeta({ sceneId, v }: { sceneId: string; v: VideoVersion }) {
  const update = useProject((s) => s.updateVersion)
  const num = (x: string) => (x.trim() === '' ? undefined : Number(x))
  return (
    <div className="mt-2 grid grid-cols-2 gap-2 rounded-xl border border-line bg-[#0f1828] p-2.5 lg:grid-cols-3">
      <label className="flex flex-col gap-1">
        <span className="label">Modelo</span>
        <input className="field !py-1.5" placeholder="Kling 2.5, Wan…" value={v.model ?? ''} onChange={(e) => update(sceneId, v.id, { model: e.target.value })} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="label">Créditos</span>
        <input className="field !py-1.5" type="number" min={0} value={v.credits ?? ''} onChange={(e) => update(sceneId, v.id, { credits: num(e.target.value) })} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="label">Tiempo de generación (s)</span>
        <input className="field !py-1.5" type="number" min={0} value={v.generationTimeSeconds ?? ''} onChange={(e) => update(sceneId, v.id, { generationTimeSeconds: num(e.target.value) })} />
      </label>
      <label className="col-span-2 flex flex-col gap-1 lg:col-span-3">
        <span className="label">Comentarios de revisión</span>
        <textarea className="field" rows={2} value={v.notes ?? ''} onChange={(e) => update(sceneId, v.id, { notes: e.target.value })} placeholder="Qué salió bien o mal en esta versión" />
      </label>
      <div className="col-span-2 text-[11px] text-ink-3 lg:col-span-3">Importado {new Date(v.createdAt).toLocaleString('es-MX')}</div>
    </div>
  )
}

export function VideoPanel({ sceneId, fileBase }: { sceneId: string; fileBase: string }) {
  const versions = useProject((s) => s.scenes[sceneId]?.videoVersions)
  const activeId = useProject((s) => s.scenes[sceneId]?.activeVideoVersionId)
  const planned = useProject((s) => s.scenes[sceneId]?.plannedDuration ?? 0)
  const aspect = useProject((s) => s.project?.aspectRatio ?? '16:9')
  const { addVideoVersion, replaceActiveVideo, setActiveVersion, removeVersion } = useProject.getState()
  const active = versions?.find((v) => v.id === activeId)
  const url = useMediaUrl(active?.mediaId)
  const [busy, setBusy] = useState(false)
  const [showMeta, setShowMeta] = useState(false)

  const importAs = async (files: File[], mode: 'new' | 'replace') => {
    if (!files[0]) return
    setBusy(true)
    const [asset] = await importFiles([files[0]], 'video')
    setBusy(false)
    if (!asset) return
    if (mode === 'replace') replaceActiveVideo(sceneId, toVersion(asset))
    else addVideoVersion(sceneId, toVersion(asset))
    toast(`Video guardado · ${formatDuration(asset.duration ?? 0)}`)
  }
  const drop = useFileDrop((f) => importAs(f, 'new'))
  const n = versions?.length ?? 0

  const remove = async () => {
    if (!active) return
    const ok = await askConfirm({
      title: 'Quitar esta versión',
      body: 'La versión se quita de la escena. Las imágenes y el guion se conservan. Puedes deshacer con ⌘Z.',
      confirmLabel: 'Quitar versión',
      danger: true,
    })
    if (ok) removeVersion(sceneId, active.id)
  }

  return (
    <div>
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
        <span className="text-[13px] font-semibold">Video generado</span>
        {active && (
          <span className="text-[11px] tabular-nums text-ink-3">
            {formatDuration(videoRange(active).length)}
            {videoRange(active).length < active.duration - 0.01 && ` (recortado de ${formatDuration(active.duration)})`}
            {active.width ? ` · ${active.width}×${active.height}` : ''}
            {Math.abs(videoRange(active).length - planned) >= 0.5 && ` · planeado ${formatDuration(planned)}`}
          </span>
        )}
      </div>

      {n > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Versiones de video">
          {versions!.map((v, i) => (
            <button
              key={v.id}
              role="tab"
              aria-selected={v.id === activeId}
              className={`btn btn-sm ${v.id === activeId ? '!border-ok/60 !bg-ok/15 !text-[#bbf7d0]' : ''}`}
              onClick={() => setActiveVersion(sceneId, v.id)}
              title={v.model ? `Modelo: ${v.model}` : undefined}
            >
              {v.id === activeId && <CheckCircle2 size={12} />}
              Versión {i + 1}
              {v.model ? <span className="text-ink-3">· {v.model}</span> : null}
            </button>
          ))}
          <button className="btn btn-sm btn-ghost" onClick={async () => importAs(await pickFiles(VIDEO_ACCEPT), 'new')}>
            <Plus size={13} /> Nueva versión
          </button>
        </div>
      )}

      <div
        {...drop.props}
        className={`media-frame ${!active ? 'dropzone' : ''} ${drop.over ? 'dropzone over' : ''}`}
        style={{ aspectRatio: aspect === '16:9' ? '16 / 9' : '9 / 16', maxHeight: aspect === '9:16' ? 420 : 360, marginInline: 'auto' }}
      >
        {busy && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-black/60 text-[12px] text-ink-2">
            <Loader2 className="animate-spin" /> Guardando video…
          </div>
        )}
        {active && url ? (
          <video key={url} src={url} controls preload="metadata" className="object-contain" playsInline />
        ) : (
          <button className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-ink-3 hover:text-ink-2" onClick={async () => importAs(await pickFiles(VIDEO_ACCEPT), 'new')}>
            <Film size={26} />
            <span className="text-[13px] font-medium">Arrastra aquí el video generado</span>
            <span className="text-[11px]">o haz clic para elegirlo · MP4 o WebM</span>
          </button>
        )}
      </div>

      {active && (
        <>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <button className="btn btn-sm" onClick={() => useUI.setState({ lightbox: { mediaId: active.mediaId, kind: 'video', title: fileBase } })}>
              <Maximize2 size={13} /> Ampliar
            </button>
            <button className="btn btn-sm" onClick={async () => importAs(await pickFiles(VIDEO_ACCEPT), 'replace')}>
              <RefreshCw size={13} /> Reemplazar
            </button>
            <button className="btn btn-sm" onClick={() => downloadMedia(active.mediaId, fileBase)}>
              <Download size={13} /> Descargar
            </button>
            <button className={`btn btn-sm ${showMeta ? '!border-sel' : ''}`} onClick={() => setShowMeta((v) => !v)} aria-expanded={showMeta}>
              <SlidersHorizontal size={13} /> Datos de la versión
            </button>
            <button className="btn btn-sm btn-danger ml-auto" onClick={remove}>
              <Trash2 size={13} /> Quitar
            </button>
          </div>
          {orientationMismatch(active.width, active.height, aspect) && (
            <p className="mt-1.5 flex items-center gap-1.5 text-[11.5px] text-warn">
              <AlertTriangle size={13} /> Este video tiene otra orientación que el proyecto ({aspect}). Se muestra completo, sin recortar.
            </p>
          )}
          {showMeta && <VersionMeta sceneId={sceneId} v={active} />}
        </>
      )}
    </div>
  )
}
