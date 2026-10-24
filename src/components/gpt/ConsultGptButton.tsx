// Botón «Revisar con GPT». En la web no hay Codex: el botón avisa que está en la app de Mac.
import { Loader2, Sparkles } from 'lucide-react'
import { isDesktop } from '../../database/db'

export function ConsultGptButton({ busy, onClick }: { busy: boolean; onClick: () => void }) {
  if (!isDesktop()) {
    return (
      <div className="flex flex-col gap-1">
        <button className="btn !h-10 !justify-center" disabled aria-describedby="gpt-solo-mac">
          <Sparkles size={16} /> Revisar con GPT
        </button>
        <p id="gpt-solo-mac" className="text-[13px] text-ink-3">
          Disponible en la app de Mac.
        </p>
      </div>
    )
  }
  return (
    <button className="btn !h-10 !justify-center" onClick={onClick} disabled={busy} aria-busy={busy}>
      {busy ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />} {busy ? 'GPT está revisando…' : 'Revisar con GPT'}
    </button>
  )
}
