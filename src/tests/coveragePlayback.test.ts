// Fase 2c: línea de tiempo, reproductor y NLE plano por plano.
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { buildSegments, deriveStatus, effectiveDuration, locateTime, placeInScene, shotParts, totalDuration, trimEdge } from '../features/script-sync/derive'
import { createScene } from '../features/scene-management/factory'
import { useProject } from '../stores/projectStore'
import { restoreFromTrash } from '../features/trash/trash'
import type { MediaRecord, Scene, Shot, VideoVersion } from '../types'

vi.mock('../features/media-library/media', async (orig) => ({
  ...(await orig<typeof import('../features/media-library/media')>()),
  getMediaBlob: async (id: string): Promise<MediaRecord> => ({ id, projectId: 'p', name: `${id}.mp4`, mimeType: id.startsWith('img') ? 'image/png' : 'video/mp4', size: 1, kind: 'video', createdAt: '', blob: new Blob() }),
}))
const { buildNleTimeline } = await import('../features/projects/nleExport')

const T = '2026-10-24T10:00:00.000Z'
const vv = (id: string, duration: number, extra: Partial<VideoVersion> = {}): VideoVersion => ({ id, mediaId: `vid-${id}`, duration, createdAt: T, ...extra })
const shot = (id: string, order: number, duration: number, extra: Partial<Shot> = {}): Shot => ({ id, order, name: id, duration, updatedAt: T, ...extra })

/** Escena de Doña Chuy con 3 planos: el 2 tiene video recortado a 4 s. */
function coverageScene(): Scene {
  return createScene('p', 'Cocina', 10, {
    // la escena conserva su video viejo, pero con cobertura NO se toca
    videoVersions: [vv('old', 9)],
    activeVideoVersionId: 'old',
    shots: [
      shot('a', 0, 3, { startImageId: 'img-a' }),
      shot('b', 1, 2, { videoVersions: [vv('vb', 6, { trimIn: 1, trimOut: 5 })], activeVideoVersionId: 'vb' }),
      shot('c', 2, 3),
    ],
  })
}

describe('planos en la línea de tiempo y el reproductor', () => {
  it('escena vieja (sin planos): un tramo con su video y la misma duración de siempre', () => {
    const old = createScene('p', 'Vieja', 8, { videoVersions: [vv('v1', 5)], activeVideoVersionId: 'v1' })
    const parts = shotParts(old)
    expect(parts).toHaveLength(1)
    expect(parts[0]).toMatchObject({ index: 0, start: 0, duration: 5 })
    expect(parts[0].video?.id).toBe('v1')
    expect(buildSegments([old])[0].video?.id).toBe('v1')
    expect(effectiveDuration(createScene('p', 'Sin video', 8))).toBe(8)
  })

  it('duración de la escena = suma de sus planos (con el video recortado) y la línea de tiempo cuadra', () => {
    const sc = coverageScene()
    const parts = shotParts(sc)
    expect(parts.map((p) => [p.start, p.duration])).toEqual([[0, 3], [3, 4], [7, 3]])
    expect(effectiveDuration(sc)).toBe(10)
    const segs = buildSegments([createScene('p', 'Antes', 5), sc, createScene('p', 'Después', 2)])
    expect(segs[1]).toMatchObject({ start: 5, end: 15, duration: 10 })
    // el video viejo de la escena no se reproduce cuando hay planos
    expect(segs[1].video).toBeUndefined()
    expect(totalDuration(segs)).toBe(17)
    expect(segs[1].parts.reduce((a, p) => a + p.duration, 0)).toBe(segs[1].duration)
  })

  it('reproduce plano por plano: sin video = storyboard; con video = su tramo, contado desde la escena', () => {
    const [seg] = buildSegments([coverageScene()])
    expect(placeInScene(seg, 1)).toMatchObject({ part: { index: 0 } })
    expect(placeInScene(seg, 1).placed).toBeUndefined()
    const mid = placeInScene(seg, 4.5)
    expect(mid.part.index).toBe(1)
    // empieza a los 3 s de la escena y usa del segundo 1 al 5 del archivo
    expect(mid.placed).toMatchObject({ start: 3, from: 1, to: 5, length: 4 })
    expect(placeInScene(seg, 8).part.index).toBe(2)
    expect(placeInScene(seg, 99).part.index).toBe(2)
    expect(locateTime(buildSegments([coverageScene()]), 8)).toEqual({ index: 0, offset: 8 })
  })

  it('estado: «video importado» solo cuando todos los planos tienen video', () => {
    const sc = coverageScene()
    expect(deriveStatus(sc)).not.toBe('video-imported')
    const all = { ...sc, shots: sc.shots!.map((s) => ({ ...s, videoVersions: [vv(`v${s.id}`, 2)], activeVideoVersionId: `v${s.id}` })) }
    expect(deriveStatus(all)).toBe('video-imported')
  })

  it('recortar una orilla no daña el archivo y respeta el mínimo', () => {
    const v = vv('t', 6)
    expect(trimEdge(v, 'left', 2)).toMatchObject({ trimIn: 2 })
    expect(trimEdge(v, 'right', 0.1)).toMatchObject({ trimOut: 0.3 })
    expect(trimEdge(v, 'right', 9)).toMatchObject({ trimOut: 6 })
  })
})

