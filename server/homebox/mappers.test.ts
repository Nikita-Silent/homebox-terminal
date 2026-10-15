import { describe, expect, it } from 'vitest'
import type { HbEntity } from './types'
import { createFakeHomebox } from '../services/transfers/fake-homebox'
import { toItemDetail, toItemSummary, toLocationRef, toLocationTree } from './mappers'

function entity(extra: Partial<HbEntity> = {}): HbEntity {
  const hb = createFakeHomebox()
  hb.addLocation('shelf', 'Полка 01')
  hb.addItem('item', 'D-Link DGS-1005C', 'shelf', { quantity: 3, manufacturer: 'D-Link', modelNumber: 'DGS-1005C', ...extra })
  return hb.get('item')!
}

describe('toItemSummary', () => {
  it('keeps what the terminal shows and nothing else', () => {
    const summary = toItemSummary(entity({ imageId: 'img-1', notes: 'secret' }))
    expect(summary).toEqual({
      id: 'item',
      name: 'D-Link DGS-1005C',
      assetId: expect.any(String),
      quantity: 3,
      manufacturer: 'D-Link',
      modelNumber: 'DGS-1005C',
      location: { id: 'shelf', name: 'Полка 01' },
      hasImage: true,
      imageId: 'img-1',
    })
  })

  it('handles list summaries without model fields, parent or photo', () => {
    const { manufacturer: _m, modelNumber: _n, ...bare } = entity({ parent: null, imageId: '' })
    expect(toItemSummary(bare as HbEntity)).toMatchObject({ manufacturer: '', modelNumber: '', location: null, hasImage: false, imageId: null })
  })
})

describe('toItemDetail', () => {
  it('drops the item itself from its Homebox path', () => {
    const detail = toItemDetail(entity({ serialNumber: 'SN1' }), [
      { id: 'wh', name: 'Склад 1', type: 'location' },
      { id: 'shelf', name: 'Полка 01', type: 'location' },
      { id: 'item', name: 'D-Link DGS-1005C', type: 'item' },
    ])
    expect(detail.locationPath).toEqual([{ id: 'wh', name: 'Склад 1' }, { id: 'shelf', name: 'Полка 01' }])
    expect(detail.serialNumber).toBe('SN1')
  })
})

describe('toLocationTree', () => {
  it('keeps locations only, recursively', () => {
    expect(toLocationTree([
      { id: 'a', name: 'Склад', type: 'location', children: [
        { id: 'b', name: 'Полка', type: 'location', children: null },
        { id: 'c', name: 'Коробка с вещью', type: 'item', children: [] },
      ] },
    ])).toEqual([{ id: 'a', name: 'Склад', children: [{ id: 'b', name: 'Полка', children: [] }] }])
    expect(toLocationTree(null)).toEqual([])
  })
})

describe('toLocationRef', () => {
  it('maps a parent or null', () => {
    expect(toLocationRef({ id: 'x', name: 'X' })).toEqual({ id: 'x', name: 'X' })
    expect(toLocationRef(null)).toBeNull()
    expect(toLocationRef(undefined)).toBeNull()
  })
})
