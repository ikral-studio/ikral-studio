// Única fuente de verdad del proyecto abierto. Todas las vistas derivan de aquí.
import { create } from 'zustand'
import type { AspectRatio, AudioTrack, BibleAnswers, CameraSpec, Character, CustomField, Project, Scene, ScriptField, Settings, VideoVersion } from '../types'
import { applySuggestion } from '../features/bible/bible'
import type { ImportedScene, ScriptFile } from '../features/script-exchange/schema'
import { clamp, nowIso, uid } from '../utils'
import * as store from '../database/db'
import { cloneScene, createProjectData, createScene, defaultTracks } from '../features/scene-management/factory'
import { clipAt, deriveStatus, placedClips, versionClips, withClips } from '../features/script-sync/derive'
import { createDemoProject } from '../features/projects/demo'

type SaveState = 'idle' | 'saving' | 'saved' | 'error'
interface Snapshot {
  project: Project
  scenes: Record<string, Scene>
}

interface State {
  ready: boolean
  project: Project | null
  scenes: Record<string, Scene>
  selectedSceneId: string | null
  saveState: SaveState
  saveError?: string
  settings: Settings
  past: Snapshot[]
  future: Snapshot[]

  init: () => Promise<void>
  newProject: (title?: string) => Promise<void>
  openProject: (id: string) => Promise<void>
  closeProject: () => Promise<void>
  renameProject: (title: string) => void
  setAspect: (a: AspectRatio) => void
  updateSettings: (patch: Partial<Settings>) => void

  select: (id: string | null) => void
  /** index = posición donde entra la escena nueva (por defecto, al final). */
  addScene: (index?: number) => string | null
  duplicateScene: (id: string) => void
  deleteScene: (id: string) => void
  moveScene: (id: string, toIndex: number) => void
  updateScene: (id: string, patch: Partial<Scene>, coalesce?: string) => void
  updateScript: (id: string, field: ScriptField, value: string) => void
  setImage: (id: string, slot: 'start' | 'end', mediaId: string | undefined) => void
  addFrames: (id: string, mediaIds: string[]) => void
  removeFrame: (id: string, frameId: string) => void
  setFrameMedia: (id: string, frameId: string, mediaId: string) => void
  moveFrame: (id: string, frameId: string, dir: -1 | 1) => void
  addVideoVersion: (id: string, v: Omit<VideoVersion, 'id' | 'createdAt'>) => void
  replaceActiveVideo: (id: string, v: Omit<VideoVersion, 'id' | 'createdAt'>) => void
  setActiveVersion: (id: string, versionId: string) => void
  removeVersion: (id: string, versionId: string) => void
  updateVersion: (id: string, versionId: string, patch: Partial<VideoVersion>) => void
  addPronunciation: (id: string) => void
  updatePronunciation: (id: string, pid: string, patch: { written?: string; spoken?: string }) => void
  removePronunciation: (id: string, pid: string) => void
  setNumbersToWords: (id: string, on: boolean) => void
  setCamera: (id: string, camera: CameraSpec | undefined) => void
  setStyle: (patch: { preset?: string; notes?: string }) => void
  setBible: (patch: Partial<BibleAnswers>) => void
  addCharacter: (name?: string) => string | undefined
  updateCharacter: (id: string, patch: Partial<Omit<Character, 'id'>>) => void
  removeCharacter: (id: string) => void
  /** Aceptar la sugerencia de un personaje (o de todos si no se da nombre). */
  acceptSuggestion: (name?: string) => void
  dismissSuggestion: () => void
  addCustomField: (name: string) => void
  renameCustomField: (fieldId: string, name: string) => void
  removeCustomField: (fieldId: string) => void
  updateExtra: (sceneId: string, fieldId: string, value: string) => void
  /** Importa un guion de IA: proyecto nuevo o al final del actual. Todo o nada; un solo paso de deshacer. */
  importScript: (data: ScriptFile, mode: 'new' | 'append') => Promise<number>
  /** Llena los textos de UNA escena con lo que dio la IA. Imágenes, videos y música no se tocan. */
  applySceneFromAI: (sceneId: string, data: ImportedScene, opts: { customFields: string[]; keepDuration: boolean }) => void

