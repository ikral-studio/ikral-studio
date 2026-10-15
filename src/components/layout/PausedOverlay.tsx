import { MonitorPause } from 'lucide-react'
import { useProject } from '../../stores/projectStore'
import { resumeHere } from '../../features/session/tabGuard'

/** Cubre la app cuando el proyecto se está editando en otra ventana. */
export function PausedOverlay() {
  const paused = useProject((s) => s.paused)
  if (!paused) return null
  return (
    <div className="no-print fixed inset-0 z-[70] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm" role="alertdialog" aria-label="Ventana en pausa">
      <div className="panel flex max-w-md flex-col items-center gap-3 p-6 text-center shadow-2xl">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-warn/15">
          <MonitorPause className="text-warn" />
        </div>
        <h2 className="text-[17px] font-semibold">IKRAL Studio está abierto en otra ventana</h2>
        <p className="text-[13px] leading-relaxed text-ink-2">
          Para no perder cambios, solo una ventana puede editar. Esta quedó en pausa y todo lo que hiciste aquí ya se guardó.
        </p>
        <button className="btn btn-primary !h-10" onClick={() => void resumeHere()}>
          Usar esta ventana
        </button>
        <p className="text-[11.5px] text-ink-3">Al usar esta, la otra ventana se pone en pausa.</p>
      </div>
    </div>
  )
}
