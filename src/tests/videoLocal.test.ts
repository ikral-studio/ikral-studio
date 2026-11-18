import { describe, expect, it } from 'vitest'
import { buildWorkflow, frameCount, videoSize } from '../features/video-local/comfy'
import { scenePrompt } from '../features/video-local/generate'

describe('video gratis en la Mac (LTX-Video)', () => {
  it('cuadros 8n+1 entre 2 y 8 segundos', () => {
    expect(frameCount(4)).toBe(97)
    expect(frameCount(0)).toBe(97)
    expect(frameCount(1)).toBe(49)
    expect(frameCount(30)).toBe(193)
    for (const s of [2, 3.3, 5, 7.9]) expect((frameCount(s) - 1) % 8).toBe(0)
  })

  it('medidas múltiplos de 32 según la orientación', () => {
    expect(videoSize('16:9')).toEqual({ width: 640, height: 352 })
    expect(videoSize('9:16')).toEqual({ width: 352, height: 640 })
  })

  it('la imagen inicial va al cuadro 0 y la final al último', () => {
    const w = buildWorkflow({ startImage: 'a.png', endImage: 'b.png', prompt: 'hola', aspect: '16:9', seconds: 4, seed: 1, prefix: 'x' })
    expect(w['20'].inputs).toEqual({ image: 'a.png' })
    expect(w['21'].inputs).toEqual({ image: 'b.png' })
    expect(w['22'].inputs.frame_idx).toBe(0)
    expect(w['22'].inputs.image).toEqual(['25', 0])
    expect(w['23'].inputs.frame_idx).toBe(-1)
    expect(w['23'].inputs.image).toEqual(['26', 0])
    expect(w['6'].inputs).toMatchObject({ width: 640, height: 352, length: 97 })
  })

  it('prompt: el de generación o, si falta, título y acción', () => {
    expect(scenePrompt({ title: 'T', script: { generationPrompt: ' P ', action: 'A' } })).toBe('P')
    expect(scenePrompt({ title: 'T', script: { generationPrompt: '', action: 'A' } })).toBe('T. A')
  })
})
