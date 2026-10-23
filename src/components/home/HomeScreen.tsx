import { Clapperboard, FolderOpen, Palette } from 'lucide-react'
import { useProject } from '../../stores/projectStore'
import { useUI } from '../../stores/uiStore'
import { bibleAnswered } from '../../features/bible/bible'

/** Pantalla de inicio: escoger a qué parte del trabajo ir. */
export function HomeScreen() {
  const project = useProject((s) => s.project)
  if (!project) return null
  const count = project.sceneIds.length
  const chars = (project.characters ?? []).filter((c) => c.name.trim()).length
  const card = 'flex flex-col items-start gap-3 rounded-[18px] border border-line bg-panel p-7 text-left transition hover:border-sel hover:bg-card'

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-8 bg-bg p-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-sel to-acc-purple">
          <Clapperboard className="text-white" />
        </div>
        <h1 className="text-[24px] font-semibold">IKRAL Studio</h1>
        <p className="text-[16px] text-ink-2">
          Proyecto: <span className="font-semibold text-ink">{project.title}</span>
        </p>
      </div>

      <div className="grid w-full max-w-[860px] grid-cols-1 gap-4 sm:grid-cols-2">
        <button className={card} onClick={() => useUI.setState({ view: 'bible' })} aria-label="Preproducción">
          <Palette size={34} className="text-[#c4b5fd]" />
          <span className="text-[22px] font-semibold">🎨 Preproducción</span>
          <span className="text-[15px] text-ink-2">Biblia del proyecto: estilo, personajes, locaciones y storyboard.</span>
          <span className="text-[13px] text-ink-3">
            Estilo {bibleAnswered(project)} de 4 · {chars} personaje{chars === 1 ? '' : 's'}
          </span>
        </button>
        <button className={card} onClick={() => useUI.setState({ view: 'studio' })} aria-label="Edición">
          <Clapperboard size={34} className="text-sel-2" />
          <span className="text-[22px] font-semibold">🎬 Edición</span>
          <span className="text-[15px] text-ink-2">El editor: escenas, imágenes, videos, timeline y música.</span>
          <span className="text-[13px] text-ink-3">
            {count} escena{count === 1 ? '' : 's'}
          </span>
        </button>
      </div>

      <button className="btn !h-10" onClick={() => useUI.setState({ modal: 'projects' })}>
        <FolderOpen size={16} /> Cambiar de proyecto
      </button>
    </div>
  )
}
