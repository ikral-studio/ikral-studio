import { useEffect, useRef, useState } from 'react'
import {
  BookImage,
  AlertCircle,
  CheckCircle2,
  Clapperboard,
  FileDown,
  FilePlus2,
  FolderOpen,
  HelpCircle,
  Loader2,
  Monitor,
  Pencil,
  Redo2,
  Settings,
  Smartphone,
  Undo2,
  Archive,
  Film,
  BookOpenText,
  Table2,
} from 'lucide-react'
import { useProject } from '../../stores/projectStore'
import { askConfirm, toast, useUI } from '../../stores/uiStore'
import { exportProjectZip } from '../../features/projects/backup'
import { isDesktop } from '../../database/db'
import { exportNleFolder, exportNleZip } from '../../features/projects/nleExport'
import { exportPortfolioPdf } from '../../features/projects/portfolio'
import { masterScriptMarkdown, orderedScenes } from '../../features/script-sync/derive'
import { downloadBlob, downloadText, safeFilename } from '../../utils'

function SaveIndicator() {
  const state = useProject((s) => s.saveState)
  const err = useProject((s) => s.saveError)
  if (state === 'saving')
    return (
      <span className="flex items-center gap-1.5 text-ink-2" role="status">
        <Loader2 size={15} className="animate-spin" /> Guardando…
      </span>
    )
  if (state === 'error')
    return (
      <span className="flex items-center gap-1.5 text-bad" role="status" title={err}>
        <AlertCircle size={15} /> Error al guardar
      </span>
    )
  if (state === 'saved')
    return (
      <span className="flex items-center gap-1.5 text-ink-2" role="status" title="Guardado en este navegador (no en la nube)">
        <CheckCircle2 size={15} className="text-ok" /> Guardado
      </span>
    )
  return null
}

function ProjectTitle() {
  const title = useProject((s) => s.project?.title ?? '')
  const rename = useProject((s) => s.renameProject)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(title)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (editing) ref.current?.select()
  }, [editing])
  const finish = () => {
    const v = draft.trim()
    if (v && v !== title) rename(v)
    setEditing(false)
  }
  if (editing)
    return (
      <input
        ref={ref}
        className="field !h-9 !w-[min(420px,32vw)] !py-1 text-[16px] font-semibold"
        value={draft}
        aria-label="Nombre del proyecto"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={finish}
        onKeyDown={(e) => {
          if (e.key === 'Enter') finish()
          if (e.key === 'Escape') {
            setDraft(title)
            setEditing(false)
          }
        }}
      />
    )
  return (
    <button
      className="group flex min-w-0 items-center gap-2 rounded-lg px-2 py-1 text-left hover:bg-white/5"
      onClick={() => {
        setDraft(title)
        setEditing(true)
      }}
      title="Clic para renombrar"
    >
      <span className="truncate text-[17px] font-semibold">{title}</span>
      <Pencil size={14} className="shrink-0 text-ink-3 group-hover:text-ink-2" />
    </button>
  )
}

