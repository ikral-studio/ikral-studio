import { useState } from 'react'
import { CheckCircle2, Film, Loader2, Play, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { useProject } from '../../stores/projectStore'
import { askConfirm, toast } from '../../stores/uiStore'
import { useMediaUrl } from '../../features/media-library/media'
import { importFiles } from '../../features/scene-management/actions'
import { pickFiles, useFileDrop } from '../../hooks/useFileDrop'
import { playback } from '../../features/playback/engine'
import { placedClips, shotVideo, versionLength } from '../../features/script-sync/derive'
import { formatDuration } from '../../utils'
import type { MediaAsset, Shot } from '../../types'

const VIDEO_ACCEPT = 'video/mp4,video/webm,video/quicktime,.mp4,.m4v,.webm,.mov'
const toVersion = (a: MediaAsset) => ({ mediaId: a.id, duration: a.duration ?? 0, width: a.width, height: a.height })

/** Video del plano: versiones, otro video seguido, reemplazar y quitar (a la papelera). */
export function ShotVideo({ sceneId, shot, label }: { sceneId: string; shot: Shot; label: string }) {
  const aspect = useProject((s) => s.project?.aspectRatio ?? '16:9')
  const { addShotVideo, setShotActiveVersion, removeShotVersion } = useProject.getState()
  const versions = shot.videoVersions ?? []
  const active = shotVideo(shot)
  const clips = active ? placedClips(active) : []
  const url = useMediaUrl(active?.mediaId)
  const [busy, setBusy] = useState(false)
  const l = label.toLowerCase()

  const importAs = async (files: File[], mode: 'new' | 'replace' | 'clip') => {
    if (!files[0]) return
    setBusy(true)
    const [asset] = await importFiles([files[0]], 'video')
    setBusy(false)
    if (!asset) return
    addShotVideo(sceneId, shot.id, toVersion(asset), mode)
    toast(`Video del ${l} guardado · ${formatDuration(asset.duration ?? 0)}`)
  }
  const drop = useFileDrop((f) => importAs(f, 'new'))

  const remove = async () => {
    if (!active) return
    const ok = await askConfirm({
      title: 'Quitar esta versión',
      body: `La versión se quita del ${l} y va a la Papelera. Las imágenes y el texto se conservan.`,
      confirmLabel: 'Quitar versión',
      danger: true,
    })
    if (ok) removeShotVersion(sceneId, shot.id, active.id)
  }

  const seekHere = () => {
    const seg = playback.segmentsSnapshot().find((x) => x.scene.id === sceneId)
    const part = seg?.parts.find((p) => p.shot.id === shot.id)
    if (seg) void playback.seek(seg.start + (part?.start ?? 0))
  }

  return (
    <div className="flex flex-col gap-1.5" aria-label={`Video del ${l}`}>
      <div className="flex items-center gap-2 text-[13px] text-ink-3">
        Video del plano
        {active && (
          <span className="text-[11.5px] tabular-nums">
            {formatDuration(versionLength(active))}
            {clips.length > 1 && ` en ${clips.length} videos`}
            {Math.abs(versionLength(active) - shot.duration) >= 0.5 && ` · planeado ${formatDuration(shot.duration)}`}
          </span>
        )}
      </div>
      {versions.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label={`Versiones de video del ${l}`}>
          {versions.map((v, i) => (
            <button
              key={v.id}
              role="tab"
              aria-selected={v.id === active?.id}
              className={`btn btn-sm ${v.id === active?.id ? '!border-ok/60 !bg-ok/15 !text-[#bbf7d0]' : ''}`}
              onClick={() => setShotActiveVersion(sceneId, shot.id, v.id)}
            >
              {v.id === active?.id && <CheckCircle2 size={12} />} Versión {i + 1}
            </button>
          ))}
        </div>
      )}
      <div
        {...drop.props}
        className={`media-frame ${!active ? 'dropzone' : ''} ${drop.over ? 'dropzone over' : ''}`}
        style={{ aspectRatio: aspect === '16:9' ? '16 / 9' : '9 / 16', width: '100%', maxWidth: aspect === '16:9' ? 392 : 124, marginInline: 'auto' }}
      >
        {busy && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-black/60 text-[12px] text-ink-2">
            <Loader2 className="animate-spin" /> Guardando video…
          </div>
        )}
        {active && url ? (
          <video key={url} src={url} controls preload="metadata" className="object-contain" playsInline />
        ) : (
          <button
            className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-ink-3 hover:text-ink-2"
            onClick={async () => importAs(await pickFiles(VIDEO_ACCEPT), 'new')}
            aria-label={`Agregar video al ${l}`}
          >
            <Film size={22} />
            <span className="text-[12.5px] font-medium">Arrastra aquí el video de este plano</span>
            <span className="text-[11px]">o haz clic para elegirlo · MP4 o WebM</span>
          </button>
        )}
      </div>
      {active && (
        <div className="flex flex-wrap items-center gap-1.5">
          <button className="btn btn-sm" onClick={seekHere} title="Pone el cabezal al inicio de este plano">
            <Play size={13} /> Ir al plano
          </button>
          <button className="btn btn-sm" onClick={async () => importAs(await pickFiles(VIDEO_ACCEPT), 'new')}>
            <Plus size={13} /> Nueva versión
          </button>
          <button className="btn btn-sm" onClick={async () => importAs(await pickFiles(VIDEO_ACCEPT), 'clip')} title="Otro video que sigue al anterior en este mismo plano">
            <Plus size={13} /> Otro video
          </button>
          <button className="btn btn-sm" onClick={async () => importAs(await pickFiles(VIDEO_ACCEPT), 'replace')}>
            <RefreshCw size={13} /> Reemplazar
          </button>
          <button className="btn btn-sm btn-danger ml-auto" onClick={remove} aria-label={`Quitar video del ${l}`}>
            <Trash2 size={13} /> Quitar
          </button>
        </div>
      )}
    </div>
  )
}
