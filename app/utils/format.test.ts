import { describe, expect, it } from 'vitest'
import { pathText, pieces } from './format'

describe('format', () => {
  it('joins a location path with slashes', () => {
    expect(pathText([{ name: 'Склад 1' }, { name: 'Полка 01' }])).toBe('Склад 1 / Полка 01')
    expect(pathText([])).toBe('')
  })

  it('prints pieces', () => {
    expect(pieces(5)).toBe('5 шт.')
  })
})
