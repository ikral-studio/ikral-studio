// Botón para consultar a GPT. En la web no hay Codex: el botón avisa que está en la app de Mac.
import { useId } from 'react'
import { Loader2, Sparkles } from 'lucide-react'
import { isDesktop } from '../../database/db'

export function ConsultGptButton({
  busy,
  onClick,
  label = 'Revisar con GPT',
  busyLabel = 'GPT está revisando…',
  className = 'btn !h-10 !justify-center',
}: {
  busy: boolean
  onClick: () => void
  label?: string
  busyLabel?: string
  className?: string
}) {
  const hintId = useId()
  if (!isDesktop()) {
    return (
      <div className="flex flex-col gap-1">
        <button className={className} disabled aria-describedby={hintId}>
          <Sparkles size={16} /> {label}
        </button>
        <p id={hintId} className="text-[13px] text-ink-3">
          Disponible en la app de Mac.
        </p>
      </div>
    )
  }
  return (
    <button className={className} onClick={onClick} disabled={busy} aria-busy={busy}>
      {busy ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />} {busy ? busyLabel : label}
    </button>
  )
}
