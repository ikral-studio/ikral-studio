// Unir cambios cuando el proyecto se editó en dos lugares a la vez
// (por ejemplo, Claude escribió proyecto.json mientras David seguía editando en la app).
// Regla: por escena gana la versión editada más recientemente; lo que uno agregó o borró se respeta.
import type { Project, Scene } from '../types'

export interface ProjectData {
  project: Project
  scenes: Scene[]
}

const later = (a?: string, b?: string) => (a ?? '') >= (b ?? '')

export function mergeProjects(base: ProjectData | null, disk: ProjectData, local: ProjectData): ProjectData {
  if (!base) return local
  const baseIds = new Set(base.project.sceneIds)
  const diskMap = new Map(disk.scenes.map((s) => [s.id, s]))
  const localMap = new Map(local.scenes.map((s) => [s.id, s]))

  // Escenas borradas por alguno de los dos
  const deletedLocal = new Set(base.project.sceneIds.filter((id) => !localMap.has(id)))
  const deletedDisk = new Set(base.project.sceneIds.filter((id) => !diskMap.has(id)))

  // Orden: si solo uno lo cambió, gana ese; si los dos, el local más lo nuevo del otro.
  const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i])
  let ids: string[]
  if (same(local.project.sceneIds, base.project.sceneIds)) ids = [...disk.project.sceneIds]
  else if (same(disk.project.sceneIds, base.project.sceneIds)) ids = [...local.project.sceneIds]
  else {
    ids = [...local.project.sceneIds]
    // Lo nuevo del otro lado va justo después de la escena que tenía antes (o al principio).
    disk.project.sceneIds.forEach((id, i) => {
      if (ids.includes(id) || baseIds.has(id)) return
      const prev = disk.project.sceneIds.slice(0, i).reverse().find((x) => ids.includes(x))
      ids.splice(prev ? ids.indexOf(prev) + 1 : 0, 0, id)
    })
  }
  ids = ids.filter((id) => !deletedLocal.has(id) && !deletedDisk.has(id) && (localMap.has(id) || diskMap.has(id)))

  const scenes = ids.map((id) => {
    const l = localMap.get(id)
    const d = diskMap.get(id)
    if (l && d) return later(l.updatedAt, d.updatedAt) ? l : d
    return (l ?? d)!
  })

  // Datos del proyecto (título, estilo, música…): gana el más reciente, pero con el orden unido.
  const proj = later(local.project.updatedAt, disk.project.updatedAt) ? local.project : disk.project
  return { project: { ...proj, sceneIds: ids }, scenes }
}
