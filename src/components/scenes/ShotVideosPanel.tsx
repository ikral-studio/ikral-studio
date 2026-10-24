import { useProject } from '../../stores/projectStore'
import { shotsOf } from '../../features/coverage/shots'
import { shotLength, shotVideo } from '../../features/script-sync/derive'
import { formatDuration } from '../../utils'
import { ShotVideo } from './ShotVideo'

/** Edición de una escena con cobertura: un video por plano, en el orden en que se reproducen. */
export function ShotVideosPanel({ sceneId }: { sceneId: string }) {
  const scene = useProject((s) => s.scenes[sceneId])
  if (!scene) return null
  const shots = shotsOf(scene)
  const done = shots.filter((s) => shotVideo(s)).length
  return (
    <div aria-label="Videos por plano">
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
        <span className="text-[13px] font-semibold">Videos por plano</span>
        <span className="text-[11px] tabular-nums text-ink-3">
          {done} de {shots.length} con video · {formatDuration(shots.reduce((a, s) => a + shotLength(s), 0))}
        </span>
      </div>
      <p className="mb-2 text-[11.5px] text-ink-3">Esta escena tiene cobertura: el reproductor y la línea de tiempo tocan los videos plano por plano.</p>
      <ol className="flex flex-col gap-3">
        {shots.map((sh, i) => (
          <li key={sh.id} className="rounded-xl border border-line bg-[#0f1828] p-2.5">
            <div className="mb-1.5 flex items-center gap-2 text-[13px]">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-bg/70 text-[12px] font-semibold tabular-nums text-ink-2">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate font-semibold">{sh.name || 'Plano sin nombre'}</span>
              <span className="shrink-0 text-[11.5px] tabular-nums text-ink-3">{formatDuration(shotLength(sh))}</span>
            </div>
            <ShotVideo sceneId={sceneId} shot={sh} label={`Plano ${i + 1}`} />
          </li>
        ))}
      </ol>
    </div>
  )
}
