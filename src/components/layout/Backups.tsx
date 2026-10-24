import { useEffect, useState } from 'react'
import { History, RotateCcw, Save } from 'lucide-react'
import { useProject } from '../../stores/projectStore'
import { askConfirm, toast } from '../../stores/uiStore'
import { isDesktop, listSnapshots, type Snapshot } from '../../database/db'

const REASON: Record<Snapshot['reason'], string> = {
  auto: 'Automático',
  'before-restore': 'Antes de restaurar',
  'before-import': 'Antes de importar guion',
}

/** Respaldos automáticos del proyecto (ver y restaurar). */
export function Backups({ projectId }: { projectId: string }) {
  const [list, setList] = useState<Snapshot[] | null>(null)
  const refresh = () => listSnapshots(projectId).then(setList)
  useEffect(() => {
    void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])
  const backupNow = async () => {
    await useProject.getState().backupNow('auto')
    toast('Respaldo hecho')
    refresh()
  }
  const restore = async (s: Snapshot) => {
    const ok = await askConfirm({
      title: 'Restaurar este respaldo',
      body: `El proyecto vuelve a como estaba el ${new Date(s.createdAt).toLocaleString('es-MX')} (${s.scenes.length} escenas). Antes guardo un respaldo de cómo está ahora, por si quieres regresar.`,
      confirmLabel: 'Restaurar',
    })
    if (!ok) return
    await useProject.getState().restoreSnapshot(s.id)
    toast('Respaldo restaurado')
    refresh()
  }
  return (
    <div className="mt-5">
      <div className="mb-2 flex items-center gap-2">
        <History size={16} className="text-ink-2" />
        <h3 className="font-semibold">Respaldos automáticos de este proyecto</h3>
        <button className="btn btn-sm ml-auto" onClick={backupNow}>
          <Save size={13} /> Respaldar ahora
        </button>
      </div>
      <p className="mb-2 text-[12px] text-ink-3">Cada 15 minutos, si hubo cambios, se guarda una copia (se conservan las últimas 30). {isDesktop() ? 'Se guardan en la carpeta «respaldos» del proyecto.' : 'Se guardan en este navegador.'}</p>
      {!list ? null : list.length === 0 ? (
        <p className="text-[12.5px] text-ink-2">Todavía no hay respaldos. El primero se hace a los 15 minutos de trabajo o con «Respaldar ahora».</p>
      ) : (
        <ul className="flex max-h-60 flex-col gap-1 overflow-auto">
          {list.map((s) => (
            <li key={s.id} className="flex items-center gap-3 rounded-lg border border-line bg-card/40 px-3 py-2 text-[12.5px]">
              <span className="tabular-nums">{new Date(s.createdAt).toLocaleString('es-MX')}</span>
              <span className="text-ink-3">
                {s.scenes.length} escenas · {REASON[s.reason]}
              </span>
              <button className="btn btn-sm ml-auto" onClick={() => restore(s)}>
                <RotateCcw size={12} /> Restaurar
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
