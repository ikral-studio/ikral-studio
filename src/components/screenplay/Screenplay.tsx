import { useEffect, useRef, useState } from 'react'
import { ClipboardCopy, FileText, MoreHorizontal, Printer, FileCode2, Sparkles, PanelRightClose } from 'lucide-react'
import { useProject } from '../../stores/projectStore'
import { toast, useUI } from '../../stores/uiStore'
import { useOrderedScenes } from '../../stores/selectors'
import { allPromptsText, effectiveDuration, masterScriptMarkdown, masterScriptText } from '../../features/script-sync/derive'
import { selectScene } from '../../features/scene-management/actions'
import { usePlayback } from '../../features/playback/engine'
import { copyToClipboard, downloadText, formatDuration, pad2, safeFilename } from '../../utils'
import type { Scene } from '../../types'

const PARTS: [keyof Scene['script'], string][] = [
  ['action', 'Acción'],
  ['dialogue', 'Diálogo'],
  ['cameraDirection', 'Dirección'],
  ['soundDirection', 'Sonido'],
]

function ExportMenu() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [open])
  const run = (fn: () => void) => () => {
    setOpen(false)
    fn()
  }
  const data = () => {
    const { project, scenes } = useProject.getState()
    const ordered = project ? project.sceneIds.map((id) => scenes[id]).filter(Boolean) : []
    return { project: project!, ordered, name: safeFilename(project?.title ?? 'guion') }
  }
  const item = 'flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[12.5px] hover:bg-white/5'
  return (
    <div className="relative" ref={ref}>
      <button className="icon-btn" onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open} aria-label="Más exportaciones" title="Exportar">
        <MoreHorizontal size={17} />
      </button>
      {open && (
        <div role="menu" className="panel absolute right-0 top-9 z-30 w-56 p-1 shadow-xl shadow-black/50">
          <button role="menuitem" className={item} onClick={run(() => { const d = data(); downloadText(masterScriptText(d.project, d.ordered), `${d.name}-guion.txt`); toast('Guion exportado (TXT)') })}>
            <FileText size={15} /> Exportar TXT
          </button>
          <button role="menuitem" className={item} onClick={run(() => { const d = data(); downloadText(masterScriptMarkdown(d.project, d.ordered), `${d.name}-guion.md`, 'text/markdown'); toast('Guion exportado (Markdown)') })}>
            <FileCode2 size={15} /> Exportar Markdown
          </button>
          <button role="menuitem" className={item} onClick={run(() => window.print())}>
            <Printer size={15} /> Imprimir / Guardar PDF
          </button>
          <div className="my-1 h-px bg-line" />
          <button role="menuitem" className={item} onClick={run(() => { const d = data(); downloadText(allPromptsText(d.project, d.ordered), `${d.name}-prompts.txt`); toast('Prompts exportados') })}>
            <Sparkles size={15} /> Exportar prompts (todas)
          </button>
        </div>
      )}
    </div>
  )
}

export function Screenplay() {
  const scenes = useOrderedScenes()
  const selected = useProject((s) => s.selectedSceneId)
  const playingIndex = usePlayback((s) => (s.playing ? s.index : -1))
  const listRef = useRef<HTMLDivElement>(null)

  // Al seleccionar una escena, llevar su sección a la vista dentro del guion.
  useEffect(() => {
    if (!selected) return
    const el = listRef.current?.querySelector<HTMLElement>(`[data-script-id="${selected}"]`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [selected])

  const copyAll = async () => {
    const project = useProject.getState().project
    if (project && (await copyToClipboard(masterScriptText(project, scenes)))) toast('Guion completo copiado')
  }

  return (
    <section className="panel flex min-h-[150px] flex-1 flex-col" aria-label="Guion completo">
      <div className="flex items-center gap-2 border-b border-line px-3.5 py-2.5">
        <FileText size={17} className="text-ink-2" />
        <h2 className="flex-1 text-[13px] font-semibold tracking-wide">GUION COMPLETO</h2>
        <button className="btn btn-sm" onClick={copyAll}>
          <ClipboardCopy size={13} /> Copiar guion completo
        </button>
        <ExportMenu />
        <button className="icon-btn" onClick={() => useUI.setState({ rightCollapsed: true })} title="Ocultar columna" aria-label="Ocultar columna derecha">
          <PanelRightClose size={16} />
        </button>
      </div>
      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {scenes.length === 0 && <p className="text-[12.5px] text-ink-3">El guion aparece aquí en cuanto agregues escenas.</p>}
        {scenes.map((s, i) => {
          const parts = PARTS.filter(([k]) => String(s.script[k] ?? '').trim())
          const active = s.id === selected
          return (
            <article
              key={s.id}
              data-script-id={s.id}
              className={`-mx-2 mb-1 rounded-lg px-2 py-2 transition-colors ${active ? 'bg-sel/10' : ''} ${playingIndex === i ? 'ring-1 ring-sel/60' : ''}`}
            >
              <button className="text-left text-[13px] font-semibold hover:text-sel-2" onClick={() => selectScene(s.id, { seek: true })}>
                Escena {pad2(i + 1)} · {s.title} <span className="font-normal text-ink-3">({formatDuration(effectiveDuration(s))})</span>
              </button>
              {parts.length === 0 ? (
                <p className="mt-0.5 text-[12px] italic text-ink-3">Sin guion todavía.</p>
              ) : (
                parts.map(([k, label]) => (
                  <p key={k} className="mt-0.5 whitespace-pre-wrap text-[12.5px] leading-relaxed text-ink-2">
                    <span className="font-medium text-ink">{label}:</span> {String(s.script[k])}
                  </p>
                ))
              )}
            </article>
          )
        })}
      </div>
    </section>
  )
}

/** Versión limpia para imprimir o guardar como PDF. */
export function PrintScript() {
  const scenes = useOrderedScenes()
  const project = useProject((s) => s.project)
  if (!project) return null
  return (
    <div className="print-only">
      <h1>{project.title}</h1>
      <div className="meta">
        Guion completo · {scenes.length} escenas · {formatDuration(scenes.reduce((a, s) => a + effectiveDuration(s), 0))}
      </div>
      {scenes.map((s, i) => (
        <section key={s.id}>
          <h2>
            Escena {pad2(i + 1)} · {s.title} ({formatDuration(effectiveDuration(s))})
          </h2>
          {PARTS.filter(([k]) => String(s.script[k] ?? '').trim()).map(([k, label]) => (
            <p key={k}>
              <b>{label}:</b> {String(s.script[k])}
            </p>
          ))}
        </section>
      ))}
    </div>
  )
}
