import { ClipboardCopy, FileCode2, FileSpreadsheet } from 'lucide-react'
import { useProject } from '../../stores/projectStore'
import { selectScene } from '../../features/scene-management/actions'
import { toast, useUI } from '../../stores/uiStore'
import { useOrderedScenes } from '../../stores/selectors'
import { SHOT_COLUMNS, shotListCsv, shotListMarkdown, shotListTsv, shotRows } from '../../features/camera/shotList'
import { copyToClipboard, downloadText, safeFilename } from '../../utils'
import { Modal } from '../common/Overlays'

const close = () => useUI.setState({ modal: null })

export function ShotListModal() {
  const scenes = useOrderedScenes()
  const project = useProject((s) => s.project)
  if (!project) return null
  const rows = shotRows(scenes)
  const name = safeFilename(project.title)
  return (
    <Modal
      title={`Lista de tomas · ${project.title}`}
      onClose={close}
      width={1100}
      footer={
        <>
          <button className="btn" onClick={async () => (await copyToClipboard(shotListTsv(scenes))) && toast('Tabla copiada: pégala en Excel o Google Sheets')}>
            <ClipboardCopy size={14} /> Copiar tabla
          </button>
          <button className="btn" onClick={() => downloadText(shotListCsv(scenes), `${name}-lista-de-tomas.csv`, 'text/csv')}>
            <FileSpreadsheet size={14} /> Exportar CSV
          </button>
          <button className="btn" onClick={() => downloadText(shotListMarkdown(project, scenes), `${name}-lista-de-tomas.md`, 'text/markdown')}>
            <FileCode2 size={14} /> Exportar Markdown
          </button>
        </>
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[12.5px]">
          <thead>
            <tr>
              {SHOT_COLUMNS.map((c) => (
                <th key={c} className="border-b border-line-2 px-2 py-1.5 text-left font-semibold whitespace-nowrap text-ink-2">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={scenes[i].id} className="cursor-pointer hover:bg-white/[0.03]" onClick={() => { selectScene(scenes[i].id, { seek: true }); close() }}>
                {r.map((v, j) => (
                  <td key={j} className={`border-b border-line px-2 py-1.5 ${j === 0 || j === 2 ? 'tabular-nums' : ''} ${v === '—' ? 'text-ink-3' : ''} ${j === 1 ? 'font-medium' : ''}`}>
                    {v}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11.5px] text-ink-3">Clic en una fila para ir a esa escena. La cámara se elige en «Biblioteca de cámara» de cada escena.</p>
    </Modal>
  )
}
