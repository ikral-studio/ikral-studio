import { describe, expect, it } from 'vitest'
import { findRanges, fold } from '../features/script-search/find'

describe('buscar en el guion', () => {
  it('sin acentos ni mayúsculas, mismas posiciones', () => {
    expect(fold('Menú ÑAPA')).toBe('menu napa')
    expect(fold('Doña Chuy').length).toBe('Doña Chuy'.length)
  })
  it('encuentra todas las coincidencias', () => {
    expect(findRanges('Sin cebolla, ¡SIN CEBOLLA!', 'cebolla')).toEqual([
      [4, 11],
      [18, 25],
    ])
    expect(findRanges('Le toman foto a su menú', 'menu')).toEqual([[19, 23]])
    expect(findRanges('algo', '  ')).toEqual([])
  })
})