  addAudioClip: (trackId: string, clip: { mediaId: string; name: string; start: number; duration: number; sourceDuration?: number }) => void
  moveAudioClip: (trackId: string, clipId: string, start: number) => void
  removeAudioClip: (trackId: string, clipId: string) => void
  updateTrack: (trackId: string, patch: Partial<Pick<AudioTrack, 'volume' | 'muted'>>) => void
  /** Corta todos los clips de música que pasan por el segundo t. Devuelve cuántos cortó. */
  splitAudioAt: (t: number, only?: { trackId: string; clipId: string }) => number
  trimAudioClip: (trackId: string, clipId: string, edge: 'left' | 'right', time: number) => void
  /** Parte la escena en dos en el segundo local t. Devuelve el id de la parte 2. */
  splitSceneAt: (sceneId: string, localT: number) => string | null
  trimVideo: (sceneId: string, edge: 'left' | 'right', fileTime: number) => void
  /** Otro video que sigue al anterior dentro de la misma escena (versión activa). */
  addClip: (sceneId: string, clip: { mediaId: string; duration: number; width?: number; height?: number }) => void
  removeClip: (sceneId: string, clipId: string) => void
  moveClip: (sceneId: string, clipId: string, dir: -1 | 1) => void

  undo: () => void
  redo: () => void
  flushSave: () => Promise<void>
  /** Esta ventana está en pausa porque el proyecto se abrió en otra. */
  paused: boolean
  setPaused: (paused: boolean) => void
  /** Vuelve a leer el proyecto abierto desde el disco (al retomar esta ventana). */
  reloadCurrent: () => Promise<void>
  backupNow: (reason?: 'auto' | 'before-restore' | 'before-import') => Promise<void>
  restoreSnapshot: (snapshotId: string) => Promise<void>
}

const DEFAULT_SETTINGS: Settings = { defaultDuration: 8, fit: 'contain' }
const HISTORY_LIMIT = 100

// ---- control del guardado ----
let saveTimer: ReturnType<typeof setTimeout> | null = null
let dirtyVersion = 0
let savedVersion = 0
let saving: Promise<void> | null = null
let lastCoalesce: { key: string; at: number } | null = null
/** updatedAt del proyecto en el último respaldo automático. */
let lastBackupAt: string | null = null
export const BACKUP_EVERY_MS = 15 * 60 * 1000

