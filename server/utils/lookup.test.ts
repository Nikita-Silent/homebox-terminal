import { describe, expect, it } from 'vitest'
import { looksLikeAssetId, parseScannedCode } from './lookup'

const UUID = '3a89f538-a5d0-40fa-b213-d7539cf2eb61'

describe('parseScannedCode', () => {
  it('reads Homebox item and location label URLs as entity ids', () => {
    expect(parseScannedCode(`https://homebox.local/item/${UUID}`)).toEqual({ kind: 'entity', id: UUID })
    expect(parseScannedCode(`http://hb/location/${UUID.toUpperCase()}/`)).toEqual({ kind: 'entity', id: UUID })
    expect(parseScannedCode(`  ${UUID}  `)).toEqual({ kind: 'entity', id: UUID })
  })

  it('reads asset-id label URLs', () => {
    expect(parseScannedCode('https://homebox.local/a/000-011')).toEqual({ kind: 'asset', assetId: '000-011' })
    expect(parseScannedCode('https://homebox.local/a/11/')).toEqual({ kind: 'asset', assetId: '11' })
  })

  it('accepts bare asset ids in every Homebox spelling', () => {
    for (const code of ['000-011', '000011', '11']) {
      expect(parseScannedCode(code)).toEqual({ kind: 'asset', assetId: code })
    }
  })

  it('treats anything else (EAN, serial, words) as search text', () => {
    expect(parseScannedCode('4600000000017')).toEqual({ kind: 'text', text: '4600000000017' })
    expect(parseScannedCode(' SN-ABC 123 ')).toEqual({ kind: 'text', text: 'SN-ABC 123' })
    expect(parseScannedCode('Крокодилы')).toEqual({ kind: 'text', text: 'Крокодилы' })
  })
})

describe('looksLikeAssetId', () => {
  it('matches only asset-id shapes', () => {
    expect(looksLikeAssetId('000-011')).toBe(true)
    expect(looksLikeAssetId(' 42 ')).toBe(true)
    expect(looksLikeAssetId('1234567')).toBe(false)
    expect(looksLikeAssetId('00-011')).toBe(false)
    expect(looksLikeAssetId('abc')).toBe(false)
  })
})
