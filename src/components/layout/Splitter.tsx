import { useState } from 'react'

/** Separador arrastrable. onDelta recibe el desplazamiento en px desde que empezó el arrastre. */
export function Splitter({
  dir,
  className = '',
  label,
  onStart,
  onDelta,
  onEnd,
}: {
  dir: 'v' | 'h'
  className?: string
  label: string
  onStart: () => void
  onDelta: (d: number) => void
  onEnd: () => void
}) {
  const [dragging, setDragging] = useState(false)
  return (
    <div
      role="separator"
      aria-orientation={dir === 'v' ? 'vertical' : 'horizontal'}
      aria-label={label}
      tabIndex={0}
      className={`splitter no-print ${dir === 'v' ? 'splitter-v' : 'splitter-h'} ${dragging ? 'dragging' : ''} ${className}`}
      onPointerDown={(e) => {
        e.preventDefault()
        const origin = dir === 'v' ? e.clientX : e.clientY
        ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
        setDragging(true)
        onStart()
        const move = (ev: PointerEvent) => onDelta((dir === 'v' ? ev.clientX : ev.clientY) - origin)
        const up = () => {
          setDragging(false)
          window.removeEventListener('pointermove', move)
          window.removeEventListener('pointerup', up)
          onEnd()
        }
        window.addEventListener('pointermove', move)
        window.addEventListener('pointerup', up)
      }}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 40 : 10
        const keys = dir === 'v' ? ['ArrowLeft', 'ArrowRight'] : ['ArrowUp', 'ArrowDown']
        if (!keys.includes(e.key)) return
        e.preventDefault()
        onStart()
        onDelta(e.key === keys[0] ? -step : step)
        onEnd()
      }}
    />
  )
}
