import { useState } from 'react'
import { Clapperboard, Loader2, Plus, Undo2 } from 'lucide-react'
import { useProject } from '../../stores/projectStore'
import { toast } from '../../stores/uiStore'
import { hasCoverage, sceneDuration, shotsOf } from '../../features/coverage/shots'
import { GptCoverageToggle } from '../gpt/GptCoveragePanel'
import { ShotCard } from './ShotCard'

const round1 = (n: number) => Math.round(n * 10) / 10

/**
 * Cobertura de escena (Preproducción): los planos de la escena.
 * Una escena sin planos es un solo plano; «Pasar a cobertura» la convierte solo si tú lo tocas.
 */
export function CoveragePanel({ sceneId }: { sceneId: string }) {
  const scene = useProject((s) => s.scenes[sceneId])
  const projectAt = useProject((s) => s.project?.updatedAt)
  const [busy, setBusy] = useState(false)
  /** Justo después de convertir (y mientras no haya otro cambio) se ofrece Deshacer aquí mismo. */
  const [convertedAt, setConvertedAt] = useState<string>()
  const justConverted = !!convertedAt && convertedAt === projectAt
  if (!scene) return null
  const covered = hasCoverage(scene)
  const shots = shotsOf(scene)

  const convert = async () => {
    setBusy(true)
    const ok = await useProject.getState().convertToCoverage(sceneId)
    setBusy(false)
    if (ok) {
      setConvertedAt(useProject.getState().project?.updatedAt)
      toast('Listo: la escena ya tiene su Plano 1 (se hizo un respaldo antes)')
    }
  }

  return (
    <section className="flex flex-col gap-2" aria-label="Cobertura de escena">
      <div className="flex items-center gap-2 text-[14px] font-semibold">
        <Clapperboard size={15} className="text-ink-3" /> Cobertura de escena
        {covered && (
          <span className="ml-auto text-[12.5px] font-normal text-ink-3">
            {shots.length} plano{shots.length === 1 ? '' : 's'} · {round1(sceneDuration(scene))} s
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <GptCoverageToggle sceneId={sceneId} />
      </div>

      {!covered ? (
        <div className="flex flex-col gap-2 rounded-[10px] border border-dashed border-line p-2.5">
          <p className="text-[13px] text-ink-3">Esta escena es un solo plano. Si quieres varios (general, detalle, inserto…), pásala a cobertura. Ninguna imagen ni video se mueve.</p>
          <button className="btn !h-9 !justify-center" onClick={() => void convert()} disabled={busy}>
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Clapperboard size={15} />} Pasar a cobertura
          </button>
        </div>
      ) : (
        <>
          {justConverted && (
            <div className="flex items-center gap-2 rounded-[10px] border border-line bg-bg/40 p-2 text-[13px] text-ink-2">
              <span className="flex-1">Se copió todo al Plano 1. ¿Te arrepentiste?</span>
              <button
                className="btn btn-sm"
                onClick={() => {
                  useProject.getState().undo()
                  setConvertedAt(undefined)
                  toast('Deshecho: la escena quedó como antes')
                }}
              >
                <Undo2 size={13} /> Deshacer
              </button>
            </div>
          )}
          <ul className="flex flex-col gap-1.5" aria-label="Planos de la escena">
            {shots.map((sh, i) => (
              <ShotCard key={sh.id} sceneId={sceneId} shot={sh} n={i + 1} count={shots.length} />
            ))}
          </ul>
          <button
            className="btn !h-9 !justify-center"
            onClick={() => useProject.getState().addShot(sceneId)}
          >
            <Plus size={15} /> Agregar plano
          </button>
          {shots.length === 1 && <p className="text-[12.5px] text-ink-3">Si quitas el último plano, la escena vuelve a ser un solo plano con sus datos de siempre.</p>}
        </>
      )}
    </section>
  )
}
