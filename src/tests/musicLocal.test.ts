import { describe, expect, it } from 'vitest'
import { buildSongRequest, parseResult } from '../features/music-local/acestep'
import { songTitle } from '../features/music-local/generate'
import { mediaIdsOf } from '../database/idb'
import type { Project } from '../types'

describe('música gratis en la Mac (ACE-Step)', () => {
  it('sin letra va instrumental; con letra, en español', () => {
    const r = buildSongRequest({ style: ' cumbia, acordeón ', lyrics: '  ', seconds: 30 })
    expect(r).toMatchObject({ prompt: 'cumbia, acordeón', lyrics: '[Instrumental]', vocal_language: 'es', audio_duration: 30, audio_format: 'mp3', thinking: false })
    expect(buildSongRequest({ style: 'pop', lyrics: '[verse]\nhola', seconds: 60 }).lyrics).toBe('[verse]\nhola')
  })

  it('duración entre 10 s y 4 min', () => {
    expect(buildSongRequest({ style: 'x', lyrics: '', seconds: 3 }).audio_duration).toBe(10)
    expect(buildSongRequest({ style: 'x', lyrics: '', seconds: 900 }).audio_duration).toBe(240)
  })

  it('lee el resultado de /query_result (texto JSON)', () => {
    const res = JSON.stringify([{ file: '/v1/audio?path=%2Fa.mp3', status: 1, progress: 1, stage: 'succeeded' }])
    expect(parseResult(res)[0].file).toBe('/v1/audio?path=%2Fa.mp3')
    expect(parseResult('roto')).toEqual([])
  })

  it('título corto desde el estilo', () => {
    expect(songTitle('cumbia alegre, acordeón')).toBe('Cumbia alegre')
    expect(songTitle('   ')).toBe('Canción')
  })

  it('las canciones de la biblioteca no se limpian aunque no estén en el timeline', () => {
    const p = { audioTracks: [], songs: [{ id: 'sg_1', mediaId: 'md_song' }] } as unknown as Project
    expect(mediaIdsOf(p, [])).toContain('md_song')
  })
})