export const useProject = create<State>()((set, get) => {
  /** Guarda un cambio: historial (deshacer), estado y guardado programado. */
  function commit(next: Snapshot, coalesce?: string, saveDelay = 0) {
    const { project, scenes, past } = get()
    if (!project) return
    const now = Date.now()
    const merge = coalesce && lastCoalesce && lastCoalesce.key === coalesce && now - lastCoalesce.at < 1500
    lastCoalesce = coalesce ? { key: coalesce, at: now } : null
    const newPast = merge ? past : [...past, { project, scenes }].slice(-HISTORY_LIMIT)
    next.project = { ...next.project, updatedAt: nowIso() }
    set({ project: next.project, scenes: next.scenes, past: newPast, future: [] })
    scheduleSave(saveDelay)
  }

  function scheduleSave(delay: number) {
    if (get().paused) return
    dirtyVersion++
    set({ saveState: 'saving' })
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => void runSave(), delay)
  }

  async function runSave() {
    saveTimer = null
    if (saving) await saving
    const { project, scenes } = get()
    if (!project) return
    const version = dirtyVersion
    const ordered = project.sceneIds.map((id, i) => ({ ...scenes[id], order: i })).filter((s) => s.id)
    saving = store
      .saveProject(project, ordered)
      .then(() => {
        savedVersion = Math.max(savedVersion, version)
        if (savedVersion >= dirtyVersion) set({ saveState: 'saved', saveError: undefined })
      })
      .catch((e: unknown) => {
        console.error(e)
        set({ saveState: 'error', saveError: e instanceof Error ? e.message : String(e) })
      })
      .finally(() => {
        saving = null
      })
    await saving
  }

  function patchTracks(trackId: string, fn: (t: AudioTrack) => AudioTrack, coalesce?: string) {
    const cur = snap()
    if (!cur) return
    const audioTracks = (cur.project.audioTracks ?? []).map((t) => (t.id === trackId ? fn(t) : t))
    commit({ ...cur, project: { ...cur.project, audioTracks } }, coalesce, coalesce ? 400 : 0)
  }

  function snap(): Snapshot | null {
    const { project, scenes } = get()
    return project ? { project, scenes } : null
  }

  /** Cambia una escena y recalcula su estado. */
  function patchScene(id: string, fn: (s: Scene) => Scene, coalesce?: string, delay = 0) {
    const cur = snap()
    if (!cur || !cur.scenes[id]) return
    const updated = fn(cur.scenes[id])
    updated.updatedAt = nowIso()
    updated.status = deriveStatus(updated)
    commit({ project: cur.project, scenes: { ...cur.scenes, [id]: updated } }, coalesce, delay)
  }

  async function loadInto(project: Project, scenes: Scene[], opts: { cleanup?: boolean } = { cleanup: true }) {
    const map: Record<string, Scene> = {}
    scenes.forEach((s) => (map[s.id] = s))
    // Reparar: escenas huérfanas o IDs sin escena
    const ids = project.sceneIds.filter((id) => map[id])
    scenes.forEach((s) => !ids.includes(s.id) && ids.push(s.id))
    project = { ...project, sceneIds: ids, audioTracks: project.audioTracks?.length ? project.audioTracks : defaultTracks() }
    set({ project, scenes: map, selectedSceneId: ids[0] ?? null, past: [], future: [], saveState: 'saved' })
    await store.setKV('lastProjectId', project.id)
    // App de escritorio: si alguien (Claude) cambia proyecto.json por fuera, recargar.
    void store.watchProject(project.id, () => {
      if (!saveTimer && !saving) void get().reloadCurrent()
    })
    // Si al guardar se unieron cambios de Claude, mostrar el resultado unido.
    void store.onMerged(() => {
      if (!saveTimer) void get().reloadCurrent()
    })
    // Limpiar archivos sin usar solo al abrir el proyecto (no al recargar: alguien puede estar agregando uno).
    if (opts.cleanup)
      store
        .collectGarbage(project.id, Object.values(map), [...project.audioTracks!.flatMap((t) => t.clips.map((c) => c.mediaId)), ...[...(project.characters ?? []), ...(project.suggestion ?? [])].flatMap((c) => (c.imageId ? [c.imageId] : []))])
        .catch(() => {})
  }

  return {
    ready: false,
    project: null,
    scenes: {},
    selectedSceneId: null,
    saveState: 'idle',
    settings: DEFAULT_SETTINGS,
    past: [],
    future: [],

    paused: false,
    setPaused(paused) {
      set({ paused })
    },

    async reloadCurrent() {
      const id = get().project?.id
      if (!id) return
      const loaded = await store.loadProject(id)
      if (loaded) {
        const sel = get().selectedSceneId
        await loadInto(loaded.project, loaded.scenes, { cleanup: false })
        if (sel && loaded.scenes.some((s) => s.id === sel)) set({ selectedSceneId: sel })
      }
    },

    async backupNow(reason = 'auto') {
      const { project, scenes } = get()
      if (!project) return
      await get().flushSave()
      const ordered = project.sceneIds.map((id) => scenes[id]).filter(Boolean)
      await store.addSnapshot(project, ordered, reason)
      lastBackupAt = project.updatedAt
    },

    async restoreSnapshot(snapshotId) {
      const snap = await store.getSnapshot(snapshotId)
      const cur = get().project
      if (!snap || !cur || snap.projectId !== cur.id) return
      await get().backupNow('before-restore')
      const project = { ...snap.project, updatedAt: nowIso() }
      await store.saveProject(project, snap.scenes)
      await loadInto(project, snap.scenes)
    },

    async init() {
      const settings = { ...DEFAULT_SETTINGS, ...((await store.getKV<Settings>('settings')) ?? {}) }
      set({ settings })
      const lastId = await store.getKV<string>('lastProjectId')
      const loaded = (lastId && (await store.loadProject(lastId))) || null
      if (loaded) {
        await loadInto(loaded.project, loaded.scenes)
      } else {
        const list = await store.listProjects()
        const first = list[0] && (await store.loadProject(list[0].id))
        if (first) await loadInto(first.project, first.scenes)
        else {
          const demo = createDemoProject(settings.defaultDuration)
          await store.saveProject(demo.project, demo.scenes)
          await loadInto(demo.project, demo.scenes)
        }
      }
      set({ ready: true })
    },

    async newProject(title = 'Proyecto sin título') {
      await get().flushSave()
      const project = createProjectData(title)
      await store.saveProject(project, [])
      await loadInto(project, [])
    },

    async openProject(id) {
      await get().flushSave()
      const loaded = await store.loadProject(id)
      if (loaded) await loadInto(loaded.project, loaded.scenes)
    },

    async closeProject() {
      await get().flushSave()
      set({ project: null, scenes: {}, selectedSceneId: null, past: [], future: [], saveState: 'idle' })
      await store.setKV('lastProjectId', null)
    },

    renameProject(title) {
      const cur = snap()
      if (!cur) return
      commit({ ...cur, project: { ...cur.project, title } }, 'project-title', 500)
    },

    setAspect(aspectRatio) {
      const cur = snap()
      if (!cur || cur.project.aspectRatio === aspectRatio) return
      commit({ ...cur, project: { ...cur.project, aspectRatio } })
    },

    updateSettings(patch) {
      const settings = { ...get().settings, ...patch }
      set({ settings })
      store.setKV('settings', settings).catch(() => {})
    },

    select(id) {
      set({ selectedSceneId: id })
    },

    addScene(index) {
      const cur = snap()
      if (!cur) return null
      const ids = [...cur.project.sceneIds]
      const at = index === undefined ? ids.length : clamp(index, 0, ids.length)
      const scene = createScene(cur.project.id, at === ids.length ? `Escena ${ids.length + 1}` : 'Escena nueva', get().settings.defaultDuration)
      ids.splice(at, 0, scene.id)
      commit({ project: { ...cur.project, sceneIds: ids }, scenes: { ...cur.scenes, [scene.id]: scene } })
      set({ selectedSceneId: scene.id })
      return scene.id
    },

    duplicateScene(id) {
      const cur = snap()
      const src = cur?.scenes[id]
      if (!cur || !src) return
      const copy = cloneScene(src)
      const ids = [...cur.project.sceneIds]
      ids.splice(ids.indexOf(id) + 1, 0, copy.id)
      commit({ project: { ...cur.project, sceneIds: ids }, scenes: { ...cur.scenes, [copy.id]: copy } })
      set({ selectedSceneId: copy.id })
    },

    deleteScene(id) {
      const cur = snap()
      if (!cur || !cur.scenes[id]) return
      const ids = cur.project.sceneIds
      const idx = ids.indexOf(id)
      const rest = { ...cur.scenes }
      delete rest[id]
      const sceneIds = ids.filter((x) => x !== id)
      // Los archivos no se borran aquí: así se puede deshacer. Se limpian al abrir el proyecto.
      commit({ project: { ...cur.project, sceneIds }, scenes: rest })
      if (get().selectedSceneId === id) set({ selectedSceneId: sceneIds[Math.min(idx, sceneIds.length - 1)] ?? null })
    },

    moveScene(id, toIndex) {
      const cur = snap()
      if (!cur) return
      const ids = [...cur.project.sceneIds]
      const from = ids.indexOf(id)
      if (from < 0) return
      const to = clamp(toIndex, 0, ids.length - 1)
      if (from === to) return
      ids.splice(from, 1)
      ids.splice(to, 0, id)
      commit({ ...cur, project: { ...cur.project, sceneIds: ids } })
    },

    updateScene(id, patch, coalesce) {
      patchScene(id, (s) => ({ ...s, ...patch }), coalesce, coalesce ? 500 : 0)
    },

    updateScript(id, field, value) {
      patchScene(id, (s) => ({ ...s, script: { ...s.script, [field]: value } }), `script:${id}:${field}`, 500)
    },

    setImage(id, slot, mediaId) {
      patchScene(id, (s) => ({ ...s, [slot === 'start' ? 'startImageId' : 'endImageId']: mediaId }))
    },

    addFrames(id, mediaIds) {
      patchScene(id, (s) => {
        const base = s.storyboardFrames.length
        const frames = mediaIds.map((mediaId, i) => ({ id: uid('fr_'), mediaId, order: base + i }))
        return { ...s, storyboardFrames: [...s.storyboardFrames, ...frames] }
      })
    },

    setFrameMedia(id, frameId, mediaId) {
      patchScene(id, (s) => ({ ...s, storyboardFrames: s.storyboardFrames.map((f) => (f.id === frameId ? { ...f, mediaId } : f)) }))
    },

    removeFrame(id, frameId) {
      patchScene(id, (s) => ({
        ...s,
        storyboardFrames: s.storyboardFrames.filter((f) => f.id !== frameId).map((f, i) => ({ ...f, order: i })),
      }))
    },

    moveFrame(id, frameId, dir) {
      patchScene(id, (s) => {
        const frames = [...s.storyboardFrames].sort((a, b) => a.order - b.order)
        const i = frames.findIndex((f) => f.id === frameId)
        const j = i + dir
        if (i < 0 || j < 0 || j >= frames.length) return s
        ;[frames[i], frames[j]] = [frames[j], frames[i]]
        return { ...s, storyboardFrames: frames.map((f, k) => ({ ...f, order: k })) }
      })
    },

    addVideoVersion(id, v) {
      patchScene(id, (s) => {
        const version: VideoVersion = { ...v, id: uid('vv_'), createdAt: nowIso() }
        return { ...s, videoVersions: [...s.videoVersions, version], activeVideoVersionId: version.id }
      })
    },

    replaceActiveVideo(id, v) {
      patchScene(id, (s) => {
        if (!s.activeVideoVersionId) {
          const version: VideoVersion = { ...v, id: uid('vv_'), createdAt: nowIso() }
          return { ...s, videoVersions: [...s.videoVersions, version], activeVideoVersionId: version.id }
        }
        return {
          ...s,
          videoVersions: s.videoVersions.map((x) =>
            x.id === s.activeVideoVersionId ? { ...x, ...v, createdAt: nowIso() } : x,
          ),
        }
      })
    },

    setActiveVersion(id, versionId) {
      patchScene(id, (s) => ({ ...s, activeVideoVersionId: versionId }))
    },

    removeVersion(id, versionId) {
      patchScene(id, (s) => {
        const videoVersions = s.videoVersions.filter((v) => v.id !== versionId)
        const active =
          s.activeVideoVersionId === versionId ? videoVersions[videoVersions.length - 1]?.id : s.activeVideoVersionId
        return { ...s, videoVersions, activeVideoVersionId: active }
      })
    },

    updateVersion(id, versionId, patch) {
      patchScene(
        id,
        (s) => ({ ...s, videoVersions: s.videoVersions.map((v) => (v.id === versionId ? { ...v, ...patch } : v)) }),
        `version:${versionId}`,
        500,
      )
    },

    addPronunciation(id) {
      patchScene(id, (s) => ({
        ...s,
        script: { ...s.script, pronunciations: [...s.script.pronunciations, { id: uid('pr_'), written: '', spoken: '' }] },
      }))
    },

    updatePronunciation(id, pid, patch) {
      patchScene(
        id,
        (s) => ({
          ...s,
          script: {
            ...s.script,
            pronunciations: s.script.pronunciations.map((p) => (p.id === pid ? { ...p, ...patch } : p)),
          },
        }),
        `pron:${pid}`,
        500,
      )
    },

    removePronunciation(id, pid) {
      patchScene(id, (s) => ({
        ...s,
        script: { ...s.script, pronunciations: s.script.pronunciations.filter((p) => p.id !== pid) },
      }))
    },

    setStyle(patch) {
      const cur = snap()
      if (!cur) return
      const style = { ...(cur.project.style ?? {}), ...patch }
      commit({ ...cur, project: { ...cur.project, style } }, 'notes' in patch ? 'style-notes' : undefined, 'notes' in patch ? 500 : 0)
    },

    setBible(patch) {
      const cur = snap()
      if (!cur) return
      const bible = { ...(cur.project.bible ?? {}), ...patch }
      const typing = 'era' in patch || 'lookOther' in patch
      commit({ ...cur, project: { ...cur.project, bible } }, typing ? 'bible-text' : undefined, typing ? 500 : 0)
    },

    addCharacter(name = '') {
      const cur = snap()
      if (!cur) return
      const id = uid('ch_')
      const characters = [...(cur.project.characters ?? []), { id, name, description: '' }]
      commit({ ...cur, project: { ...cur.project, characters } })
      return id
    },

    updateCharacter(id, patch) {
      const cur = snap()
      if (!cur) return
      const characters = (cur.project.characters ?? []).map((c) => (c.id === id ? { ...c, ...patch } : c))
      commit({ ...cur, project: { ...cur.project, characters } }, `char:${id}`, 500)
    },

    removeCharacter(id) {
      const cur = snap()
      if (!cur) return
      commit({ ...cur, project: { ...cur.project, characters: (cur.project.characters ?? []).filter((c) => c.id !== id) } })
    },

    acceptSuggestion(name) {
      const cur = snap()
      if (!cur) return
      commit({ ...cur, project: applySuggestion(cur.project, name) })
    },

    dismissSuggestion() {
      const cur = snap()
      if (!cur) return
      commit({ ...cur, project: { ...cur.project, suggestion: undefined } })
    },

    setCamera(id, camera) {
      patchScene(id, (s) => ({ ...s, script: { ...s.script, camera } }))
    },

    setNumbersToWords(id, on) {
      patchScene(id, (s) => ({ ...s, script: { ...s.script, numbersToWords: on } }))
    },

    addAudioClip(trackId, clip) {
      patchTracks(trackId, (t) => ({ ...t, clips: [...t.clips, { ...clip, id: uid('ac_'), start: Math.max(0, clip.start) }] }))
    },

    moveAudioClip(trackId, clipId, start) {
      patchTracks(
        trackId,
        (t) => ({ ...t, clips: t.clips.map((c) => (c.id === clipId ? { ...c, start: Math.max(0, Math.round(start * 10) / 10) } : c)) }),
        `clip:${clipId}`,
      )
    },

    removeAudioClip(trackId, clipId) {
      patchTracks(trackId, (t) => ({ ...t, clips: t.clips.filter((c) => c.id !== clipId) }))
    },

    updateTrack(trackId, patch) {
      patchTracks(trackId, (t) => ({ ...t, ...patch }), 'volume' in patch ? `vol:${trackId}` : undefined)
    },

    splitAudioAt(t, only) {
      const cur = snap()
      if (!cur) return 0
      let n = 0
      const audioTracks = (cur.project.audioTracks ?? []).map((tr) => ({
        ...tr,
        clips: tr.clips.flatMap((c) => {
          if (only && (only.trackId !== tr.id || only.clipId !== c.id)) return [c]
          const cut = t - c.start
          if (cut < 0.1 || cut > c.duration - 0.1) return [c]
          n++
          const offset = c.offset ?? 0
          const sourceDuration = c.sourceDuration ?? offset + c.duration
          return [
            { ...c, duration: cut, sourceDuration },
            { ...c, id: uid('ac_'), start: t, offset: offset + cut, duration: c.duration - cut, sourceDuration },
          ]
        }),
      }))
      if (n) commit({ ...cur, project: { ...cur.project, audioTracks } })
      return n
    },

    trimAudioClip(trackId, clipId, edge, time) {
      patchTracks(
        trackId,
        (tr) => ({
          ...tr,
          clips: tr.clips.map((c) => {
            if (c.id !== clipId) return c
            const offset = c.offset ?? 0
            const src = c.sourceDuration ?? offset + c.duration
            const end = c.start + c.duration
            const r = (x: number) => Math.round(x * 100) / 100
            if (edge === 'right') {
              const maxEnd = c.start + (src - offset)
              const newEnd = clamp(time, c.start + 0.2, maxEnd)
              return { ...c, duration: r(newEnd - c.start), sourceDuration: src }
            }
            // izquierda: mover inicio y offset juntos para que el audio no se desfase
            const minStart = Math.max(0, c.start - offset)
            const newStart = clamp(time, minStart, end - 0.2)
            const d = newStart - c.start
            return { ...c, start: r(newStart), offset: r(offset + d), duration: r(end - newStart), sourceDuration: src }
          }),
        }),
        `trim:${clipId}`,
      )
    },

    splitSceneAt(sceneId, localT) {
      const cur = snap()
      const scene = cur?.scenes[sceneId]
      if (!cur || !scene) return null
      const v = scene.videoVersions.find((x) => x.id === scene.activeVideoVersionId)
      const second = cloneScene(scene)
      second.title = `${scene.title} (parte 2)`
      const first: Scene = { ...scene, updatedAt: nowIso() }
      if (v) {
        // Con varios videos: la parte 1 se queda con los videos antes del corte y la parte 2 con los de después.
        const at = clipAt(v, localT)
        const cut = at.from + (localT - at.start)
        const all = placedClips(v)
        const total = all.reduce((a, p) => a + p.length, 0)
        if (localT < 0.1 || localT > total - 0.1) return null
        const before = all.slice(0, at.index).map((p) => p.clip)
        const after = all.slice(at.index + 1).map((p) => p.clip)
        const cutClip = at.clip
        const firstClips = cut - at.from >= 0.1 ? [...before, { ...cutClip, trimOut: cut }] : before
        const secondClips = at.to - cut >= 0.1 ? [{ ...cutClip, id: uid('vc_'), trimIn: cut, trimOut: at.to }, ...after] : after
        if (!firstClips.length || !secondClips.length) return null
        first.videoVersions = scene.videoVersions.map((x) => (x.id === v.id ? withClips(x, firstClips) : x))
        second.videoVersions = second.videoVersions.map((x) => (x.id === second.activeVideoVersionId ? withClips(x, secondClips) : x))
      } else {
        if (localT < 0.5 || localT > scene.plannedDuration - 0.5) return null
        second.plannedDuration = Math.round((scene.plannedDuration - localT) * 10) / 10
        first.plannedDuration = Math.round(localT * 10) / 10
      }
      first.status = deriveStatus(first)
      second.status = deriveStatus(second)
      const ids = [...cur.project.sceneIds]
      ids.splice(ids.indexOf(sceneId) + 1, 0, second.id)
      commit({ project: { ...cur.project, sceneIds: ids }, scenes: { ...cur.scenes, [sceneId]: first, [second.id]: second } })
      return second.id
    },

    trimVideo(sceneId, edge, fileTime) {
      patchScene(
        sceneId,
        (s) => ({
          ...s,
          videoVersions: s.videoVersions.map((v) => {
            if (v.id !== s.activeVideoVersionId) return v
            // Orilla izquierda = primer video; orilla derecha = último video.
            const clips = versionClips(v)
            const i = edge === 'left' ? 0 : clips.length - 1
            const c = clips[i]
            const from = c.trimIn ?? 0
            const to = c.trimOut ?? c.duration
            const r = (x: number) => Math.round(x * 100) / 100
            clips[i] = edge === 'left' ? { ...c, trimIn: r(clamp(fileTime, 0, to - 0.3)) } : { ...c, trimOut: r(clamp(fileTime, from + 0.3, c.duration)) }
            return withClips(v, clips)
          }),
        }),
        `vtrim:${sceneId}`,
        400,
      )
    },

    addClip(sceneId, clip) {
      patchScene(sceneId, (s) => {
        const active = s.videoVersions.find((v) => v.id === s.activeVideoVersionId)
        if (!active) {
          const version: VideoVersion = { id: uid('vv_'), ...clip, createdAt: nowIso() }
          return { ...s, videoVersions: [...s.videoVersions, version], activeVideoVersionId: version.id }
        }
        const clips = [...versionClips(active), { id: uid('vc_'), ...clip }]
        return { ...s, videoVersions: s.videoVersions.map((v) => (v.id === active.id ? withClips(v, clips) : v)) }
      })
    },

    removeClip(sceneId, clipId) {
      patchScene(sceneId, (s) => {
        const active = s.videoVersions.find((v) => v.id === s.activeVideoVersionId)
        if (!active) return s
        const clips = versionClips(active).filter((c) => c.id !== clipId)
        if (!clips.length) return s
        // Si se quita el primero, el siguiente toma su lugar sin cambiar el id de la versión.
        return { ...s, videoVersions: s.videoVersions.map((v) => (v.id === active.id ? withClips(v, clips) : v)) }
      })
    },

    moveClip(sceneId, clipId, dir) {
      patchScene(sceneId, (s) => {
        const active = s.videoVersions.find((v) => v.id === s.activeVideoVersionId)
        if (!active) return s
        const clips = versionClips(active)
        const i = clips.findIndex((c) => c.id === clipId)
        const j = i + dir
        if (i < 0 || j < 0 || j >= clips.length) return s
        ;[clips[i], clips[j]] = [clips[j], clips[i]]
        return { ...s, videoVersions: s.videoVersions.map((v) => (v.id === active.id ? withClips(v, clips) : v)) }
      })
    },

    addCustomField(name) {
      const cur = snap()
      const n = name.trim()
      if (!cur || !n) return
      const fields = cur.project.customFields ?? []
      if (fields.some((f) => f.name.toLowerCase() === n.toLowerCase())) return
      commit({ ...cur, project: { ...cur.project, customFields: [...fields, { id: uid('cf_'), name: n }] } })
    },

    renameCustomField(fieldId, name) {
      const cur = snap()
      if (!cur) return
      const customFields = (cur.project.customFields ?? []).map((f) => (f.id === fieldId ? { ...f, name } : f))
      commit({ ...cur, project: { ...cur.project, customFields } }, `field:${fieldId}`, 500)
    },

    removeCustomField(fieldId) {
      const cur = snap()
      if (!cur) return
      // Los textos se quedan guardados en las escenas: con deshacer el campo vuelve con todo.
      const customFields = (cur.project.customFields ?? []).filter((f) => f.id !== fieldId)
      commit({ ...cur, project: { ...cur.project, customFields } })
    },

    updateExtra(sceneId, fieldId, value) {
      patchScene(sceneId, (s) => ({ ...s, script: { ...s.script, extras: { ...(s.script.extras ?? {}), [fieldId]: value } } }), `extra:${sceneId}:${fieldId}`, 500)
    },

    async importScript(data, mode) {
      const settings = get().settings
      const base = mode === 'new' ? createProjectData(data.project.title) : get().project
      if (!base) return 0
      let fields: CustomField[] = [...(base.customFields ?? [])]
      const byName = new Map(fields.map((f) => [f.name.toLowerCase(), f]))
      const fieldFor = (name: string) => {
        const k = name.trim().toLowerCase()
        let f = byName.get(k)
        if (!f) {
          f = { id: uid('cf_'), name: name.trim() }
          byName.set(k, f)
          fields = [...fields, f]
        }
        return f
      }
      data.project.customFields.forEach(fieldFor)
      const characters = [...(base.characters ?? [])]
      for (const c of data.project.characters ?? []) {
        if (!characters.some((x) => x.name.trim().toLowerCase() === c.name.trim().toLowerCase()))
          characters.push({ id: uid('ch_'), name: c.name.trim(), description: c.description })
      }
      const style = base.style?.preset || base.style?.notes?.trim() ? base.style : data.project.style ? { notes: data.project.style } : base.style
      const newScenes = data.scenes.map((sc, i) => {
        const s = createScene(base.id, sc.title, sc.plannedDuration ?? settings.defaultDuration, { order: i, collapsed: true })
        const extras: Record<string, string> = {}
        for (const [name, value] of Object.entries(sc.script.extras ?? {})) extras[fieldFor(name).id] = value
        s.script = {
          action: sc.script.action,
          dialogue: sc.script.dialogue,
          cameraDirection: sc.script.cameraDirection,
          soundDirection: sc.script.soundDirection,
          generationPrompt: sc.script.generationPrompt,
          pronunciations: sc.script.pronunciations.map((p) => ({ id: uid('pr_'), written: p.written, spoken: p.spoken })),
          numbersToWords: sc.script.numbersToWords,
          camera: sc.script.camera,
          extras,
        }
        s.status = deriveStatus(s)
        return s
      })
      if (mode === 'append') await get().backupNow('before-import')
      if (mode === 'new') {
        const project: Project = { ...base, aspectRatio: data.project.aspectRatio, customFields: fields, characters, style, sceneIds: newScenes.map((s) => s.id) }
        await get().flushSave()
        await store.saveProject(project, newScenes) // una sola transacción: o todo o nada
        await loadInto(project, newScenes)
        return newScenes.length
      }
      const cur = snap()!
      const scenesMap = { ...cur.scenes }
      newScenes.forEach((s) => (scenesMap[s.id] = s))
      commit({ project: { ...cur.project, customFields: fields, characters, style, sceneIds: [...cur.project.sceneIds, ...newScenes.map((s) => s.id)] }, scenes: scenesMap })
      set({ selectedSceneId: newScenes[0]?.id ?? get().selectedSceneId })
      await get().flushSave()
      return newScenes.length
    },

    applySceneFromAI(sceneId, data, opts) {
      const cur = snap()
      const scene = cur?.scenes[sceneId]
      if (!cur || !scene) return
      let fields: CustomField[] = [...(cur.project.customFields ?? [])]
      const byName = new Map(fields.map((f) => [f.name.toLowerCase(), f]))
      const fieldFor = (name: string) => {
        const k = name.trim().toLowerCase()
        let f = byName.get(k)
        if (!f) {
          f = { id: uid('cf_'), name: name.trim() }
          byName.set(k, f)
          fields = [...fields, f]
        }
        return f
      }
      opts.customFields.forEach(fieldFor)
      const extras: Record<string, string> = { ...(scene.script.extras ?? {}) }
      for (const [name, value] of Object.entries(data.script.extras ?? {})) extras[fieldFor(name).id] = value
      const updated: Scene = {
        ...scene,
        title: data.title,
        plannedDuration: opts.keepDuration ? scene.plannedDuration : data.plannedDuration,
        script: {
          ...scene.script,
          action: data.script.action,
          dialogue: data.script.dialogue,
          cameraDirection: data.script.cameraDirection,
          soundDirection: data.script.soundDirection,
          generationPrompt: data.script.generationPrompt,
          pronunciations: data.script.pronunciations.map((p) => ({ id: uid('pr_'), written: p.written, spoken: p.spoken })),
          numbersToWords: data.script.numbersToWords,
          camera: data.script.camera ?? scene.script.camera,
          extras,
        },
        updatedAt: nowIso(),
      }
      updated.status = deriveStatus(updated)
      commit({ project: { ...cur.project, customFields: fields }, scenes: { ...cur.scenes, [sceneId]: updated } })
    },

    undo() {
      const { past, future, project, scenes } = get()
      if (!past.length || !project) return
      const prev = past[past.length - 1]
      lastCoalesce = null
      set({ project: prev.project, scenes: prev.scenes, past: past.slice(0, -1), future: [{ project, scenes }, ...future] })
      fixSelection()
      scheduleSave(0)
    },

    redo() {
      const { past, future, project, scenes } = get()
      if (!future.length || !project) return
      const next = future[0]
      lastCoalesce = null
      set({ project: next.project, scenes: next.scenes, past: [...past, { project, scenes }], future: future.slice(1) })
      fixSelection()
      scheduleSave(0)
    },

    async flushSave() {
      if (saveTimer) {
        clearTimeout(saveTimer)
        await runSave()
      } else if (saving) await saving
    },
  }

  function fixSelection() {
    const { selectedSceneId, scenes, project } = get()
    if (selectedSceneId && !scenes[selectedSceneId]) set({ selectedSceneId: project?.sceneIds[0] ?? null })
  }
})

// Guardar antes de cerrar la pestaña si quedó algo pendiente.
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', (e) => {
    if (saveTimer || saving) {
      void useProject.getState().flushSave()
      e.preventDefault()
    }
  })
}

// Respaldo automático cada 15 minutos, solo si hubo cambios desde el último.
if (typeof window !== 'undefined') {
  setInterval(() => {
    const { project, paused, backupNow } = useProject.getState()
    if (!project || paused || project.updatedAt === lastBackupAt) return
    backupNow('auto').catch((e) => console.error('Respaldo automático falló', e))
  }, BACKUP_EVERY_MS)
}
