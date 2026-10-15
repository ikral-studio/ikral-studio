import { describe, expect, it } from 'vitest'
import { cameraPrompt, cameraSpanish } from '../features/camera/camera'
import { CAMERA_CATEGORIES } from '../features/camera/library'
import { DIAGRAMS } from '../features/camera/diagrams'
import { parseScriptText, EXAMPLE } from '../features/script-exchange/schema'

describe('biblioteca de cámara', () => {
  it('cada toma tiene dibujo y frase', () => {
    const all = CAMERA_CATEGORIES.flatMap((c) => c.items)
    expect(all.length).toBeGreaterThanOrEqual(70)
    for (const r of all) {
      expect(DIAGRAMS[r[0]], r[0]).toBeTypeOf('function')
      expect(DIAGRAMS[r[0]]()).toContain('<svg')
      expect(r[5].length).toBeGreaterThan(5)
    }
  })
  it('español para el guion, inglés con velocidad y negativos para el prompt', () => {
    const spec = { shot: 'ms', angle: 'low', move: 'orbit', speed: 'fast' as const }
    expect(cameraSpanish(spec)).toBe('Plano medio · Contrapicado · Orbital 360° (rápido)')
    const p = cameraPrompt(spec)
    expect(p).toMatch(/^Camera: medium shot/)
    expect(p).toContain('360-degree orbit')
    expect(p).toContain('fast and snappy')
    expect(p).toContain('no zoom, the subject does not spin')
  })
  it('el formato de IA acepta cámara válida y rechaza códigos inventados', () => {
    expect(parseScriptText(JSON.stringify(EXAMPLE)).ok).toBe(true)
    const bad = structuredClone(EXAMPLE) as unknown as { scenes: { script: { camera: Record<string, string> } }[] }
    bad.scenes[0].script.camera.move = 'super-giro'
    const r = parseScriptText(JSON.stringify(bad))
    expect(r.ok).toBe(false)
    expect((r as { errors: string[] }).errors.join()).toMatch(/Movimiento.*biblioteca/)
  })
})
