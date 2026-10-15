import { useEffect, useState } from 'react'
import { FolderOpen, Keyboard, Loader2, RotateCcw, Trash2, Upload, HardDrive, ShieldCheck } from 'lucide-react'
import { useProject } from '../../stores/projectStore'
import { askConfirm, toast, useUI } from '../../stores/uiStore'
import { deleteProject, listProjects } from '../../database/db'
import { importProjectZip } from '../../features/projects/backup'
import { releaseAllUrls } from '../../features/media-library/media'
import { pickFiles } from '../../hooks/useFileDrop'
import { formatBytes } from '../../utils'
import { Modal } from '../common/Overlays'
import { ImportScriptModal } from './ImportScriptModal'
import { PasteSceneModal } from './PasteSceneModal'
import type { Project } from '../../types'
import { ACTIONS, DEFAULT_KEYS, RESERVED, assignKey, keyLabel, mergeKeys, normalizeKey, type ActionId, type KeyBindings } from '../../features/shortcuts/keys'
import { shortcutCapture } from '../../hooks/useShortcuts'

function useBindings(): [KeyBindings, (b: KeyBindings) => void] {
  const saved = useProject((s) => s.settings.keys)
  return [mergeKeys(saved as Partial<KeyBindings>), (b) => useProject.getState().updateSettings({ keys: b })]
}