describe('exportar a editores (NLE): un clip por plano', () => {
  it('cada plano es un clip en su lugar; sin video, su imagen de storyboard', async () => {
    const sc = coverageScene()
    const tl = await buildNleTimeline({ id: 'p', title: 'P', aspectRatio: '16:9', sceneIds: [sc.id], createdAt: T, updatedAt: T }, [sc])
    expect(tl.video.map((v) => [v.name, v.start, v.len, v.srcIn])).toEqual([
      ['Escena 1 · Plano 1 · a (storyboard)', 0, 90, 0],
      ['Escena 1 · Plano 2 · b', 90, 120, 30],
    ])
    // el plano 3 no tiene video ni imagen: queda hueco, pero la duración total cuadra
    expect(tl.duration).toBe(300)
    expect(tl.audio.filter((a) => a.track === 1)).toHaveLength(1)
  })

  it('escena sin planos se exporta igual que antes', async () => {
    const sc = createScene('p', 'Vieja', 8, { videoVersions: [vv('v1', 5)], activeVideoVersionId: 'v1' })
    const tl = await buildNleTimeline({ id: 'p', title: 'P', aspectRatio: '16:9', sceneIds: [sc.id], createdAt: T, updatedAt: T }, [sc])
    expect(tl.video.map((v) => [v.name, v.start, v.len])).toEqual([['Escena 1 · Vieja', 0, 150]])
  })
})

describe('videos de los planos en el store', () => {
  const st = useProject.getState
  beforeAll(async () => {
    await st().init()
    await st().newProject('Cobertura 2c')
  })

  it('importar, otro video, cambiar versión, recortar y quitar a la papelera (y recuperar)', async () => {
    const id = st().addScene()!
    await st().convertToCoverage(id)
    const p2 = st().addShot(id)!
    const shotOf = () => st().scenes[id].shots!.find((s) => s.id === p2)!
    const before = shotOf().updatedAt
    await new Promise((r) => setTimeout(r, 5))
    st().addShotVideo(id, p2, { mediaId: 'm1', duration: 4 })
    expect(shotOf().videoVersions).toHaveLength(1)
    expect(shotOf().updatedAt > before).toBe(true)
    const v1 = shotOf().activeVideoVersionId!
    st().addShotVideo(id, p2, { mediaId: 'm2', duration: 2 }, 'clip')
    expect(shotParts(st().scenes[id])[1].duration).toBe(6)
    st().addShotVideo(id, p2, { mediaId: 'm3', duration: 5 })
    const v2 = shotOf().activeVideoVersionId!
    expect(v2).not.toBe(v1)
    st().setShotActiveVersion(id, p2, v1)
    expect(shotOf().activeVideoVersionId).toBe(v1)
    st().trimShotVideo(id, p2, 'left', 1)
    expect(shotParts(st().scenes[id])[1].duration).toBe(5)
    // La escena (con cobertura) no se parte con la tijera.
    expect(st().splitSceneAt(id, 1)).toBeNull()
    st().removeShotVersion(id, p2, v1)
    expect(shotOf().videoVersions!.map((v) => v.id)).toEqual([v2])
    expect(shotOf().activeVideoVersionId).toBe(v2)
    const entry = st().project!.trash!.find((e) => e.kind === 'version' && e.shotId === p2)!
    expect(entry).toBeTruthy()
    const back = restoreFromTrash(st().project!, st().scenes, entry.id)
    if ('error' in back) throw new Error(back.error)
    expect(back.scenes[id].shots!.find((s) => s.id === p2)!.videoVersions!.map((v) => v.id)).toEqual([v2, v1])
  })
})
