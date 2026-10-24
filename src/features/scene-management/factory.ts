import type { AudioTrack, Project, Scene, SceneScript } from '../../types'
import { nowIso, uid } from '../../utils'
import { deriveStatus } from '../script-sync/derive'
import { copyShots } from '../coverage/shots'

export const emptyScript = (): SceneScript => ({
  action: '',
  dialogue: '',
  cameraDirection: '',
  soundDirection: '',
  generationPrompt: '',
  pronunciations: [],
})

export function createScene(projectId: string, title: string, duration: number, patch: Partial<Scene> = {}): Scene {
  const t = nowIso()
  const scene: Scene = {
    id: uid('sc_'),
    projectId,
    title,
    order: 0,
    plannedDuration: duration,
    storyboardFrames: [],
    script: emptyScript(),
    videoVersions: [],
    status: 'draft',
    reviewed: false,
    collapsed: false,
    createdAt: t,
    updatedAt: t,
    ...patch,
  }
  scene.status = deriveStatus(scene)
  return scene
}

/** Copia con IDs nuevos; los archivos se reutilizan por referencia (no se duplican). */
export function cloneScene(src: Scene): Scene {
  const t = nowIso()
  const idMap = new Map<string, string>()
  const versions = src.videoVersions.map((v) => {
    const id = uid('vv_')
    idMap.set(v.id, id)
    return { ...v, id }
  })
  return {
    ...structuredClone(src),
    id: uid('sc_'),
    title: `${src.title} (copia)`,
    storyboardFrames: src.storyboardFrames.map((f) => ({ ...f, id: uid('fr_') })),
    script: {
      ...structuredClone(src.script),
      pronunciations: src.script.pronunciations.map((p) => ({ ...p, id: uid('pr_') })),
    },
    videoVersions: versions,
    activeVideoVersionId: src.activeVideoVersionId ? idMap.get(src.activeVideoVersionId) : undefined,
    shots: copyShots(src.shots),
    reviewed: false,
    createdAt: t,
    updatedAt: t,
  }
}

export function createProjectData(title: string): Project {
  const t = nowIso()
  return { id: uid('pj_'), title, aspectRatio: '16:9', sceneIds: [], audioTracks: defaultTracks(), createdAt: t, updatedAt: t }
}

export function defaultTracks(): AudioTrack[] {
  return [1, 2].map((n) => ({ id: uid('at_'), name: `Música ${n}`, volume: 0.8, muted: false, clips: [] }))
}
