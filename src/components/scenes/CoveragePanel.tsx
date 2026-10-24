import { useState } from 'react'
import { ChevronDown, ChevronRight, Loader2, Plus, Scissors, Undo2 } from 'lucide-react'
import { useProject } from '../../stores/projectStore'
import { toast } from '../../stores/uiStore'
import { hasCoverage, sceneDuration, shotsOf } from '../../features/coverage/shots'
import { GptCoverageToggle } from '../gpt/GptCoveragePanel'
import { ShotCard } from './ShotCard'

const round1 = (n: number) => Math.round(n * 10) / 10

/** «3 tomas · 10 s»: el contador que se ve sin abrir nada. */
export const takesLabel = (n: number, secs: number) => `${n} toma${n === 1 ? '' : 's'} · ${round1(secs)} s`

/**
 * «🎬 Planos de cámara» (por dentro: la cobertura de la escena). Una escena sin planos es una sola toma;
 * «Dividir escena en tomas» la convierte solo si tú lo tocas (respaldo antes y Deshacer).
 * `collapsible` (Edición): con tomas, la lista se abre con «Ver/editar tomas» para no alargar la tarjeta.
 */
export function CoveragePanel({ sceneId, collapsible = false }: { sceneId: string; collapsible?: boolean }) {
  const scene = useProject((s) => s.scenes[sceneId])
  const projectAt = useProject((s) => s.project?.updatedAt)
  const [busy, setBusy] = useState(false)
  const [listOpen, setListOpen] = useState(!collapsible)
  /** Justo después de convertir (y mientras no haya otro cambio) se ofrece Deshacer aquí mismo. */
  const [convertedAt, setConvertedAt] = useState<string>()
  const justConverted = !!convertedAt && convertedAt === projectAt
  if (!scene) return null
  const covered = hasCoverage(scene)
  const shots = shotsOf(scene)
  const showList = listOpen || justConverted

  const convert = async () => {
    setBusy(true)
    const ok = await useProject.getState().convertToCoverage(sceneId)
    setBusy(false)
    if (ok) {
      setConvertedAt(useProject.getState().project?.updatedAt)
      setListOpen(true)
      toast('Listo: la escena ya está dividida en tomas (se hizo un respaldo antes)')
    }
  }

  return (
    <section className="flex flex-col gap-2 rounded-[10px] border border-sel/50 bg-sel/[0.07] p-2.5" aria-label="Planos de cámara">
      <div className="flex items-center gap-2 text-[14px] font-semibold">
        <span aria-hidden>🎬</span> Planos de cámara
        {covered && <span className="ml-auto text-[12.5px] font-normal text-ink-2 tabular-nums">{takesLabel(shots.length, sceneDuration(scene))}</span>}
      </div>
      <p className="text-[12.5px] text-ink-2">Divide esta escena en varias tomas (general, detalle, reacción).</p>

      {!covered ? (
        <>
          <button className="btn btn-primary !h-10 !justify-center !text-[13.5px]" onClick={() => void convert()} disabled={busy}>
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Scissors size={16} />} Dividir escena en tomas
          </button>
          <p className="text-[12px] text-ink-3">Ahora es una sola toma. Ninguna imagen ni video se mueve y puedes deshacer.</p>
        </>
      ) : (
        <>
          {justConverted && (
            <div className="flex items-center gap-2 rounded-[10px] border border-line bg-bg/40 p-2 text-[13px] text-ink-2">
              <span className="flex-1">Se copió todo a la primera toma. ¿Te arrepentiste?</span>
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
          <div className="flex flex-wrap gap-1.5">
            <button
              className="btn btn-primary !h-9 flex-1 !justify-center"
              onClick={() => {
                useProject.getState().addShot(sceneId)
                setListOpen(true)
              }}
            >
              <Plus size={15} /> Agregar toma
            </button>
            {collapsible && (
              <button className="btn !h-9 flex-1 !justify-center" onClick={() => setListOpen(!showList)} aria-expanded={showList}>
                {showList ? <ChevronDown size={15} /> : <ChevronRight size={15} />} Ver/editar tomas
              </button>
            )}
          </div>
          {showList && (
            <>
              <ul className="flex flex-col gap-1.5" aria-label="Planos de la escena">
                {shots.map((sh, i) => (
                  <ShotCard key={sh.id} sceneId={sceneId} shot={sh} n={i + 1} count={shots.length} />
                ))}
              </ul>
              {shots.length === 1 && <p className="text-[12.5px] text-ink-3">Si quitas la última toma, la escena vuelve a ser una sola toma con sus datos de siempre.</p>}
            </>
          )}
        </>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        {/* Nombre propio: en Edición la tarjeta ya tiene el «Consultar GPT» del guion. */}
        <GptCoverageToggle sceneId={sceneId} label="Pedir tomas a GPT" />
      </div>
    </section>
  )
}
