import { describe, expect, it } from 'vitest'
import { toFcpxml, toXmeml, type NleTimeline } from '../features/projects/nleExport'
import type { MediaRecord } from '../types'

const rec = (name: string, mimeType: string): MediaRecord => ({
  id: name, projectId: 'p', name, mimeType, size: 1, kind: 'video', createdAt: '', blob: new Blob(), width: 640, height: 360,
})
const v = { id: 'file-1', rec: rec('a & b.mp4', 'video/mp4'), path: 'media/001-a-b.mp4', frames: 120, kind: 'video' as const }
const m = { id: 'file-2', rec: rec('m.mp3', 'audio/mpeg'), path: 'media/002-m.mp3', frames: 180, kind: 'audio' as const }
const tl: NleTimeline = {
  width: 1920, height: 1080, duration: 210,
  files: [v, m],
  video: [
    { name: 'Escena 1', file: v, start: 0, len: 45, srcIn: 0, hasAudio: true },
    { name: 'Escena 2 <parte 2>', file: v, start: 45, len: 75, srcIn: 45, hasAudio: true },
  ],
  audio: [
    { name: 'Escena 1', file: v, start: 0, len: 45, srcIn: 0, track: 1 },
    { name: 'Escena 2', file: v, start: 45, len: 75, srcIn: 45, track: 1 },
    { name: 'musica', file: m, start: 30, len: 180, srcIn: 0, track: 2 },
  ],
}
const parse = (xml: string) => {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  expect(doc.querySelector('parsererror')).toBeNull()
  return doc
}

describe('exportar para editores', () => {
  it('FCP7 XML válido: cortes, recortes y música', () => {
    const doc = parse(toXmeml(tl, 'Promo & cía'))
    const vclips = doc.querySelectorAll('video > track > clipitem')
    expect(vclips).toHaveLength(2)
    expect(vclips[1].querySelector('in')!.textContent).toBe('45')
    expect(vclips[1].querySelector('start')!.textContent).toBe('45')
    expect(doc.querySelectorAll('audio > track')).toHaveLength(2)
    expect(doc.querySelectorAll('file[id="file-1"] > pathurl')).toHaveLength(1)
  })
  it('FCPXML válido: línea principal y música conectada', () => {
    const doc = parse(toFcpxml(tl, 'Promo'))
    const clips = doc.querySelectorAll('spine > asset-clip')
    expect(clips).toHaveLength(2)
    expect(clips[1].getAttribute('start')).toBe('45/30s')
    const music = doc.querySelector('asset-clip[lane="-1"]')!
    // la música empieza en el cuadro 30, dentro de la escena 1 (que inicia en 0 con start 0)
    expect(music.getAttribute('offset')).toBe('30/30s')
  })
})
