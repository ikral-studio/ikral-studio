import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Clapperboard, FilePlus2, FolderOpen, Loader2, PanelLeftOpen, PanelRightOpen } from 'lucide-react'
import { useProject } from './stores/projectStore'
import { toast, useUI } from './stores/uiStore'
import { TopBar } from './components/layout/TopBar'
import { Sidebar } from './components/sidebar/Sidebar'
import { ScenesArea } from './components/scenes/ScenesArea'
import { PrintScript, Screenplay } from './components/screenplay/Screenplay'
import { Preview } from './components/preview/Preview'
import { Timeline } from './components/timeline/Timeline'
import { Splitter } from './components/layout/Splitter'
import { Modals } from './components/layout/Modals'
import { ConfirmDialog, Lightbox, Toasts } from './components/common/Overlays'
import { useShortcuts } from './hooks/useShortcuts'
import { clamp } from './utils'

interface Sizes {
  left: number
  right: number
  timeline: number
}
const DEFAULT_SIZES: Sizes = { left: 240, right: 520, timeline: 312 }

function loadSizes(): Sizes {
  try {
    return { ...DEFAULT_SIZES, ...JSON.parse(localStorage.getItem('ikral-studio:sizes2') ?? '{}') }
  } catch {
    return DEFAULT_SIZES
  }
}

function NoProject() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="flex max-w-sm flex-col items-center gap-3 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-sel to-acc-purple">
          <Clapperboard className="text-white" />
        </div>
        <h1 className="text-[18px] font-semibold">IKRAL Studio</h1>
        <p className="text-ink-2">No hay ningún proyecto abierto.</p>
        <div className="mt-2 flex gap-2">
          <button className="btn btn-primary !h-10" onClick={() => useProject.getState().newProject()}>
            <FilePlus2 size={16} /> Nuevo proyecto
          </button>
          <button className="btn !h-10" onClick={() => useUI.setState({ modal: 'projects' })}>
            <FolderOpen size={16} /> Abrir
          </button>
        </div>
      </div>
    </div>
  )
}

export default function App() {
  const ready = useProject((s) => s.ready)
  const hasProject = useProject((s) => !!s.project)
  const leftCollapsed = useUI((s) => s.leftCollapsed)
  const rightCollapsed = useUI((s) => s.rightCollapsed)
  const [sizes, setSizes] = useState<Sizes>(loadSizes)
  const start = useRef(sizes)

  useEffect(() => {
    useProject
      .getState()
      .init()
      .catch((e) => {
        console.error(e)
        toast('No se pudo abrir el almacenamiento del navegador', 'error')
      })
  }, [])
  useShortcuts()

  const saveSizes = () => {
    try {
      localStorage.setItem('ikral-studio:sizes2', JSON.stringify(sizes))
    } catch {
      /* sin almacenamiento local: no pasa nada */
    }
  }
  useEffect(saveSizes, [sizes])

  if (!ready)
    return (
      <div className="flex h-full items-center justify-center gap-2 text-ink-2">
        <Loader2 className="animate-spin" /> Abriendo IKRAL Studio…
      </div>
    )

  const style = {
    '--left-w': `${sizes.left}px`,
    '--right-w': `${sizes.right}px`,
    '--timeline-h': `${sizes.timeline}px`,
    '--preview-vh': `${clamp(sizes.right * 0.75, 240, 420)}px`,
  } as CSSProperties

  return (
    <>
      {hasProject ? (
        <div className={`studio ${leftCollapsed ? 'left-collapsed' : ''} ${rightCollapsed ? 'right-collapsed' : ''}`} style={style}>
          <TopBar />
          <Sidebar />
          <Splitter
            dir="v"
            className="s1"
            label="Ancho del panel de escenas"
            onStart={() => (start.current = sizes)}
            onDelta={(d) => setSizes((s) => ({ ...s, left: clamp(start.current.left + d, 190, 380) }))}
            onEnd={saveSizes}
          />
          <div className="area-center relative">
            <ScenesArea />
            {(leftCollapsed || rightCollapsed) && (
              <div className="no-print pointer-events-none absolute inset-x-0 top-2 flex justify-between px-1">
                <span>
                  {leftCollapsed && (
                    <button className="icon-btn pointer-events-auto !bg-card" onClick={() => useUI.setState({ leftCollapsed: false })} aria-label="Mostrar escenas" title="Mostrar escenas">
                      <PanelLeftOpen size={16} />
                    </button>
                  )}
                </span>
                <span>
                  {rightCollapsed && (
                    <button className="icon-btn pointer-events-auto !bg-card" onClick={() => useUI.setState({ rightCollapsed: false })} aria-label="Mostrar guion y vista previa" title="Mostrar guion y vista previa">
                      <PanelRightOpen size={16} />
                    </button>
                  )}
                </span>
              </div>
            )}
          </div>
          <Splitter
            dir="v"
            className="s2"
            label="Ancho de la columna derecha"
            onStart={() => (start.current = sizes)}
            onDelta={(d) => setSizes((s) => ({ ...s, right: clamp(start.current.right - d, 340, 820) }))}
            onEnd={saveSizes}
          />
          <aside className="area-right no-print flex flex-col gap-3 overflow-y-auto py-3 pr-3">
            <Screenplay />
            <Preview />
          </aside>
          <Splitter
            dir="h"
            className="split-h"
            label="Alto del timeline"
            onStart={() => (start.current = sizes)}
            onDelta={(d) => setSizes((s) => ({ ...s, timeline: clamp(start.current.timeline - d, 200, 520) }))}
            onEnd={saveSizes}
          />
          <Timeline />
        </div>
      ) : (
        <NoProject />
      )}
      <PrintScript />
      <Modals />
      <ConfirmDialog />
      <Lightbox />
      <Toasts />
    </>
  )
}
