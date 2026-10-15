import { Fragment } from 'react'
import { Clapperboard, Plus } from 'lucide-react'
import { useProject } from '../../stores/projectStore'
import { addSceneAndFocus } from '../../features/scene-management/actions'
import { SceneCard } from './SceneCard'
import { ProjectStylePanel } from './ProjectStylePanel'
import { EMPTY_IDS } from '../../stores/selectors'

export function ScenesArea() {
  const sceneIds = useProject((s) => s.project?.sceneIds ?? EMPTY_IDS)
  return (
    <main className="no-print h-full overflow-y-auto py-3" aria-label="Tarjetas de escenas">
      <ProjectStylePanel />
      {sceneIds.length === 0 ? (
        <div className="mx-auto mt-16 flex max-w-sm flex-col items-center gap-3 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-card">
            <Clapperboard className="text-ink-2" />
          </div>
          <h2 className="text-[16px] font-semibold">Tu proyecto está vacío</h2>
          <p className="text-[13px] leading-relaxed text-ink-2">
            Agrega la primera escena. Luego pon su imagen inicial, su imagen final, el guion y el video generado.
          </p>
          <button className="btn btn-primary !h-10 mt-1" onClick={() => addSceneAndFocus()}>
            <Plus size={17} /> Agregar escena
          </button>
        </div>
      ) : (
        <div className="flex flex-col">
          {sceneIds.map((id, i) => (
            <Fragment key={id}>
              {i > 0 && <InsertGap index={i} />}
              <SceneCard id={id} n={i + 1} />
            </Fragment>
          ))}
          <button className="dropzone mt-3 flex h-12 items-center justify-center gap-2 text-[13px] text-ink-3 hover:text-ink-2" onClick={() => addSceneAndFocus()}>
            <Plus size={16} /> Agregar escena
          </button>
        </div>
      )}
    </main>
  )
}

/** Línea entre dos tarjetas: al pasar el ratón aparece «+ Insertar escena aquí». */
function InsertGap({ index }: { index: number }) {
  return (
    <div className="group relative flex h-3 items-center justify-center">
      <div className="absolute inset-x-6 top-1/2 h-px bg-sel-2 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100" />
      <button
        className="chip relative z-10 !h-6 border border-sel-2 bg-bg !px-2.5 text-[11.5px] text-[#bfdbfe] opacity-0 transition-opacity hover:bg-sel hover:text-white focus-visible:opacity-100 group-hover:opacity-100"
        onClick={() => addSceneAndFocus(index)}
        aria-label={`Insertar escena nueva entre la ${index} y la ${index + 1}`}
      >
        <Plus size={12} /> Insertar escena aquí
      </button>
    </div>
  )
}
