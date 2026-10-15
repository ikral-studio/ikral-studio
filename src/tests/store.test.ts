import { beforeAll, describe, expect, it } from 'vitest'
import { useProject } from '../stores/projectStore'
import { loadProject } from '../database/idb'

describe('store del proyecto', () => {
  beforeAll(async () => {
    await useProject.getState().init()
    await useProject.getState().newProject('Test')
  })
  it('agregar, reordenar, duplicar, eliminar y deshacer', async () => {
    const st = useProject.getState
    const a = st().addScene()!
    const b = st().addScene()!
    const c = st().addScene()!
    st().moveScene(c, 0)
    expect(st().project!.sceneIds).toEqual([c, a, b])
    st().duplicateScene(a)
    expect(st().project!.sceneIds).toHaveLength(4)
    st().deleteScene(b)
    expect(st().project!.sceneIds).not.toContain(b)
    st().undo()
    expect(st().project!.sceneIds).toContain(b)
    await st().flushSave()
    const saved = await loadProject(st().project!.id)
    expect(saved!.project.sceneIds).toEqual(st().project!.sceneIds)
    expect(st().saveState).toBe('saved')
  })
  it('el texto se agrupa en un solo paso de deshacer', () => {
    const st = useProject.getState
    const id = st().project!.sceneIds[0]
    const before = st().past.length
    st().updateScript(id, 'action', 'H')
    st().updateScript(id, 'action', 'Ho')
    st().updateScript(id, 'action', 'Hola')
    expect(st().past.length).toBe(before + 1)
    st().undo()
    expect(st().scenes[id].script.action).toBe('')
  })
})

describe('insertar escena', () => {
  it('entra en la posición pedida', () => {
    const st = useProject.getState
    const before = [...st().project!.sceneIds]
    const id = st().addScene(1)!
    expect(st().project!.sceneIds[1]).toBe(id)
    expect(st().project!.sceneIds.filter((x) => x !== id)).toEqual(before)
    expect(st().selectedSceneId).toBe(id)
  })
})

describe('cortar y estirar', () => {
  it('cortar música y estirar sus orillas sin pasarse del archivo', () => {
    const st = useProject.getState
    const tr = st().project!.audioTracks![0]
    st().addAudioClip(tr.id, { mediaId: 'm1', name: 'canción', start: 2, duration: 10, sourceDuration: 10 })
    expect(st().splitAudioAt(5)).toBe(1)
    const [a, b] = st().project!.audioTracks![0].clips
    expect([a.start, a.duration, a.offset ?? 0]).toEqual([2, 3, 0])
    expect([b.start, b.duration, b.offset]).toEqual([5, 7, 3])
    // estirar la parte 2 hacia la izquierda recupera el audio cortado, no más allá del inicio del archivo
    st().trimAudioClip(tr.id, b.id, 'left', 0)
    const b2 = st().project!.audioTracks![0].clips[1]
    expect([b2.start, b2.offset, b2.duration]).toEqual([2, 0, 10])
    // estirar a la derecha no pasa del largo del archivo
    st().trimAudioClip(tr.id, a.id, 'right', 99)
    expect(st().project!.audioTracks![0].clips[0].duration).toBe(10)
  })
  it('partir una escena con video en dos y estirar su recorte', () => {
    const st = useProject.getState
    const id = st().addScene()!
    st().addVideoVersion(id, { mediaId: 'v1', duration: 8 })
    const second = st().splitSceneAt(id, 3)!
    const v1 = st().scenes[id].videoVersions[0]
    const v2 = st().scenes[second].videoVersions[0]
    expect([v1.trimIn ?? 0, v1.trimOut]).toEqual([0, 3])
    expect([v2.trimIn, v2.trimOut]).toEqual([3, 8])
    expect(st().project!.sceneIds.indexOf(second)).toBe(st().project!.sceneIds.indexOf(id) + 1)
    st().trimVideo(second, 'left', 1)
    expect(st().scenes[second].videoVersions[0].trimIn).toBe(1)
    st().trimVideo(second, 'right', 50)
    expect(st().scenes[second].videoVersions[0].trimOut).toBe(8)
  })
})

import { placedClips, versionLength, clipAt } from '../features/script-sync/derive'
describe('varios videos en una escena', () => {
  it('se suman, se reproducen en orden y se cortan bien', () => {
    const st = useProject.getState
    const id = st().addScene()!
    st().addVideoVersion(id, { mediaId: 'a', duration: 4 })
    st().addClip(id, { mediaId: 'b', duration: 6 })
    const v = () => st().scenes[id].videoVersions[0]
    expect(versionLength(v())).toBe(10)
    expect(clipAt(v(), 5)).toMatchObject({ index: 1, start: 4 })
    st().moveClip(id, placedClips(v())[1].clip.id, -1)
    expect(placedClips(v()).map((p) => p.clip.mediaId)).toEqual(['b', 'a'])
    // estirar: la orilla derecha toca el último video
    st().trimVideo(id, 'right', 3)
    expect(versionLength(v())).toBe(9)
    // cortar a los 7 s: parte 1 = b(6) + 1 s de a; parte 2 = 2 s de a
    const second = st().splitSceneAt(id, 7)!
    expect(versionLength(v())).toBeCloseTo(7)
    expect(versionLength(st().scenes[second].videoVersions[0])).toBeCloseTo(2)
    st().removeClip(id, placedClips(v())[0].clip.id)
    expect(placedClips(v()).map((p) => p.clip.mediaId)).toEqual(['a'])
  })
})
