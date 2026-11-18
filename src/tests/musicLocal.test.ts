import { describe, expect, it } from 'vitest'
import { buildSongRequest, parseResult, songBody } from '../features/music-local/acestep'
import { songName, songTitle } from '../features/music-local/generate'
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

  it('mi audio: copiar estilo = reference_audio; otra versión y pedazo = src_audio', () => {
    const blob = new Blob(['x'], { type: 'audio/mpeg' })
    const style = songBody({ style: 'rock', lyrics: '', seconds: 30, audio: { blob, name: 'a.mp3', mode: 'style' } }) as FormData
    expect(style.get('reference_audio')).toBeTruthy()
    expect(style.get('task_type')).toBeNull()
    const cover = songBody({ style: 'rock', lyrics: '', seconds: 30, audio: { blob, name: 'a.mp3', mode: 'cover' } }) as FormData
    expect(cover.get('src_audio')).toBeTruthy()
    expect(cover.get('task_type')).toBe('cover')
    const piece = buildSongRequest({ style: 'rock', lyrics: '', seconds: 30, audio: { blob, name: 'a.mp3', mode: 'repaint', from: 5, to: 12 } })
    expect(piece).toMatchObject({ task_type: 'repaint', repainting_start: 5, repainting_end: 12 })
    expect(songBody({ style: 'rock', lyrics: '', seconds: 30 })).not.toBeInstanceOf(FormData)
  })

  it('separar y agregar usan el modelo base con la pista escogida', () => {
    const blob = new Blob(['x'])
    const ex = buildSongRequest({ style: '', lyrics: '', seconds: 30, audio: { blob, name: 'Cumbia.mp3', mode: 'extract', track: 'vocals' } })
    expect(ex).toMatchObject({ task_type: 'extract', track_name: 'vocals', model: 'acestep-v15-base' })
    const lego = buildSongRequest({ style: 'trumpet', lyrics: '', seconds: 30, audio: { blob, name: 'Cumbia.mp3', mode: 'lego', track: 'brass' } })
    expect(lego).toMatchObject({ task_type: 'lego', track_name: 'brass', repainting_end: -1 })
    expect(songName({ style: '', lyrics: '', seconds: 30, audio: { blob, name: 'Cumbia.mp3', mode: 'extract', track: 'vocals' } })).toBe('Cumbia · solo voz')
    expect(songName({ style: '', lyrics: '', seconds: 30, audio: { blob, name: 'Cumbia.mp3', mode: 'lego', track: 'brass' } })).toBe('Cumbia + metales')
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
