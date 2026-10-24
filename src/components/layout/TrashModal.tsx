import { useState } from 'react'
import { History, ImageOff, RotateCcw, Trash2, X } from 'lucide-react'
import { useProject } from '../../stores/projectStore'
import { askConfirm, toast, useUI } from '../../stores/uiStore'
import { useMediaUrl } from '../../features/media-library/media'
import { trashImage, trashKindLabel, trashLabel, TRASH_LIMIT } from '../../features/trash/trash'
import type { TrashEntry } from '../../types'
import { Modal } from '../common/Overlays'
import { Backups } from './Backups'

const close = () => useUI.setState({ modal: null })

function Thumb({ id }: { id?: string }) {
  const url = useMediaUrl(id, true)
  return (
    <span className="flex h-12 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md bg-card-2">
      {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : <ImageOff size={16} className="text-ink-3" />}
    </span>
  )
}

function TrashList() {
  const project = useProject((s) => s.project)
  const scenes = useProject((s) => s.scenes)
  const list = [...(project?.trash ?? [])].reverse()
  if (!project) return null

  const restore = (e: TrashEntry) => {
    const err = useProject.getState().restoreTrash(e.id)
    if (err) toast(err, 'error')
    else toast(`Recuperado: ${trashLabel(e, project, scenes)}`)
  }
  const purge = async (e?: TrashEntry) => {
    const ok = await askConfirm({
      title: e ? 'Borrar para siempre' : 'Vaciar la papelera',
      body: e
        ? `«${trashLabel(e, project, scenes)}» ya no se podrá recuperar de la papelera (sí de un respaldo, si había).`
        : `Se borran para siempre las ${list.length} cosas de la papelera (siguen en los respaldos que ya existían).`,
      confirmLabel: e ? 'Borrar para siempre' : 'Vaciar',
    })
    if (ok) useProject.getState().purgeTrash(e?.id)
  }

  if (!list.length)
    return (
      <div className="flex flex-col items-center gap-2 py-10 text-center text-[14px] text-ink-2">
        <Trash2 className="text-ink-3" />
        La papelera está vacía.
        <span className="text-[13px] text-ink-3">Lo que borres (escenas, personajes, locaciones, videos…) llega aquí y lo puedes recuperar.</span>
      </div>
    )

  return (
    <div className="flex flex-col gap-2">
      <ul className="flex max-h-[55vh] flex-col gap-1.5 overflow-auto">
        {list.map((e) => (
          <li key={e.id} className="flex items-center gap-3 rounded-lg border border-line bg-card/40 px-3 py-2">
            <Thumb id={trashImage(e)} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[14px] font-medium">{trashLabel(e, project, scenes)}</span>
              <span className="text-[12.5px] text-ink-3">
                {trashKindLabel(e)} · borrado el {new Date(e.deletedAt).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}
              </span>
            </span>
            <button className="btn btn-sm" onClick={() => restore(e)}>
              <RotateCcw size={13} /> Recuperar
            </button>
            <button className="icon-btn sm hover:!text-bad" onClick={() => purge(e)} aria-label="Borrar para siempre" title="Borrar para siempre">
              <X size={15} />
            </button>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-2 pt-1">
        <span className="flex-1 text-[12px] text-ink-3">Se guardan las últimas {TRASH_LIMIT}. Lo más nuevo va arriba.</span>
        <button className="btn btn-sm hover:!text-bad" onClick={() => purge()}>
          <Trash2 size={13} /> Vaciar papelera
        </button>
      </div>
    </div>
  )
}

/** Ventana flotante: Papelera y Respaldos. */
export function TrashModal() {
  const projectId = useProject((s) => s.project?.id)
  const count = useProject((s) => s.project?.trash?.length ?? 0)
  const [tab, setTab] = useState<'trash' | 'backups'>('trash')
  const tabBtn = (id: typeof tab, icon: React.ReactNode, label: string) => (
    <button
      role="tab"
      aria-selected={tab === id}
      className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-[14px] font-medium ${tab === id ? 'bg-sel text-white' : 'text-ink-2 hover:bg-white/5'}`}
      onClick={() => setTab(id)}
    >
      {icon} {label}
    </button>
  )
  return (
    <Modal title="Papelera y respaldos" onClose={close} width={640}>
      <div role="tablist" className="mb-3 flex gap-1 rounded-xl border border-line bg-[#0f1828] p-1">
        {tabBtn('trash', <Trash2 size={16} />, `Papelera${count ? ` (${count})` : ''}`)}
        {tabBtn('backups', <History size={16} />, 'Respaldos')}
      </div>
      {tab === 'trash' ? <TrashList /> : projectId && <div className="-mt-5"><Backups projectId={projectId} /></div>}
    </Modal>
  )
}

/** Botón que abre la papelera (con cuántas cosas tiene). */
export function TrashButton({ label = false }: { label?: boolean }) {
  const count = useProject((s) => s.project?.trash?.length ?? 0)
  return (
    <button
      className={`${label ? 'btn !h-9' : 'icon-btn'} relative`}
      onClick={() => useUI.setState({ modal: 'trash' })}
      title="Papelera y respaldos: recupera lo que borraste"
      aria-label={`Papelera y respaldos${count ? ` (${count})` : ''}`}
    >
      <Trash2 size={label ? 16 : 17} />
      {label && 'Papelera'}
      {count > 0 && (
        <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-sel px-1 text-center text-[10px] font-semibold leading-4 text-white">{count > 99 ? '99+' : count}</span>
      )}
    </button>
  )
}
