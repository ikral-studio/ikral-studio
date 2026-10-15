import { useEffect, type ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react'
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
      if (e.key === 'Escape') {
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
  if (!item) return null
  const close = () => useUI.setState({ lightbox: null })
  return (
    <Modal title={item.title ?? 'Vista ampliada'} onClose={close} width={1100}>
      <div className="flex items-center justify-center rounded-lg bg-black">
        {url &&
          (item.kind === 'image' ? (
            <img src={url} alt={item.title ?? ''} className="max-h-[72vh] w-auto object-contain" />
          ) : (
            <video src={url} controls autoPlay className="max-h-[72vh] w-auto" />
          ))}
      </div>
    </Modal>
  )
}