export function TopBar() {
  const aspect = useProject((s) => s.project?.aspectRatio ?? '16:9')
  const setAspect = useProject((s) => s.setAspect)
  const newProject = useProject((s) => s.newProject)
  const canUndo = useProject((s) => s.past.length > 0)
  const canRedo = useProject((s) => s.future.length > 0)
  const [exporting, setExporting] = useState(false)
  const scriptDock = useUI((s) => s.scriptDock)

  const exportBackup = async () => {
    const { project, scenes, flushSave } = useProject.getState()
    if (!project) return
    setExporting(true)
    try {
      await flushSave()
      const blob = await exportProjectZip(project, orderedScenes(project, scenes))
      if (await downloadBlob(blob, `${safeFilename(project.title)}.ikral.zip`)) toast('Respaldo guardado (.zip con todos los archivos)')
    } catch (e) {
      console.error(e)
      toast('No se pudo crear el respaldo', 'error')
    } finally {
      setExporting(false)
    }
  }

  const exportNle = async () => {
    const { project, scenes, flushSave } = useProject.getState()
    if (!project) return
    setExporting(true)
    try {
      await flushSave()
      if (isDesktop()) {
        const dir = await exportNleFolder(project, orderedScenes(project, scenes))
        if (dir) toast(`Listo: carpeta «${dir.split('/').pop()}». En Final Cut: Archivo > Importar > XML > FinalCut.fcpxml`)
      } else {
        const blob = await exportNleZip(project, orderedScenes(project, scenes))
        if (await downloadBlob(blob, `${safeFilename(project.title)}-para-editor.zip`)) toast('Listo: abre el .zip y lee LEEME.txt')
      }
    } catch (e) {
      console.error(e)
      toast('No se pudo exportar la edición', 'error')
    } finally {
      setExporting(false)
    }
  }

  const exportPortfolio = async () => {
    const { project, scenes } = useProject.getState()
    if (!project) return
    setExporting(true)
    try {
      toast('Armando el portafolio… (unos segundos)', 'info')
      const blob = await exportPortfolioPdf(project, orderedScenes(project, scenes))
      if (await downloadBlob(blob, `${safeFilename(project.title)}-portafolio.pdf`)) toast('Portafolio listo (PDF con storyboard y guion)')
    } catch (e) {
      console.error(e)
      toast('No se pudo crear el portafolio', 'error')
    } finally {
      setExporting(false)
    }
  }

  const exportScript = async () => {
    const { project, scenes } = useProject.getState()
    if (!project) return
    if (await downloadText(masterScriptMarkdown(project, orderedScenes(project, scenes)), `${safeFilename(project.title)}-guion.md`, 'text/markdown'))
      toast('Guion exportado (Markdown)')
  }

  const createNew = async () => {
    const ok = await askConfirm({
      title: 'Nuevo proyecto',
      body: 'Se crea un proyecto vacío. El actual queda guardado y lo puedes abrir desde «Abrir».',
      confirmLabel: 'Crear proyecto',
    })
    if (ok) {
      await newProject()
      toast('Proyecto nuevo creado')
    }
  }

  const seg = (active: boolean) =>
    `btn !h-9 ${active ? '!border-sel !bg-sel/15 !text-white' : '!bg-transparent text-ink-2'}`

  return (
    <header className="area-top no-print flex items-center gap-3 border-b border-line bg-bg px-4">
      <div className="flex shrink-0 items-center gap-2.5 pr-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-sel to-acc-purple">
          <Clapperboard size={19} className="text-white" />
        </div>
        <span className={`hidden text-[14px] font-semibold tracking-tight text-ink-2 ${scriptDock ? "" : "xl:inline"}`}>IKRAL Studio</span>
      </div>
      <div className="h-6 w-px shrink-0 bg-line" />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-4">
          <ProjectTitle />
          <div className="shrink-0 text-[12.5px]">
            <SaveIndicator />
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <button className="icon-btn" onClick={() => useProject.getState().undo()} disabled={!canUndo} title="Deshacer (⌘Z)" aria-label="Deshacer">
          <Undo2 size={17} />
        </button>
        <button className="icon-btn" onClick={() => useProject.getState().redo()} disabled={!canRedo} title="Rehacer (⇧⌘Z)" aria-label="Rehacer">
          <Redo2 size={17} />
        </button>
      </div>

      <div className="flex shrink-0 items-center gap-1.5" role="group" aria-label="Formato">
        <button className={seg(aspect === '16:9')} onClick={() => setAspect('16:9')} aria-pressed={aspect === '16:9'}>
          <Monitor size={16} /> <span className={scriptDock ? 'hidden' : 'hidden lg:inline'}>Horizontal</span> 16:9
        </button>
        <button className={seg(aspect === '9:16')} onClick={() => setAspect('9:16')} aria-pressed={aspect === '9:16'}>
          <Smartphone size={16} /> <span className={scriptDock ? 'hidden' : 'hidden lg:inline'}>Vertical</span> 9:16
        </button>
      </div>

      <div className="h-6 w-px shrink-0 bg-line" />

      <div className="flex shrink-0 items-center gap-1">
        <button className="icon-btn" onClick={createNew} title="Nuevo proyecto" aria-label="Nuevo proyecto">
          <FilePlus2 size={17} />
        </button>
        <button className="icon-btn" onClick={() => useUI.setState({ modal: 'projects' })} title="Abrir proyecto" aria-label="Abrir proyecto">
          <FolderOpen size={17} />
        </button>
        <button
          className={`icon-btn ${scriptDock ? '!bg-sel/20 !text-white' : ''}`}
          onClick={() => useUI.setState({ scriptDock: !scriptDock })}
          aria-pressed={scriptDock}
          title="Guion en columna alta (para leer)"
          aria-label="Guion en panel lateral"
        >
          <BookOpenText size={17} />
        </button>
        <button className="icon-btn" onClick={() => useUI.setState({ modal: 'shotlist' })} title="Lista de tomas" aria-label="Lista de tomas">
          <Table2 size={17} />
        </button>
        <button className="icon-btn" onClick={exportNle} disabled={exporting} title="Exportar edición para Premiere, Final Cut o DaVinci" aria-label="Exportar edición para editor de video">
          <Film size={17} />
        </button>
        <button className="icon-btn" onClick={exportPortfolio} disabled={exporting} title="Portafolio PDF: storyboard, guion, diálogos y tomas" aria-label="Exportar portafolio PDF">
          <BookImage size={17} />
        </button>
        <button className="icon-btn" onClick={exportScript} title="Exportar guion (Markdown)" aria-label="Exportar guion">
          <FileDown size={17} />
        </button>
        <button className="icon-btn" onClick={() => useUI.setState({ modal: 'help' })} title="Ayuda y atajos" aria-label="Ayuda">
          <HelpCircle size={17} />
        </button>
        <button className="icon-btn" onClick={() => useUI.setState({ modal: 'settings' })} title="Configuración" aria-label="Configuración">
          <Settings size={17} />
        </button>
      </div>
      <button className="btn btn-primary !h-9 shrink-0" onClick={exportBackup} disabled={exporting} title="Descarga un .zip con el proyecto y todos sus archivos" aria-label="Exportar proyecto">
        {exporting ? <Loader2 size={16} className="animate-spin" /> : <Archive size={16} />}
        <span className={scriptDock ? 'hidden' : ''}>Exportar proyecto</span>
      </button>
    </header>
  )
}
