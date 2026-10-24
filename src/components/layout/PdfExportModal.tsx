import { useMemo, useState } from 'react'
import { BookImage, BookOpen, Loader2 } from 'lucide-react'
import { useProject } from '../../stores/projectStore'
import { toast, useUI } from '../../stores/uiStore'
import { useOrderedScenes } from '../../stores/selectors'
import { exportPortfolioPdf } from '../../features/projects/portfolio'
import { BIBLE_SECTIONS, exportProductionBiblePdf, productionBibleModel, type BibleSectionId } from '../../features/projects/productionBible'
import { downloadBlob, safeFilename } from '../../utils'
import { Modal } from '../common/Overlays'

const close = () => useUI.setState({ modal: null })

/** Botón «Portafolio PDF»: el Portafolio de siempre o la Biblia de Producción completa. */
export function PdfExportModal() {
  const project = useProject((s) => s.project)
  const scenes = useOrderedScenes()
  // Secciones con algo adentro (las vacías no salen en el PDF).
  const filled = useMemo(() => (project ? new Set(productionBibleModel(project, scenes).sections) : new Set<BibleSectionId>()), [project, scenes])
  const [off, setOff] = useState<Set<BibleSectionId>>(new Set())
  const [busy, setBusy] = useState<'portfolio' | 'bible' | null>(null)
  if (!project) return null
  const name = safeFilename(project.title)
  const chosen = BIBLE_SECTIONS.map((s) => s.id).filter((id) => filled.has(id) && !off.has(id))

  const run = async (kind: 'portfolio' | 'bible') => {
    setBusy(kind)
    try {
      if (kind === 'portfolio') {
        toast('Armando el portafolio… (unos segundos)', 'info')
        const blob = await exportPortfolioPdf(project, scenes)
        if (await downloadBlob(blob, `${name}-portafolio.pdf`)) toast('Portafolio listo (PDF con storyboard y guion)')
      } else {
        toast('Armando la Biblia de Producción… (unos segundos)', 'info')
        const blob = await exportProductionBiblePdf(project, scenes, chosen)
        if (await downloadBlob(blob, `${name}-biblia-de-produccion.pdf`)) toast('Biblia de Producción lista (PDF)')
      }
      close()
    } catch (e) {
      console.error(e)
      toast(kind === 'portfolio' ? 'No se pudo crear el portafolio' : 'No se pudo crear la Biblia de Producción', 'error')
    } finally {
      setBusy(null)
    }
  }

  const toggle = (id: BibleSectionId) =>
    setOff((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <Modal title="Exportar PDF" onClose={close} width={620}>
      <div className="flex flex-col gap-3">
        <div className="rounded-xl border border-line bg-[#0f1828] p-3.5">
          <div className="mb-1 flex items-center gap-2 font-medium">
            <BookImage size={16} /> Portafolio
          </div>
          <p className="mb-2.5 text-[12px] text-ink-3">Storyboard, guion, diálogos y tomas. Igual que siempre.</p>
          <button className="btn" onClick={() => run('portfolio')} disabled={!!busy} aria-label="Descargar portafolio PDF">
            {busy === 'portfolio' ? <Loader2 size={14} className="animate-spin" /> : <BookImage size={14} />} Descargar Portafolio
          </button>
        </div>
        <div className="rounded-xl border border-line bg-[#0f1828] p-3.5">
          <div className="mb-1 flex items-center gap-2 font-medium">
            <BookOpen size={16} /> Biblia de Producción completa
          </div>
          <p className="mb-2.5 text-[12px] text-ink-3">Todo para filmar: estilo, Canon, planos, prompts, sonido y continuidad. Escoge qué secciones van; las vacías no salen.</p>
          <div className="mb-3 grid grid-cols-2 gap-x-4 gap-y-1">
            {BIBLE_SECTIONS.map((s) => {
              const has = filled.has(s.id)
              return (
                <label key={s.id} className={`flex items-center gap-2 text-[12.5px] ${has ? '' : 'text-ink-3'}`} title={has ? undefined : 'Esta sección está vacía en este proyecto'}>
                  <input type="checkbox" checked={has && !off.has(s.id)} disabled={!has || s.id === 'cover'} onChange={() => toggle(s.id)} />
                  {s.label}
                  {!has && <span className="text-[11px]">(vacía)</span>}
                </label>
              )
            })}
          </div>
          <button className="btn btn-primary" onClick={() => run('bible')} disabled={!!busy} aria-label="Descargar Biblia de Producción PDF">
            {busy === 'bible' ? <Loader2 size={14} className="animate-spin" /> : <BookOpen size={14} />} Descargar Biblia de Producción
          </button>
        </div>
      </div>
    </Modal>
  )
}
