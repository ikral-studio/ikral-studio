import { describe, expect, it } from 'vitest'
import { ACCENTS, accentFor } from '../components/common/accents'

describe('color de acento', () => {
  it('da los 4 colores en orden', () => {
    expect([0, 1, 2, 3].map(accentFor)).toEqual(['#2563eb', '#7c3aed', '#ea7a12', '#16a34a'])
    expect(ACCENTS).toHaveLength(4)
  })

  it('repite el ciclo desde el quinto', () => {
    expect([4, 5, 6, 7].map(accentFor)).toEqual(ACCENTS)
    expect(accentFor(9)).toBe(accentFor(1))
  })
})
