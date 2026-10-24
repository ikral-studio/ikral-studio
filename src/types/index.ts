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
  /** Sugerencia de personajes que hizo Claude (paso 5 de la Biblia), esperando que se acepte. */
  suggestion?: CharacterSuggestion[]
  /** Sugerencias de locaciones, objetos o vestuario que Claude sacó del guion, esperando que se acepten. */
  itemSuggestions?: Partial<Record<ItemKind, ItemSuggestion[]>>
  /** Biblia: locaciones (lugares donde pasa la historia). */
  locations?: BibleItem[]
  /** Locación principal: va primero y es la portada de la Biblia. */
  mainLocationId?: string
  /** Biblia: objetos importantes. */
  props?: BibleItem[]
  /** Biblia: vestuario (de qué personaje es en `characterId`). */
  wardrobe?: BibleItem[]
  /** Biblia: relaciones entre personajes. */
  relations?: Relation[]
  /** Campos extra que tiene cada escena (ej. Vestuario, Emoción). */
  customFields?: CustomField[]
  /** Pistas de música (2). Opcional para proyectos viejos. */
  audioTracks?: AudioTrack[]
  /** Papelera: lo que se borró y se puede recuperar. */
  trash?: TrashEntry[]
  /** Etapas de la historia, en orden (ej.: ANTES → TRANSICIÓN → DESPUÉS). Sin etapas = como siempre. */
  phases?: Phase[]
  /** Reglas del director que Claude y GPT deben respetar. Solo cuentan las aprobadas. */
  decisions?: Decision[]
  createdAt: string
  updatedAt: string
}

export interface BibleAnswers {
  look?: string
  lookOther?: string
  era?: string
  /** Lugar principal (ej.: Los Ángeles, USA). */
  place?: string
  mood?: string
  audience?: string
  /** Se pidió la sugerencia a Claude y todavía no llega. */
  suggesting?: boolean
  /** Idea general de los personajes para la sugerencia (paso 5). */
  castIdea?: string
  /** Se pidió a Claude sacar del guion estas listas y todavía no llegan. */
  suggestingItems?: ItemKind[]
}

export interface Character {
  id: string
  name: string
  /** Papel corto que se ve en la tarjeta (ej.: Dueña, Empleado). */
  role?: string
  description: string
  /** Imagen aprobada del personaje (también sirve de referencia para generar escenas). */
  imageId?: string
  /** Prompt escrito a mano (si no hay, se arma solo con la Biblia y el guion). */
  prompt?: string
  /** Todas las pruebas de imagen que se han hecho, para escoger cuál aprobar. */
  tries?: CharacterTry[]
  /** Se pidió una imagen a Claude y todavía no llega. */
  generating?: boolean
}

export interface CharacterTry {
  id: string
  mediaId: string
  prompt?: string
  at: string
}

/** Elemento de la Biblia (locación, objeto o vestuario). Sin imagen aprobada = sin preparar; con imagen aprobada = Canon. */
export interface BibleItem {
  id: string
  name: string
  /** Texto corto que se ve en la tarjeta (ej.: Interior principal, Para llevar). */
  note?: string
  description: string
  imageId?: string
  prompt?: string
  tries?: CharacterTry[]
  generating?: boolean
  /** Vestuario: personaje que lo usa. */
  characterId?: string
  /** Etapas donde SÍ puede aparecer. Vacío o sin dato = en todas. */
  onlyIn?: string[]
  /** Otros nombres para encontrarlo en el guion (ej.: «papelitos», «tickets»). */
  aliases?: string[]
}

/** Etapa de la historia (ej.: «ANTES (comandas de papel)»). */
export interface Phase {
  id: string
  name: string
  note?: string
}

/** Quién puede proponer una decisión. Aprobar, solo el director. */
export type DecisionAuthor = 'director' | 'claude' | 'gpt'

/** Regla de continuidad: cualquiera la propone, solo el director la aprueba. */
export interface Decision {
  id: string
  text: string
  proposedBy: DecisionAuthor
  proposedAt: string
  status: 'proposed' | 'approved' | 'rejected'
  /** Solo el director puede aprobar. */
  approvedBy?: 'director'
  approvedAt?: string
  /** Escenas a las que aplica. */
  sceneIds?: string[]
  /** Elementos de la Biblia a los que aplica. */
  itemIds?: string[]
  /** Permite volver a una etapa anterior en esas escenas (ej.: un flashback). */
  allowsBackstep?: boolean
  /** Para unir cambios cuando Claude y la app editan a la vez. */
  updatedAt: string
}

export type BibleKind = 'characters' | 'locations' | 'props' | 'wardrobe'
export type ItemKind = Exclude<BibleKind, 'characters'>

/** Locación, objeto o vestuario que Claude sugiere a partir del guion. */
export interface ItemSuggestion {
  name: string
  note?: string
  description: string
}

export interface Relation {
  id: string
  a: string
  b: string
  /** Qué son (ej.: Matrimonio, Jefa / Empleado). */
  label: string
}

/** Algo que se borró y está en la papelera. */
export type TrashEntry = { id: string; deletedAt: string } & (
  | { kind: 'scene'; scene: Scene; index: number }
  | { kind: BibleKind; item: BibleItem | Character; relations?: Relation[] }
  | { kind: 'relation'; relation: Relation }
  | { kind: 'version'; sceneId: string; version: VideoVersion }
  | { kind: 'shot'; sceneId: string; shot: Shot; index: number }
)

/** Propuesta de la imagen inicial o final de una escena (Preproducción). */
export interface FramePlan {
  /** Prompt escrito a mano (si no hay, se arma solo con la escena, los personajes y la Biblia). */
  prompt?: string
  tries?: CharacterTry[]
  /** Prueba aprobada: es la que pasa a Edición. */
  approvedId?: string
  /** Se pidió una imagen a Claude y todavía no llega. */
  generating?: boolean
}

export interface CharacterSuggestion {
  name: string
  description: string
  imageId?: string
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
  /** Preproducción: propuestas de imagen inicial y final (pruebas y la aprobada) antes de pasarlas a Edición. */
  prep?: { start?: FramePlan; end?: FramePlan }
  /** Etapa de la historia donde ocurre (id de `project.phases`). */
  phaseId?: string
  /**
   * Cobertura: varios planos dentro de la escena. Sin `shots` = un solo plano implícito
   * armado con los campos de la escena (léelos siempre con `shotsOf(scene)`).
   */
  shots?: Shot[]
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

/** Un plano de la cobertura. La escena guarda guion y diálogos; el plano, sus datos técnicos. */
export interface Shot {
  /** Estable: no cambia al reordenar. */
  id: string
  order: number
  /** Nombre corto (ej.: «Detalle de manos»). */
  name: string
  /** Segundos. */
  duration: number
  /** Qué pasa en este plano. */
  action?: string
  /** Líneas del diálogo de la escena que caen en este plano (índices desde 0). */
  dialogueLines?: number[]
  sound?: string
  /** Nota de continuidad (ej.: «la carne ya está volteada»). */
  continuity?: string
  camera?: CameraSpec
  /** Texto libre de cámara (encuadre, movimiento). */
  cameraDirection?: string
  prep?: { start?: FramePlan; end?: FramePlan }
  startImageId?: string
  endImageId?: string
  /** Prompt de video propio del plano. */
  generationPrompt?: string
  /** Fotogramas de referencia (los «Fotogramas intermedios» de hoy). */
  references?: StoryboardFrame[]
  videoVersions?: VideoVersion[]
  activeVideoVersionId?: string
  /** Para unir cambios plano por plano (Claude y la app a la vez). */
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
