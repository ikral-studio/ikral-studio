// Unir cambios cuando el proyecto se editó en dos lugares a la vez
// (por ejemplo, Claude escribió proyecto.json mientras David seguía editando en la app).
// Regla: por escena gana la versión editada más recientemente; lo que uno agregó o borró se respeta.
import type { Project, Scene } from '../types'
import { mergeShots } from '../features/coverage/shots'
import { addToTrash } from '../features/trash/trash'

export interface ProjectData {
  project: Project
  scenes: Scene[]
}

const later = (a?: string, b?: string) => (a ?? '') >= (b ?? '')

/**
 * Une una lista por id (etapas, decisiones): lo que uno agregó o borró se respeta.
 * Si los dos tienen el mismo elemento, gana el de `updatedAt` más reciente (o el del lado preferido si no tiene).
 * El orden es el del lado preferido, y lo nuevo del otro lado va al final.
 */
export function mergeById<T extends { id: string; updatedAt?: string }>(base: T[] | undefined, disk: T[] | undefined, local: T[] | undefined, preferLocal: boolean): T[] | undefined {
  if (!disk && !local) return undefined
  const baseIds = new Set((base ?? []).map((x) => x.id))
  const d = new Map((disk ?? []).map((x) => [x.id, x]))
  const l = new Map((local ?? []).map((x) => [x.id, x]))
  const [first, second] = preferLocal ? [local ?? [], disk ?? []] : [disk ?? [], local ?? []]
  const out: T[] = []
  for (const x of [...first, ...second.filter((y) => !first.some((f) => f.id === y.id))]) {
    const a = d.get(x.id)
    const b = l.get(x.id)
    // Estaba en la base y uno de los dos lo borró: se queda borrado.
    if (baseIds.has(x.id) && (!a || !b)) continue
    if (a && b) out.push(a.updatedAt || b.updatedAt ? (later(b.updatedAt, a.updatedAt) ? b : a) : preferLocal ? b : a)
    else out.push(x)
  }
  return out
}

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

  const baseScenes = new Map(base.scenes.map((s) => [s.id, s]))
  const lostShots: { sceneId: string; shot: NonNullable<Scene['shots']>[number]; index: number }[] = []
  const scenes = ids.map((id) => {
    const l = localMap.get(id)
    const d = diskMap.get(id)
    if (!l || !d) return (l ?? d)!
    const localNewer = later(l.updatedAt, d.updatedAt)
    const win = localNewer ? l : d
    if (!l.shots && !d.shots) return win
    // Los planos se unen uno por uno: si Claude cambió el plano 2 y la app el 4, se quedan los dos.
    const { shots, conflicts } = mergeShots(baseScenes.get(id)?.shots, d.shots, l.shots, localNewer)
    conflicts.forEach((shot) => lostShots.push({ sceneId: id, shot, index: shot.order }))
    return { ...win, ...(shots ? { shots } : {}) }
  })

  // Datos del proyecto (título, estilo, música…): gana el más reciente, pero con el orden unido.
  const localWins = later(local.project.updatedAt, disk.project.updatedAt)
  const proj = localWins ? local.project : disk.project
  // Etapas y decisiones se unen una por una, para que lo que agregó Claude no se pierda.
  const phases = mergeById(base.project.phases, disk.project.phases, local.project.phases, localWins)
  const decisions = mergeById(base.project.decisions, disk.project.decisions, local.project.decisions, localWins)
  let project: Project = { ...proj, sceneIds: ids, ...(phases ? { phases } : {}), ...(decisions ? { decisions } : {}) }
  // Si los dos cambiaron el mismo plano, la versión que perdió se guarda en la papelera.
  for (const x of lostShots) project = { ...project, trash: addToTrash(project, { kind: 'shot', ...x, conflict: true }) }
  return { project, scenes }
}
