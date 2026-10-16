import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ChevronDown, ChevronUp, ClipboardCopy, FileText, Search, MoreHorizontal, Printer, FileCode2, Sparkles, PanelRightClose, PanelRightOpen, Table2, X } from 'lucide-react'
import { useProject } from '../../stores/projectStore'
import { toast, useUI } from '../../stores/uiStore'
import { useOrderedScenes } from '../../stores/selectors'
import { allPromptsText, effectiveDuration, extraEntries, masterScriptMarkdown, masterScriptText } from '../../features/script-sync/derive'
import { cameraSpanish } from '../../features/camera/camera'
import { selectScene } from '../../features/scene-management/actions'
import { usePlayback } from '../../features/playback/engine'
import { findRanges } from '../../features/script-search/find'
import { copyToClipboard, downloadText, formatDuration, pad2, safeFilename } from '../../utils'
import type { Scene } from '../../types'

const PARTS: [keyof Scene['script'], string][] = [
  ['action', 'Acción'],
  ['dialogue', 'Diálogo'],
  ['cameraDirection', 'Dirección'],
  ['soundDirection', 'Sonido'],
]

/** Pinta las coincidencias de la búsqueda. `hits` lleva la cuenta global para numerarlas en orden. */
function Marked({ text, query, hits, current }: { text: string; query: string; hits: { n: number }; current: number }): ReactNode {
  const ranges = query ? findRanges(text, query) : []
  if (!ranges.length) return text
  const out: ReactNode[] = []
  let last = 0
  for (const [a, b] of ranges) {
    if (a > last) out.push(text.slice(last, a))
    const n = hits.n++
    out.push(
      <mark key={a} data-hit={n} className={`rounded-sm px-px text-black ${n === current ? 'bg-[#fbbf24] ring-2 ring-[#f59e0b]' : 'bg-[#fde68a]/80'}`}>
        {text.slice(a, b)}
      </mark>,
    )
    last = b
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

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
          <button role="menuitem" className={item} onClick={run(() => { const d = data(); void downloadText(masterScriptText(d.project, d.ordered), `${d.name}-guion.txt`).then((ok) => ok && toast('Guion exportado (TXT)')) })}>
            <FileText size={15} /> Exportar TXT
          </button>
          <button role="menuitem" className={item} onClick={run(() => { const d = data(); void downloadText(masterScriptMarkdown(d.project, d.ordered), `${d.name}-guion.md`, 'text/markdown').then((ok) => ok && toast('Guion exportado (Markdown)')) })}>
            <FileCode2 size={15} /> Exportar Markdown
          </button>
          <button role="menuitem" className={item} onClick={run(() => window.print())}>
            <Printer size={15} /> Imprimir / Guardar PDF
          </button>
          <button role="menuitem" className={item} onClick={run(() => useUI.setState({ modal: 'shotlist' }))}>
            <Table2 size={15} /> Lista de tomas
          </button>
          <div className="my-1 h-px bg-line" />
          <button role="menuitem" className={item} onClick={run(() => { const d = data(); void downloadText(allPromptsText(d.project, d.ordered), `${d.name}-prompts.txt`).then((ok) => ok && toast('Prompts exportados')) })}>
            <Sparkles size={15} /> Exportar prompts (todas)
          </button>
        </div>
      )}
    </div>
  )
}

