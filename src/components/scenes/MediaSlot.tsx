import { useState } from 'react'
import { AlertTriangle, Download, ImagePlus, Loader2, Maximize2, RefreshCw, X } from 'lucide-react'
import { useProject } from '../../stores/projectStore'
import { toast, useUI } from '../../stores/uiStore'
import { getMediaBlob, useMediaMeta, useMediaUrl } from '../../features/media-library/media'
import { importFiles } from '../../features/scene-management/actions'
import { MEDIA_MIME, pickFiles, useFileDrop } from '../../hooks/useFileDrop'
import { downloadBlob, extFromMime, formatBytes, safeFilename } from '../../utils'
import type { AspectRatio } from '../../types'

export const IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp'

export function orientationMismatch(w: number | undefined, h: number | undefined, aspect: AspectRatio) {
  if (!w || !h || w === h) return false
  return aspect === '16:9' ? h > w : w > h
}

export async function downloadMedia(mediaId: string, baseName: string) {
  const rec = await getMediaBlob(mediaId)
  if (!rec) return toast('No se encontró el archivo', 'error')
  downloadBlob(rec.blob, `${safeFilename(baseName)}.${extFromMime(rec.mimeType)}`)
}

export function MediaSlot({
  sceneId,
  slot,
  label,
  fileBase,
}: {
  sceneId: string
  slot: 'start' | 'end'
  label: string
  fileBase: string
}) {
  const mediaId = useProject((s) => (slot === 'start' ? s.scenes[sceneId]?.startImageId : s.scenes[sceneId]?.endImageId))
  const aspect = useProject((s) => s.project?.aspectRatio ?? '16:9')
  const fit = useProject((s) => s.settings.fit)
  const setImage = useProject((s) => s.setImage)
  const url = useMediaUrl(mediaId)
  const meta = useMediaMeta(mediaId)
  const [busy, setBusy] = useState(false)

  const accept = async (files: File[]) => {
    if (!files[0]) return
    setBusy(true)
    const [asset] = await importFiles([files[0]], 'image')
    setBusy(false)
    if (asset) {
      setImage(sceneId, slot, asset.id)
      toast(`${label} guardada`)
    }
  }
  const drop = useFileDrop(accept, (id) => {
    setImage(sceneId, slot, id)
    toast(`${label} actualizada`)
  })
  const choose = async () => accept(await pickFiles(IMAGE_ACCEPT))
  const mismatch = orientationMismatch(meta?.width, meta?.height, aspect)

  return (
    <div className="min-w-0">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="label">{label}</span>
        {meta && (
          <span className="truncate text-[10.5px] tabular-nums text-ink-3" title={`${meta.name} · ${formatBytes(meta.size)}`}>
            {meta.width}×{meta.height} · {meta.mimeType.replace('image/', '').toUpperCase()}
          </span>
        )}
      </div>
      <div
        {...drop.props}
        className={`media-frame group ${!mediaId ? 'dropzone' : ''} ${drop.over ? 'dropzone over' : ''}`}
        style={{ aspectRatio: aspect === '16:9' ? '16 / 9' : '9 / 16', maxHeight: aspect === '9:16' ? 300 : undefined, marginInline: 'auto' }}
      >
        {busy && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/50">
            <Loader2 className="animate-spin text-ink-2" />
          </div>
        )}
        {mediaId && url ? (
          <>
            <img
              src={url}
              alt={`${label} de ${fileBase}`}
              style={{ objectFit: fit }}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(MEDIA_MIME, mediaId)
                e.dataTransfer.effectAllowed = 'copy'
                // Chrome permite soltar el archivo en el escritorio con DownloadURL.
                if (meta) e.dataTransfer.setData('DownloadURL', `${meta.mimeType}:${safeFilename(fileBase)}.${extFromMime(meta.mimeType)}:${url}`)
              }}
            />
            <div className="absolute inset-x-0 top-0 flex justify-end gap-1 bg-gradient-to-b from-black/70 to-transparent p-1.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
              <button className="icon-btn sm !bg-black/50 !text-white" onClick={() => useUI.setState({ lightbox: { mediaId, kind: 'image', title: `${fileBase} · ${label}`, target: { sceneId, slot } } })} title="Ampliar" aria-label={`Ampliar ${label}`}>
                <Maximize2 size={14} />
              </button>
              <button className="icon-btn sm !bg-black/50 !text-white" onClick={() => downloadMedia(mediaId, `${fileBase}-${slot === 'start' ? 'inicial' : 'final'}`)} title="Descargar (para subirla al generador)" aria-label={`Descargar ${label}`}>
                <Download size={14} />
              </button>
              <button className="icon-btn sm !bg-black/50 !text-white" onClick={choose} title="Reemplazar" aria-label={`Reemplazar ${label}`}>
                <RefreshCw size={14} />
              </button>
              <button className="icon-btn sm !bg-black/50 !text-white" onClick={() => setImage(sceneId, slot, undefined)} title="Quitar de la escena" aria-label={`Quitar ${label}`}>
                <X size={14} />
              </button>
            </div>
            {mismatch && (
              <span className="chip absolute bottom-1.5 left-1.5 bg-black/70 text-warn" title="La orientación de la imagen no coincide con el formato del proyecto">
                <AlertTriangle size={11} /> Otra orientación
              </span>
            )}
          </>
        ) : (
          <button className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-ink-3 hover:text-ink-2" onClick={choose}>
            <ImagePlus size={22} />
            <span className="text-[11.5px]">Arrastra o elige imagen</span>
          </button>
        )}
      </div>
    </div>
  )
}
