import { useProject } from '../../stores/projectStore'
import { askConfirm, requestScroll, toast } from '../../stores/uiStore'
import { playback, usePlayback } from '../playback/engine'
import { importFile, MediaError } from '../media-library/media'
import type { MediaKind } from '../../types'
import { pad2 } from '../../utils'

export async function confirmDeleteScene(id: string) {
  const { project, scenes, deleteScene } = useProject.getState()
  const scene = scenes[id]
  if (!project || !scene) return
  const n = project.sceneIds.indexOf(id) + 1
  const ok = await askConfirm({
    title: `¿Eliminar la escena ${pad2(n)}?`,
    body: `«${scene.title}» desaparecerá de las tarjetas, del guion y del timeline. Se va a la papelera 🗑️ y desde ahí la puedes recuperar (o deshacer con ⌘Z).`,
    confirmLabel: 'Eliminar escena',
    danger: true,
  })
  if (ok) {
    deleteScene(id)
    toast('Escena enviada a la papelera')
  }
}

export function selectScene(id: string, opts: { scroll?: boolean; seek?: boolean } = {}) {
  useProject.getState().select(id)
  if (opts.scroll !== false) requestScroll(id)
  if (opts.seek && !usePlayback.getState().playing) playback.seekScene(id)
}

export function addSceneAndFocus(index?: number) {
  const id = useProject.getState().addScene(index)
  if (id) requestScroll(id)
  if (id && index !== undefined) toast(`Escena nueva en el lugar ${pad2(index + 1)}`)
}

export function duplicateAndFocus(id: string) {
  useProject.getState().duplicateScene(id)
  const sel = useProject.getState().selectedSceneId
  if (sel) requestScroll(sel)
  toast('Escena duplicada')
}

/** Importa archivos mostrando errores claros. Devuelve los que sí se guardaron. */
export async function importFiles(files: File[], expect?: MediaKind) {
  const project = useProject.getState().project
  if (!project) return []
  const out = []
  for (const f of files) {
    try {
      out.push(await importFile(f, project.id, expect))
    } catch (e) {
      toast(e instanceof MediaError ? e.message : `No se pudo importar «${f.name}».`, 'error')
    }
  }
  return out
}