export function Screenplay({ docked = false }: { docked?: boolean }) {
  const scenes = useOrderedScenes()
  const selected = useProject((s) => s.selectedSceneId)
  const playingIndex = usePlayback((s) => (s.playing ? s.index : -1))
  const fields = useProject((s) => s.project?.customFields)
  const listRef = useRef<HTMLDivElement>(null)
  const [searching, setSearching] = useState(false)
  const [query, setQuery] = useState('')
  const [current, setCurrent] = useState(0)
  const searchRef = useRef<HTMLInputElement>(null)
  const q = searching ? query.trim() : ''
  const searchingRef = useRef(false)
  searchingRef.current = !!q

  // Textos de cada escena en el mismo orden en que se pintan (para contar y para saber de qué escena es cada coincidencia).
  const hitScenes = useMemo(() => {
    if (!q) return [] as string[]
    const out: string[] = []
    scenes.forEach((s, i) => {
      const cam = cameraSpanish(s.script.camera)
      const texts = [
        `Escena ${pad2(i + 1)} · ${s.title}`,
        ...PARTS.filter(([k]) => String(s.script[k] ?? '').trim()).map(([k]) => String(s.script[k])),
        ...(cam ? [cam] : []),
        ...extraEntries(s, fields).map(([, v]) => v),
      ]
      for (const t of texts) for (let n = findRanges(t, q).length; n > 0; n--) out.push(s.id)
    })
    return out
  }, [q, scenes, fields])
  const total = hitScenes.length

  useEffect(() => setCurrent(0), [q])
  useEffect(() => {
    if (searching) searchRef.current?.focus()
  }, [searching])
  // Brincar a la coincidencia actual: llevarla a la vista y seleccionar su escena.
  useEffect(() => {
    if (!total) return
    const i = Math.min(current, total - 1)
    listRef.current?.querySelector<HTMLElement>(`[data-hit="${i}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    if (hitScenes[i] && hitScenes[i] !== useProject.getState().selectedSceneId) selectScene(hitScenes[i])
  }, [current, total, hitScenes])
  const step = (d: number) => total && setCurrent((c) => (c + d + total) % total)
  const closeSearch = () => {
    setSearching(false)
    setQuery('')
  }
  const hits = { n: 0 }

  // Al seleccionar una escena, llevar su sección a la vista dentro del guion (salvo mientras se busca).
  useEffect(() => {
    if (!selected || searchingRef.current) return
    const el = listRef.current?.querySelector<HTMLElement>(`[data-script-id="${selected}"]`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [selected])

  const copyAll = async () => {
    const project = useProject.getState().project
    if (project && (await copyToClipboard(masterScriptText(project, scenes)))) toast('Guion completo copiado')
  }

  return (
    <section
      className={docked ? 'flex h-full min-h-0 flex-col border-l border-line bg-panel' : 'panel flex min-h-[150px] flex-1 flex-col'}
      aria-label={docked ? 'Guion completo en panel' : 'Guion completo'}
    >
      <div className="flex items-center gap-2 border-b border-line px-3.5 py-2.5">
        <FileText size={17} className="text-ink-2" />
        <h2 className="flex-1 text-[13px] font-semibold tracking-wide">GUION COMPLETO</h2>
        <button className={`icon-btn ${searching ? '!text-sel-2' : ''}`} onClick={() => (searching ? closeSearch() : setSearching(true))} title="Buscar en el guion" aria-label="Buscar en el guion" aria-pressed={searching}>
          <Search size={16} />
        </button>
        <button className="btn btn-sm" onClick={copyAll}>
          <ClipboardCopy size={13} /> Copiar guion completo
        </button>
        <ExportMenu />
        {docked ? (
          <button className="icon-btn" onClick={() => useUI.setState({ scriptDock: false })} title="Cerrar panel del guion" aria-label="Cerrar panel del guion">
            <X size={17} />
          </button>
        ) : (
          <>
            <button className="icon-btn" onClick={() => useUI.setState({ scriptDock: true })} title="Abrir el guion en una columna alta" aria-label="Abrir guion en panel lateral">
              <PanelRightOpen size={16} />
            </button>
            <button className="icon-btn" onClick={() => useUI.setState({ rightCollapsed: true })} title="Ocultar columna" aria-label="Ocultar columna derecha">
              <PanelRightClose size={16} />
            </button>
          </>
        )}
      </div>
      {searching && (
        <div className="flex items-center gap-1.5 border-b border-line px-3 py-2">
          <Search size={14} className="shrink-0 text-ink-3" />
          <input
            ref={searchRef}
            className="field min-w-0 flex-1 !py-1.5"
            placeholder="Busca una palabra o parte de un diálogo"
            aria-label="Texto a buscar en el guion"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                step(e.shiftKey ? -1 : 1)
              } else if (e.key === 'Escape') closeSearch()
            }}
          />
          <span className="w-[62px] shrink-0 text-center text-[11.5px] tabular-nums text-ink-2" aria-live="polite">
            {q ? (total ? `${Math.min(current, total - 1) + 1} de ${total}` : 'Sin resultados') : ''}
          </span>
          <button className="icon-btn sm" onClick={() => step(-1)} disabled={!total} aria-label="Coincidencia anterior" title="Anterior (Shift + Enter)">
            <ChevronUp size={15} />
          </button>
          <button className="icon-btn sm" onClick={() => step(1)} disabled={!total} aria-label="Coincidencia siguiente" title="Siguiente (Enter)">
            <ChevronDown size={15} />
          </button>
          <button className="icon-btn sm" onClick={closeSearch} aria-label="Cerrar búsqueda" title="Cerrar (Esc)">
            <X size={15} />
          </button>
        </div>
      )}
      <div ref={listRef} className={`min-h-0 flex-1 overflow-y-auto ${docked ? 'px-6 py-5 [&_article]:mb-3 [&_button]:text-[15px] [&_p]:text-[14px] [&_p]:leading-[1.7]' : 'px-4 py-3'}`}>
        {scenes.length === 0 && <p className="text-[12.5px] text-ink-3">El guion aparece aquí en cuanto agregues escenas.</p>}
        {scenes.map((s, i) => {
          const parts = PARTS.filter(([k]) => String(s.script[k] ?? '').trim())
          const cam = cameraSpanish(s.script.camera)
          const extras: [string, string][] = [...(cam ? ([['Cámara', cam]] as [string, string][]) : []), ...extraEntries(s, fields)]
          const active = s.id === selected
          return (
            <article
              key={s.id}
              data-script-id={s.id}
              className={`-mx-2 mb-1 rounded-lg px-2 py-2 transition-colors ${active ? 'bg-sel/10' : ''} ${playingIndex === i ? 'ring-1 ring-sel/60' : ''}`}
            >
              <button className="text-left text-[13px] font-semibold hover:text-sel-2" onClick={() => selectScene(s.id, { seek: true })}>
                <Marked text={`Escena ${pad2(i + 1)} · ${s.title}`} query={q} hits={hits} current={current} /> <span className="font-normal text-ink-3">({formatDuration(effectiveDuration(s))})</span>
              </button>
              {parts.length === 0 && extras.length === 0 ? (
                <p className="mt-0.5 text-[12px] italic text-ink-3">Sin guion todavía.</p>
              ) : (
                <>
                  {parts.map(([k, label]) => (
                    <p key={k} className="mt-0.5 whitespace-pre-wrap text-[12.5px] leading-relaxed text-ink-2">
                      <span className="font-medium text-ink">{label}:</span> <Marked text={String(s.script[k])} query={q} hits={hits} current={current} />
                    </p>
                  ))}
                  {extras.map(([name, v]) => (
                    <p key={name} className="mt-0.5 whitespace-pre-wrap text-[12.5px] leading-relaxed text-ink-2">
                      <span className="font-medium text-ink">{name}:</span> <Marked text={v} query={q} hits={hits} current={current} />
                    </p>
                  ))}
                </>
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
          {[...(cameraSpanish(s.script.camera) ? ([['Cámara', cameraSpanish(s.script.camera)]] as [string, string][]) : []), ...extraEntries(s, project.customFields)].map(([name, v]) => (
            <p key={name}>
              <b>{name}:</b> {v}
            </p>
          ))}
        </section>
      ))}
    </div>
  )
}
