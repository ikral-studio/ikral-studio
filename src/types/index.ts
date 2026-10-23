export type AspectRatio = '16:9' | '9:16'

export interface Project {
  id: string
  title: string
  description?: string
  aspectRatio: AspectRatio
  sceneIds: string[]
  /** Estilo visual de todo el proyecto (se agrega a cada prompt). */
  style?: { preset?: string; notes?: string }
  /** Biblia del proyecto: respuestas de estilo (real/caricatura, época, colores, público). */
  bible?: BibleAnswers
  /** Personajes: su descripción se agrega al prompt de las escenas donde aparecen. */
  characters?: Character[]
  /** Campos extra que tiene cada escena (ej. Vestuario, Emoción). */
  customFields?: CustomField[]
  /** Pistas de música (2). Opcional para proyectos viejos. */
  audioTracks?: AudioTrack[]
  createdAt: string
  updatedAt: string
}

export interface BibleAnswers {
  look?: string
  lookOther?: string
  era?: string
  mood?: string
  audience?: string
}

export interface Character {
  id: string
  name: string
  description: string
}

export interface CustomField {
  id: string
  name: string
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
  /** Al copiar el prompt, cambiar números por palabras (1253 → mil doscientos cincuenta y tres). */
  numbersToWords?: boolean
  /** Valores de los campos extra: id del campo → texto. */
  extras?: Record<string, string>
  /** Toma elegida en la Biblioteca de cámara. */
  camera?: CameraSpec
}

export interface CameraSpec {
  shot?: string
  angle?: string
  move?: string
  lens?: string
  composition?: string
  light?: string
  time?: string
  transition?: string
  speed?: 'slow' | 'normal' | 'fast'
}

export interface VideoVersion {
  id: string
  mediaId: string
  /** Copia ligera solo para la vista previa (videos muy pesados). Exportar usa el original. */
  previewMediaId?: string
  duration: number
  width?: number
  height?: number
  model?: string
  credits?: number
  generationTimeSeconds?: number
  notes?: string
  /** Recorte sin tocar el archivo: segundo de entrada y de salida dentro del video. */
  trimIn?: number
  trimOut?: number
  /** Videos que siguen al primero dentro de la misma escena (se reproducen uno tras otro). */
  clips?: VideoClip[]
  createdAt: string
}

/** Un video dentro de una versión. El primero son los datos de la propia versión. */
export interface VideoClip {
  id: string
  mediaId: string
  previewMediaId?: string
  duration: number
  width?: number
  height?: number
  trimIn?: number
  trimOut?: number
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

export type MediaKind = 'image' | 'video' | 'audio'

export interface AudioClip {
  id: string
  mediaId: string
  name: string
  /** Segundo global donde empieza a sonar. */
  start: number
  /** Largo que suena (después de recortar). */
  duration: number
  /** Desde qué segundo del archivo empieza a sonar. */
  offset?: number
  /** Largo total del archivo original. */
  sourceDuration?: number
}

export interface AudioTrack {
  id: string
  name: string
  volume: number
  muted: boolean
  clips: AudioClip[]
}

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
  /** Atajos personalizados (acción → teclas). */
  keys?: Partial<Record<string, string[]>>
}

export type ScriptField = Exclude<keyof SceneScript, 'pronunciations' | 'pronunciationNotes' | 'numbersToWords' | 'extras' | 'camera'>
