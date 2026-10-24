// Bibliotecas (como en Final Cut): cada proyecto es un paquete «Nombre.ikral» con todo adentro,
// que se puede guardar en cualquier carpeta o disco y abrir desde ahí (también con doble clic en Finder).
import { isDesktop, moveLibrary, openLibrary, projectFolderPath } from '../../database/db'
import { useProject } from '../../stores/projectStore'
import { toast } from '../../stores/uiStore'
import { releaseAllUrls } from '../media-library/media'
import { safeFilename } from '../../utils'

/** «Guardar biblioteca en…»: eliges dónde y la biblioteca del proyecto abierto se mueve ahí. */
export async function saveLibraryAs(): Promise<boolean> {
  const { project, flushSave } = useProject.getState()
  if (!project || !isDesktop()) return false
  await flushSave()
  const [{ save }, { dirname }] = await Promise.all([import('@tauri-apps/plugin-dialog'), import('@tauri-apps/api/path')])
  const now = await projectFolderPath(project.id)
  const start = now ? await dirname(now) : undefined
  const dest = await save({
    title: 'Guardar biblioteca en…',
    defaultPath: start ? `${start}/${safeFilename(project.title)}.ikral` : `${safeFilename(project.title)}.ikral`,
    filters: [{ name: 'Biblioteca de IKRAL Studio', extensions: ['ikral'] }],
  })
  if (!dest) return false
  try {
    const to = await moveLibrary(project.id, dest)
    releaseAllUrls()
    await useProject.getState().openProject(project.id)
    toast(`Biblioteca guardada en ${to.split('/').slice(-2).join('/')}`)
    return true
  } catch (e) {
    toast(e instanceof Error ? e.message : 'No se pudo guardar la biblioteca', 'error')
    return false
  }
}

/** Abre una biblioteca .ikral de cualquier lugar (la ruta llega del diálogo o de Finder). */
export async function openLibraryAt(path: string): Promise<boolean> {
  try {
    const id = await openLibrary(path)
    releaseAllUrls()
    await useProject.getState().openProject(id)
    toast('Biblioteca abierta')
    return true
  } catch (e) {
    toast(e instanceof Error ? e.message : 'No se pudo abrir la biblioteca', 'error')
    return false
  }
}

/** «Abrir biblioteca…»: diálogo del Mac para escoger un archivo .ikral. */
export async function pickLibrary(): Promise<boolean> {
  if (!isDesktop()) return false
  const { open } = await import('@tauri-apps/plugin-dialog')
  const path = await open({ title: 'Abrir biblioteca', multiple: false, directory: false, filters: [{ name: 'Biblioteca de IKRAL Studio', extensions: ['ikral'] }] })
  return typeof path === 'string' ? openLibraryAt(path) : false
}

/** Doble clic en una biblioteca en Finder: la app recibe la ruta y la abre. */
export async function listenFinderOpen() {
  if (!isDesktop()) return
  const [{ listen }, { invoke }] = await Promise.all([import('@tauri-apps/api/event'), import('@tauri-apps/api/core')])
  // Se toman de la fila de pendientes (así no se abre dos veces la misma).
  const drain = async () => {
    const last = (await invoke<string[]>('bibliotecas_pendientes').catch(() => [] as string[])).at(-1)
    if (last) await openLibraryAt(last)
  }
  await listen('open-library', () => void drain())
  // Las que llegaron antes de que la ventana estuviera lista (la app se abrió con doble clic).
  await drain()
}
