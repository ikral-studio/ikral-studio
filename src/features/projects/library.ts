// Bibliotecas (como en Final Cut): cada proyecto es un paquete «Nombre.ikral» con todo adentro,
// que se puede guardar en cualquier carpeta o disco y abrir desde ahí (también con doble clic en Finder).
import { exportImagesFolder, isDesktop, moveLibrary, openLibrary } from '../../database/db'
import { orderedScenes } from '../script-sync/derive'
import { useProject } from '../../stores/projectStore'
import { toast } from '../../stores/uiStore'
import { releaseAllUrls } from '../media-library/media'
import { safeFilename } from '../../utils'

/** «Guardar como»: eliges dónde y con qué nombre; el proyecto (con todos sus archivos) pasa a esa carpeta y la app sigue trabajando ahí. */
export async function saveLibraryAs(): Promise<boolean> {
  const { project, flushSave } = useProject.getState()
  if (!project || !isDesktop()) return false
  await flushSave()
  const [{ save }, { documentDir }] = await Promise.all([import('@tauri-apps/plugin-dialog'), import('@tauri-apps/api/path')])
  const dest = await save({
    title: 'Guardar proyecto como…',
    defaultPath: `${await documentDir()}/${safeFilename(project.title)}`,
  })
  if (!dest) return false
  try {
    const to = await moveLibrary(project.id, dest)
    releaseAllUrls()
    await useProject.getState().openProject(project.id)
    toast(`Proyecto guardado en la carpeta «${to.split('/').pop()}»`)
    return true
  } catch (e) {
    toast(e instanceof Error ? e.message : 'No se pudo guardar el proyecto', 'error')
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
  // Se escoge la carpeta del proyecto (las bibliotecas .ikral también se abren con doble clic en Finder).
  const path = await open({ title: 'Abrir proyecto (escoge su carpeta)', multiple: false, directory: true })
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

/** Nombres claros para cada imagen del proyecto: «Personajes/Doña Chuy», «Escenas/Escena 01 - Título - inicial»… */
export function friendlyImageNames(): { id: string; path: string }[] {
  const { project, scenes } = useProject.getState()
  if (!project) return []
  const out: { id: string; path: string }[] = []
  const seen = new Set<string>()
  const used = new Set<string>()
  const clean = (t: string) => safeFilename(t.trim() || 'Sin nombre')
  const add = (id: string | undefined, path: string) => {
    if (!id || seen.has(id)) return
    let p = path
    for (let n = 2; used.has(p.toLowerCase()); n++) p = `${path} (${n})`
    seen.add(id)
    used.add(p.toLowerCase())
    out.push({ id, path: p })
  }
  const items = (folder: string, list: { name: string; imageId?: string; tries?: { mediaId: string }[] }[] | undefined) =>
    list?.forEach((it) => {
      add(it.imageId, `${folder}/${clean(it.name)}`)
      it.tries?.forEach((t, i) => add(t.mediaId, `${folder}/${clean(it.name)} - prueba ${i + 1}`))
    })
  items('Personajes', project.characters)
  items('Locaciones', project.locations)
  items('Objetos', project.props)
  items('Vestuario', project.wardrobe)
  orderedScenes(project, scenes).forEach((s, i) => {
    const base = `Escenas/Escena ${String(i + 1).padStart(2, '0')} - ${clean(s.title)}`
    add(s.startImageId, `${base} - inicial`)
    add(s.endImageId, `${base} - final`)
    for (const slot of ['start', 'end'] as const) {
      const plan = s.prep?.[slot]
      plan?.tries?.forEach((t, n) => add(t.mediaId, `${base} - ${slot === 'start' ? 'inicial' : 'final'} prueba ${n + 1}`))
    }
    s.storyboardFrames.forEach((f, n) => add(f.mediaId, `${base} - fotograma ${n + 1}`))
  })
  project.suggestion?.forEach((sg) => add(sg.imageId, `Sugerencias/${clean(sg.name)}`))
  return out
}

/** «Ver en Finder»: copia las imágenes con nombres claros a una carpeta normal y la abre. */
export async function showImagesInFinder() {
  const { project, flushSave } = useProject.getState()
  if (!project || !isDesktop()) return
  await flushSave()
  try {
    const entries = friendlyImageNames()
    if (!entries.length) return toast('Este proyecto todavía no tiene imágenes', 'info')
    const dir = await exportImagesFolder(project.id, entries)
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('mostrar_en_finder', { path: dir })
    toast(`Listo: ${entries.length} imágenes en la carpeta «Imágenes» del proyecto`)
  } catch (e) {
    toast(e instanceof Error ? e.message : 'No se pudo abrir la carpeta', 'error')
  }
}
