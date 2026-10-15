import { Clapperboard, Plus } from 'lucide-react'
import { useProject } from '../../stores/projectStore'
import { addSceneAndFocus } from '../../features/scene-management/actions'
import { SceneCard } from './SceneCard'
import { EMPTY_IDS } from '../../stores/selectors'

export function ScenesArea() {
  const sceneIds = useProject((s) => s.project?.sceneIds ?? EMPTY_IDS)
  return (
    <main className="no-print h-full overflow-y-auto py-3" aria-label="Tarjetas de escenas">
      {sceneIds.length === 0 ? (
        <div className="mx-auto mt-16 flex max-w-sm flex-col items-center gap-3 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-card">
            <Clapperboard className="text-ink-2" />
          </div>
          <h2 className="text-[16px] font-semibold">Tu proyecto está vacío</h2>
          <p className="text-[13px] leading-relaxed text-ink-2">
            Agrega la primera escena. Luego pon su imagen inicial, su imagen final, el guion y el video generado.
          </p>
          <button className="btn btn-primary !h-10 mt-1" onClick={addSceneAndFocus}>
            <Plus size={17} /> Agregar escena
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {sceneIds.map((id, i) => (
            <SceneCard key={id} id={id} n={i + 1} />
          ))}
          <button className="dropzone flex h-12 items-center justify-center gap-2 text-[13px] text-ink-3 hover:text-ink-2" onClick={addSceneAndFocus}>
            <Plus size={16} /> Agregar escena
          </button>
        </div>
      )}
    </main>
  )
}
