export type AspectRatio = '16:9' | '9:16'

export interface Project {
  id: string
  title: string
  description?: string
  aspectRatio: AspectRatio
  sceneIds: string[]
  createdAt: string
  updatedAt: string
}

export type SceneStatus =
  | 'draft'
  | 'storyboard-ready'
  | 'script-ready'
  | 'video-pending'
  | 'video-imported'
  | 'reviewed'

export interface StoryboardFrame {
  id: string
  mediaId: string
  order: number
  duration?: number
}

/** Par «cómo se escribe» → «cómo se pronuncia» que solo afecta al prompt de generación. */
export interface Pronunciation {
  id: string
  written: string
  spoken: string
}

export interface SceneScript {
  action: string
  dialogue: string
  cameraDirection: string
  soundDirection: string
  generationPrompt: string
  pronunciationNotes?: string
  pronunciations: Pronunciation[]
}

export interface VideoVersion {
  id: string
  mediaId: string
  duration: number
  width?: number
  height?: number
  model?: string
  credits?: number
  generationTimeSeconds?: number
  notes?: string
  createdAt: string
}

export interface Scene {
  id: string
  projectId: string
  title: string
  order: number
  plannedDuration: number
  startImageId?: string
  endImageId?: string
  storyboardFrames: StoryboardFrame[]
  script: SceneScript
  videoVersions: VideoVersion[]
  activeVideoVersionId?: string
  /** Estado guardado; se recalcula con deriveStatus cada vez que cambia la escena. */
  status: SceneStatus
  reviewed: boolean
  collapsed: boolean
  createdAt: string
  updatedAt: string
}

export type MediaKind = 'image' | 'video'

export interface MediaAsset {
  id: string
  projectId: string
  name: string
  mimeType: string
  size: number
  kind: MediaKind
  width?: number
  height?: number
  duration?: number
  createdAt: string
}

export interface MediaRecord extends MediaAsset {
  blob: Blob
  thumb?: Blob
}

export interface Settings {
  defaultDuration: number
  fit: 'contain' | 'cover'
}

export type ScriptField = Exclude<keyof SceneScript, 'pronunciations' | 'pronunciationNotes'>
