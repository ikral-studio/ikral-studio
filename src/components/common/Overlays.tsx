import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useState as useStateL } from 'react'
import { AlertTriangle, CheckCircle2, Crop, Info, Maximize2, X } from 'lucide-react'
import { CropEditor } from './CropEditor'
import { useProject } from '../../stores/projectStore'
import { importFiles } from '../../features/scene-management/actions'
import { getMediaBlob, useMediaMeta } from '../../features/media-library/media'
import { toast } from '../../stores/uiStore'
import { useUI } from '../../stores/uiStore'
import { useMediaUrl } from '../../features/media-library/media'

export function Modal({
  title,
  onClose,
  children,
  width = 520,
  footer,
}: {
  title: string
  onClose: () => void
  children: ReactNode
  width?: number
  footer?: ReactNode
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Con una imagen en pantalla completa, Esc cierra solo esa imagen.
      if (e.key === 'Escape' && !useUI.getState().fullscreen) {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])
  return (
    <div
      className="no-print fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-[2px]"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="panel flex max-h-[88vh] w-full flex-col shadow-2xl shadow-black/50"
        style={{ maxWidth: width }}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h2 className="text-[15px] font-semibold">{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Cerrar">
            <X size={17} />
          </button>
        </div>
        <div className="min-h-0 overflow-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>
  )
}

export function ConfirmDialog() {
  const req = useUI((s) => s.confirm)
  if (!req) return null
  const close = (ok: boolean) => {
    useUI.setState({ confirm: null })
    req.resolve(ok)
  }
  return (
    <Modal
      title={req.title}
      onClose={() => close(false)}
      width={420}
      footer={
        <>
          <button className="btn" onClick={() => close(false)}>
            Cancelar
          </button>
          <button className={req.danger ? 'btn btn-primary !bg-bad !border-bad' : 'btn btn-primary'} onClick={() => close(true)} autoFocus>
            {req.confirmLabel ?? 'Aceptar'}
          </button>
        </>
      }
    >
      <p className="text-[13px] leading-relaxed text-ink-2">{req.body}</p>
    </Modal>
  )
}

export function Toasts() {
  const toasts = useUI((s) => s.toasts)
  return (
    <div className="no-print pointer-events-none fixed top-16 left-1/2 z-[60] flex -translate-x-1/2 flex-col items-center gap-2" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="toast flex items-center gap-2 rounded-xl border border-line-2 bg-card-2 px-4 py-2.5 text-[13px] shadow-xl shadow-black/40"
        >
          {t.kind === 'ok' && <CheckCircle2 size={16} className="text-ok" />}
          {t.kind === 'error' && <AlertTriangle size={16} className="text-bad" />}
          {t.kind === 'info' && <Info size={16} className="text-sel-2" />}
          {t.text}
        </div>
      ))}
    </div>
  )
}

export function Lightbox() {
  const item = useUI((s) => s.lightbox)
  const url = useMediaUrl(item?.mediaId)
  const meta = useMediaMeta(item?.mediaId)
  const aspect = useProject((s) => s.project?.aspectRatio ?? '16:9')
  const [cropping, setCropping] = useStateL(false)
  // El recorte usa una copia local (blob:) para que el lienzo pueda exportar la imagen.
  const [cropUrl, setCropUrl] = useStateL<string | null>(null)
  const startCrop = async () => {
    const rec = item && (await getMediaBlob(item.mediaId))
    if (!rec) return toast('No se encontró la imagen', 'error')
    setCropUrl(URL.createObjectURL(rec.blob))
    setCropping(true)
  }
  const stopCrop = () => {
    if (cropUrl) URL.revokeObjectURL(cropUrl)
    setCropUrl(null)
    setCropping(false)
  }
  if (!item) return null
  const close = () => {
    stopCrop()
    useUI.setState({ lightbox: null })
  }
  const canCrop = item.kind === 'image' && !!item.target && !!url
  const ratio = aspect === '16:9' ? 16 / 9 : 9 / 16

  const saveCrop = async (blob: Blob, w: number, h: number) => {
    const t = item.target!
    const base = (meta?.name ?? 'imagen').replace(/\.[^.]+$/, '')
    const ext = blob.type === 'image/png' ? 'png' : 'jpg'
    const [asset] = await importFiles([new File([blob], `${base}-recorte-${aspect.replace(':', 'x')}.${ext}`, { type: blob.type })], 'image')
    if (!asset) return
    const st = useProject.getState()
    if (t.slot) st.setImage(t.sceneId, t.slot, asset.id)
    else if (t.frameId) st.setFrameMedia(t.sceneId, t.frameId, asset.id)
    toast(`Recortada a ${aspect} · ${w}×${h}`)
    stopCrop()
    useUI.setState({ lightbox: { ...item, mediaId: asset.id } })
  }

  return (
    <Modal title={item.title ?? 'Vista ampliada'} onClose={close} width={1100}>
      {cropping && cropUrl ? (
        <CropEditor url={cropUrl} ratio={ratio} ratioLabel={aspect} mimeType={meta?.mimeType ?? 'image/jpeg'} onCancel={stopCrop} onDone={saveCrop} />
      ) : (
      <>
      {canCrop && (
        <div className="mb-2 flex items-center gap-2">
          {meta?.width && <span className="text-[12px] tabular-nums text-ink-3">{meta.width}×{meta.height}</span>}
          <button className="btn btn-sm ml-auto" onClick={() => void startCrop()}>
            <Crop size={13} /> Recortar a {aspect}
          </button>
        </div>
      )}
      <div className="flex items-center justify-center rounded-lg bg-black">
        {url &&
          (item.kind === 'image' ? (
            <img src={url} alt={item.title ?? ''} className="max-h-[72vh] w-auto object-contain" />
          ) : (
            <video src={url} controls autoPlay className="max-h-[72vh] w-auto" />
          ))}
      </div>
      </>
      )}
    </Modal>
  )
}

/** Botón ⛶ que abre una imagen en pantalla completa. */
export function FullScreenButton({ mediaId, title, className = '' }: { mediaId?: string; title?: string; className?: string }) {
  if (!mediaId) return null
  return (
    <button
      className={`icon-btn sm !bg-black/55 !text-white hover:!bg-black/75 ${className}`}
      onClick={(e) => {
        e.stopPropagation()
        useUI.setState({ fullscreen: { mediaId, title } })
      }}
      title="Ver en pantalla completa"
      aria-label={`Ver en pantalla completa${title ? ` ${title}` : ''}`}
    >
      <Maximize2 size={13} />
    </button>
  )
}

/** Imagen en pantalla completa: Esc o un clic la cierran. */
export function FullScreenImage() {
  const item = useUI((s) => s.fullscreen)
  const url = useMediaUrl(item?.mediaId)
  useEffect(() => {
    if (!item) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        useUI.setState({ fullscreen: null })
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [item])
  if (!item) return null
  const close = () => useUI.setState({ fullscreen: null })
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Pantalla completa${item.title ? ` · ${item.title}` : ''}`}
      className="no-print fixed inset-0 z-[90] flex cursor-zoom-out items-center justify-center bg-black"
      onClick={close}
    >
      {url && <img src={url} alt={item.title ?? ''} className="max-h-full max-w-full object-contain" />}
      <button className="icon-btn absolute right-3 top-3 !bg-black/60 !text-white" onClick={close} aria-label="Cerrar pantalla completa" title="Cerrar (Esc)">
        <X size={18} />
      </button>
      {item.title && <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-md bg-black/60 px-3 py-1 text-[13px] text-white/90">{item.title}</div>}
    </div>,
    document.body,
  )
}
