import { useMemo } from 'react'
import { useProject } from './projectStore'
import { buildSegments, orderedScenes } from '../features/script-sync/derive'

export const EMPTY_IDS: string[] = []

/** Escenas en orden (se recalcula solo cuando cambian proyecto o escenas). */
export function useOrderedScenes() {
  const project = useProject((s) => s.project)
  const scenes = useProject((s) => s.scenes)
  return useMemo(() => orderedScenes(project, scenes), [project, scenes])
}

export function useSegments() {
  const ordered = useOrderedScenes()
  return useMemo(() => buildSegments(ordered), [ordered])
}
