import { useEffect, useRef, useState } from 'react'
import { Loader2, Scissors } from 'lucide-react'

interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/** Cuadro más grande con la proporción pedida, centrado en la imagen. */
function initialRect(nw: number, nh: number, ratio: number): Rect {
  let w = nw
  let h = w / ratio
  if (h > nh) {
    h = nh
    w = h * ratio
  }
  return { x: (nw - w) / 2, y: (nh - h) / 2, w, h }
}

/**
 * Recorte tipo Photoshop: cuadro con proporción fija (la del proyecto), cuadrícula de tercios,
 * se mueve arrastrando y se estira desde las esquinas. Devuelve un archivo nuevo; el original no se toca.
 */
export function CropEditor({
  url,
  ratio,
  ratioLabel,
  mimeType,
  onCancel,
  onDone,
}: {
  url: string
  ratio: number
  ratioLabel: string
  mimeType: string
  onCancel: () => void
  onDone: (blob: Blob, width: number, height: number) => Promise<void>
}) {
  const imgRef = useRef<HTMLImageElement>(null)
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null)
  const [rect, setRect] = useState<Rect | null>(null)
  const [busy, setBusy] = useState(false)
  const [, force] = useState(0)

  useEffect(() => {
    const onResize = () => force((n) => n + 1)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const onLoad = () => {
    const img = imgRef.current!
    setNat({ w: img.naturalWidth, h: img.naturalHeight })
    setRect(initialRect(img.naturalWidth, img.naturalHeight, ratio))
  }

  // escala: píxeles de pantalla por píxel de imagen
  const scale = nat && imgRef.current ? imgRef.current.clientWidth / nat.w : 1

  const startDrag = (mode: 'move' | 'nw' | 'ne' | 'sw' | 'se') => (e: React.PointerEvent) => {
    if (!rect || !nat) return
    e.preventDefault()
    e.stopPropagation()
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    const ox = e.clientX
    const oy = e.clientY
    const r0 = rect
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - ox) / scale
      const dy = (ev.clientY - oy) / scale
      if (mode === 'move') {
        setRect({ ...r0, x: Math.min(Math.max(0, r0.x + dx), nat.w - r0.w), y: Math.min(Math.max(0, r0.y + dy), nat.h - r0.h) })
        return
      }
      // Esquina opuesta fija; el ancho manda y el alto sigue la proporción.
      const right = mode === 'ne' || mode === 'se'
      const bottom = mode === 'sw' || mode === 'se'
      const ax = right ? r0.x : r0.x + r0.w
      const ay = bottom ? r0.y : r0.y + r0.h
      let w = Math.max(40, r0.w + (right ? dx : -dx))
      const maxW = right ? nat.w - ax : ax
      const maxH = bottom ? nat.h - ay : ay
      w = Math.min(w, maxW, maxH * ratio)
      const h = w / ratio
      setRect({ x: right ? ax : ax - w, y: bottom ? ay : ay - h, w, h })
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const apply = async () => {
    if (!rect || !imgRef.current) return
    setBusy(true)
    const w = Math.round(rect.w)
    const h = Math.round(rect.h)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    canvas.getContext('2d')!.drawImage(imgRef.current, rect.x, rect.y, rect.w, rect.h, 0, 0, w, h)
    const type = mimeType === 'image/png' ? 'image/png' : 'image/jpeg'
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, type, 0.93))
    if (blob) await onDone(blob, w, h)
    setBusy(false)
  }

  const s = scale
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-center rounded-lg bg-black p-2">
        <div className="relative inline-block select-none">
          <img ref={imgRef} src={url} alt="" onLoad={onLoad} className="block max-h-[66vh] w-auto" draggable={false} />
          {rect && (
            <div
              className="absolute cursor-move touch-none"
              style={{ left: rect.x * s, top: rect.y * s, width: rect.w * s, height: rect.h * s, boxShadow: '0 0 0 9999px rgba(0,0,0,.6)', outline: '2px solid #fff' }}
              onPointerDown={startDrag('move')}
              aria-label="Área de recorte"
            >
              {/* tercios */}
              <div className="pointer-events-none absolute inset-0">
                <div className="absolute inset-y-0 left-1/3 w-px bg-white/50" />
                <div className="absolute inset-y-0 left-2/3 w-px bg-white/50" />
                <div className="absolute inset-x-0 top-1/3 h-px bg-white/50" />
                <div className="absolute inset-x-0 top-2/3 h-px bg-white/50" />
              </div>
              {(['nw', 'ne', 'sw', 'se'] as const).map((c) => (
                <span
                  key={c}
                  onPointerDown={startDrag(c)}
                  className="absolute h-4 w-4 touch-none border-white"
                  style={{
                    [c.includes('n') ? 'top' : 'bottom']: -3,
                    [c.includes('w') ? 'left' : 'right']: -3,
                    borderTopWidth: c.includes('n') ? 4 : 0,
                    borderBottomWidth: c.includes('s') ? 4 : 0,
                    borderLeftWidth: c.includes('w') ? 4 : 0,
                    borderRightWidth: c.includes('e') ? 4 : 0,
                    cursor: c === 'nw' || c === 'se' ? 'nwse-resize' : 'nesw-resize',
                  }}
                  aria-label={`Estirar esquina ${c}`}
                />
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12.5px] text-ink-2">
          Mueve el cuadro y estíralo desde las esquinas.
          {rect && <span className="ml-1 tabular-nums text-ink-3">Resultado: {Math.round(rect.w)}×{Math.round(rect.h)} ({ratioLabel})</span>}
        </span>
        <button className="btn ml-auto" onClick={onCancel} disabled={busy}>
          Cancelar
        </button>
        <button className="btn btn-primary" onClick={apply} disabled={busy || !rect}>
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Scissors size={15} />} Recortar a {ratioLabel}
        </button>
      </div>
      <p className="text-[11.5px] text-ink-3">Se guarda como imagen nueva; la original no se borra (puedes deshacer con ⌘Z).</p>
    </div>
  )
}
