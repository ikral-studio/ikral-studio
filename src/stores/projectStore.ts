// Única fuente de verdad del proyecto abierto. Todas las vistas derivan de aquí.
import { create } from 'zustand'
import type { AspectRatio, Project, Scene, ScriptField, Settings, VideoVersion } from '../types'
import { clamp, nowIso, uid } from '../utils'
import * as store from '../database/db'
import { cloneScene, createProjectData, createScene } from '../features/scene-management/factory'
import { deriveStatus } from '../features/script-sync/derive'
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
  addScene: (afterId?: string) => string | null
  duplicateScene: (id: string) => void
  deleteScene: (id: string) => void
  moveScene: (id: string, toIndex: number) => void
  updateScene: (id: string, patch: Partial<Scene>, coalesce?: string) => void
  updateScript: (id: string, field: ScriptField, value: string) => void
  setImage: (id: string, slot: 'start' | 'end', mediaId: string | undefined) => void
  addFrames: (id: string, mediaIds: string[]) => void
  removeFrame: (id: string, frameId: string) => void
  moveFrame: (id: string, frameId: string, dir: -1 | 1) => void
  addVideoVersion: (id: string, v: Omit<VideoVersion, 'id' | 'createdAt'>) => void
  replaceActiveVideo: (id: string, v: Omit<VideoVersion, 'id' | 'createdAt'>) => void
  setActiveVersion: (id: string, versionId: string) => void
  removeVersion: (id: string, versionId: string) => void
  updateVersion: (id: string, versionId: string, patch: Partial<VideoVersion>) => void
  addPronunciation: (id: string) => void
  updatePronunciation: (id: string, pid: string, patch: { written?: string; spoken?: string }) => void
  removePronunciation: (id: string, pid: string) => void

  undo: () => void
  redo: () => void
  flushSave: () => Promise<void>
}

const DEFAULT_SETTINGS: Settings = { defaultDuration: 8, fit: 'contain' }
const HISTORY_LIMIT = 100

// ---- control del guardado ----
let saveTimer: ReturnType<typeof setTimeout> | null = null
let dirtyVersion = 0
let savedVersion = 0
let saving: Promise<void> | null = null
let lastCoalesce: { key: string; at: number } | null = null

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

  async function loadInto(project: Project, scenes: Scene[]) {
    const map: Record<string, Scene> = {}
    scenes.forEach((s) => (map[s.id] = s))
    // Reparar: escenas huérfanas o IDs sin escena
    const ids = project.sceneIds.filter((id) => map[id])
    scenes.forEach((s) => !ids.includes(s.id) && ids.push(s.id))
    project = { ...project, sceneIds: ids }
    set({ project, scenes: map, selectedSceneId: ids[0] ?? null, past: [], future: [], saveState: 'saved' })
    await store.setKV('lastProjectId', project.id)
    store.collectGarbage(project.id, Object.values(map)).catch(() => {})
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

    addScene(afterId) {
      const cur = snap()
      if (!cur) return null
      const n = cur.project.sceneIds.length + 1
      const scene = createScene(cur.project.id, `Escena ${n}`, get().settings.defaultDuration)
      const ids = [...cur.project.sceneIds]
      const at = afterId ? ids.indexOf(afterId) + 1 : ids.length
      ids.splice(at > 0 ? at : ids.length, 0, scene.id)
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