function KeyEditor() {
  const [keys, setKeys] = useBindings()
  const [listening, setListening] = useState<ActionId | null>(null)
  useEffect(() => {
    if (!listening) return
    shortcutCapture.active = true
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') return setListening(null)
      if (e.metaKey || e.ctrlKey || e.altKey) return toast('Usa una tecla sola, sin ⌘, Ctrl ni Alt', 'info')
      const k = normalizeKey(e)
      if (RESERVED.includes(k)) return toast('Esa tecla no se puede usar', 'info')
      const owner = (Object.keys(keys) as ActionId[]).find((id) => id !== listening && keys[id].includes(k))
      setKeys(assignKey(keys, listening, k))
      if (owner) toast(`«${keyLabel(k)}» se quitó de «${ACTIONS.find((a) => a.id === owner)!.label}»`, 'info')
      setListening(null)
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      shortcutCapture.active = false
      window.removeEventListener('keydown', onKey, true)
    }
  }, [listening, keys, setKeys])
  return (
    <div className="rounded-xl border border-line bg-[#0f1828] p-3.5">
      <div className="mb-2 flex items-center gap-2 font-medium">
        <Keyboard size={16} /> Atajos de teclado
        <button className="btn btn-sm btn-ghost ml-auto" onClick={() => setKeys(DEFAULT_KEYS)} title="Volver a las teclas de fábrica">
          <RotateCcw size={13} /> Restaurar
        </button>
      </div>
      <p className="mb-2 text-[12px] text-ink-3">Toca «Cambiar» y luego la tecla que quieras. Esc cancela.</p>
      <ul className="flex flex-col">
        {ACTIONS.map((a) => (
          <li key={a.id} className="flex items-center gap-2 border-b border-line py-1.5 last:border-0">
            <span className="flex-1 text-[12.5px] text-ink-2">{a.label}</span>
            {keys[a.id].length ? (
              keys[a.id].map((k) => (
                <kbd key={k} className="min-w-7 rounded-md border border-line-2 bg-card px-1.5 py-0.5 text-center font-mono text-[12px]">
                  {keyLabel(k)}
                </kbd>
              ))
            ) : (
              <span className="text-[11.5px] text-ink-3">sin tecla</span>
            )}
            <button
              className={`btn btn-sm ${listening === a.id ? '!border-sel !bg-sel/20' : ''}`}
              onClick={() => setListening(listening === a.id ? null : a.id)}
              aria-label={`Cambiar tecla de ${a.label}`}
            >
              {listening === a.id ? 'Toca una tecla…' : 'Cambiar'}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

const close = () => useUI.setState({ modal: null })

function ProjectsModal() {
  const current = useProject((s) => s.project?.id)
  const [list, setList] = useState<Project[] | null>(null)
  const [busy, setBusy] = useState(false)
  const refresh = () => listProjects().then(setList)
  useEffect(() => {
    void useProject.getState().flushSave().then(refresh)
  }, [])

  const open = async (id: string) => {
    releaseAllUrls()
    await useProject.getState().openProject(id)
    close()
  }
  const remove = async (p: Project) => {
    const ok = await askConfirm({
      title: `¿Borrar «${p.title}»?`,
      body: 'Se borran sus escenas, imágenes y videos de este navegador. No se puede deshacer. Si quieres conservarlo, exporta antes un respaldo.',
      confirmLabel: 'Borrar proyecto',
      danger: true,
    })
    if (!ok) return
    if (p.id === current) await useProject.getState().closeProject()
    await deleteProject(p.id)
    toast('Proyecto borrado')
    refresh()
  }
  const importZip = async () => {
    const [file] = await pickFiles('.zip,application/zip')
    if (!file) return
    setBusy(true)
    try {
      const id = await importProjectZip(file)
      await open(id)
      toast('Respaldo importado')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo importar', 'error')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal
      title="Proyectos"
      onClose={close}
      width={560}
      footer={
        <button className="btn" onClick={importZip} disabled={busy}>
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />} Importar respaldo (.zip)
        </button>
      }
    >
      {!list ? (
        <Loader2 className="mx-auto animate-spin text-ink-3" />
      ) : list.length === 0 ? (
        <p className="text-ink-2">No hay proyectos guardados.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {list.map((p) => (
            <li key={p.id} className={`flex items-center gap-3 rounded-xl border p-3 ${p.id === current ? 'border-sel bg-sel/10' : 'border-line bg-card/50'}`}>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{p.title}</div>
                <div className="text-[11.5px] text-ink-3">
                  {p.sceneIds.length} escenas · {p.aspectRatio} · editado {new Date(p.updatedAt).toLocaleString('es-MX')}
                </div>
              </div>
              {p.id === current ? (
                <span className="chip bg-sel/20 text-[#bfdbfe]">Abierto</span>
              ) : (
                <button className="btn btn-sm" onClick={() => open(p.id)}>
                  <FolderOpen size={13} /> Abrir
                </button>
              )}
              <button className="icon-btn sm hover:!text-bad" onClick={() => remove(p)} aria-label={`Borrar ${p.title}`}>
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}

function SettingsModal() {
  const settings = useProject((s) => s.settings)
  const update = useProject((s) => s.updateSettings)
  const [usage, setUsage] = useState<{ used: number; quota: number } | null>(null)
  const [persisted, setPersisted] = useState<boolean | null>(null)
  useEffect(() => {
    navigator.storage?.estimate?.().then((e) => setUsage({ used: e.usage ?? 0, quota: e.quota ?? 0 }))
    navigator.storage?.persisted?.().then(setPersisted)
  }, [])
  const askPersist = async () => {
    const ok = await navigator.storage?.persist?.()
    setPersisted(!!ok)
    toast(ok ? 'El navegador protegerá los archivos del proyecto' : 'El navegador no aceptó la protección (se intentará de nuevo al importar)', ok ? 'ok' : 'info')
  }
  return (
    <Modal title="Configuración" onClose={close} width={560}>
      <div className="flex flex-col gap-5">
        <label className="flex items-center justify-between gap-4">
          <span>
            <span className="block font-medium">Duración inicial de escenas nuevas</span>
            <span className="text-[12px] text-ink-3">En segundos.</span>
          </span>
          <input
            type="number"
            min={1}
            max={120}
            className="field !w-20 text-right"
            value={settings.defaultDuration}
            onChange={(e) => update({ defaultDuration: clampNum(Number(e.target.value), 1, 120, 8) })}
          />
        </label>
        <div className="flex items-center justify-between gap-4">
          <span>
            <span className="block font-medium">Encuadre de imágenes</span>
            <span className="text-[12px] text-ink-3">Solo cambia cómo se ven. Los archivos originales no se recortan.</span>
          </span>
          <div className="flex gap-1">
            <button className={`btn btn-sm ${settings.fit === 'contain' ? '!border-sel !bg-sel/15' : ''}`} onClick={() => update({ fit: 'contain' })}>
              Completa
            </button>
            <button className={`btn btn-sm ${settings.fit === 'cover' ? '!border-sel !bg-sel/15' : ''}`} onClick={() => update({ fit: 'cover' })}>
              Llenar
            </button>
          </div>
        </div>
        <KeyEditor />
        <div className="rounded-xl border border-line bg-[#0f1828] p-3.5">
          <div className="mb-2 flex items-center gap-2 font-medium">
            <HardDrive size={16} /> Almacenamiento
          </div>
          <p className="text-[12.5px] leading-relaxed text-ink-2">
            Todo se guarda <b>en este navegador</b> (IndexedDB), no en la nube. Para no perder nada, usa «Exportar proyecto»: descarga un .zip con
            todas las imágenes y videos.
          </p>
          {usage && (
            <div className="mt-3">
              <div className="h-2 overflow-hidden rounded-full bg-white/10">
                <div className="h-full bg-sel-2" style={{ width: `${Math.min(100, (usage.used / (usage.quota || 1)) * 100)}%` }} />
              </div>
              <div className="mt-1 text-[11.5px] text-ink-3">
                Usado {formatBytes(usage.used)} de {formatBytes(usage.quota)} disponibles
              </div>
            </div>
          )}
          <div className="mt-3 flex items-center gap-2">
            {persisted ? (
              <span className="flex items-center gap-1.5 text-[12.5px] text-ok">
                <ShieldCheck size={15} /> Almacenamiento protegido
              </span>
            ) : (
              <button className="btn btn-sm" onClick={askPersist}>
                <ShieldCheck size={13} /> Pedir que el navegador no borre los archivos
              </button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}

function clampNum(v: number, min: number, max: number, fallback: number) {
  return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback
}

function HelpModal() {
  const [keys] = useBindings()
  const rows: [string, string][] = [
    ...ACTIONS.map((a): [string, string] => [keys[a.id].map(keyLabel).join(' / ') || '—', a.label]),
    ['⌘S / Ctrl+S', 'Guardar ahora'],
    ['⌘Z / ⇧⌘Z', 'Deshacer / rehacer'],
    ['Esc', 'Cerrar ventanas · salir de la tijera'],
  ]
  return (
    <Modal title="Ayuda" onClose={close} width={560}>
      <h3 className="mb-2 font-semibold">Atajos de teclado <span className="text-[12px] font-normal text-ink-3">(cámbialos en Configuración)</span></h3>
      <table className="w-full text-[12.5px]">
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k} className="border-b border-line last:border-0">
              <td className="py-1.5 pr-4 font-mono text-ink">{k}</td>
              <td className="py-1.5 text-ink-2">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3 className="mb-2 mt-5 font-semibold">Llevar imágenes a Higgsfield, Kling, Wan…</h3>
      <p className="text-[12.5px] leading-relaxed text-ink-2">
        Los navegadores no dejan arrastrar un archivo de esta página directo a otra página web. Lo que sí funciona siempre:
        <br />1. Botón <b>Descargar</b> sobre la imagen o el video.
        <br />2. Botón <b>Copiar prompt de generación</b>.
        <br />3. En el generador, sube el archivo descargado y pega el prompt.
        <br />
        En Chrome también puedes arrastrar la imagen al escritorio para guardarla.
      </p>
      <h3 className="mb-2 mt-5 font-semibold">Dónde se guarda</h3>
      <p className="text-[12.5px] leading-relaxed text-ink-2">
        En este navegador y esta computadora. Para tener copia, usa <b>Exportar proyecto</b> (.zip con todos los archivos) y guárdalo donde quieras.
        «Exportar video» (un MP4 final) todavía no existe. Para terminar la edición en Premiere, Final Cut o DaVinci usa el botón 🎬
        «Exportar edición»: baja un .zip con los archivos y la línea de tiempo.
      </p>
    </Modal>
  )
}

export function Modals() {
  const modal = useUI((s) => s.modal)
  if (modal === 'projects') return <ProjectsModal />
  if (modal === 'settings') return <SettingsModal />
  if (modal === 'help') return <HelpModal />
  if (modal === 'importScript') return <ImportScriptModal />
  if (modal === 'pasteScene') return <PasteSceneModal />
  return null
}
