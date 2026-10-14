import { beforeEach, describe, expect, it } from 'vitest'
import type { TransferInput } from '../../../shared/types/terminal'
import { HomeboxError } from '../../homebox/client'
import { createFakeHomebox } from './fake-homebox'
import { createSqliteJournal } from './journal'
import { copyMarker, createTransferService } from './service'
import { TransferError } from './types'

let hb: ReturnType<typeof createFakeHomebox>
let journal: ReturnType<typeof createSqliteJournal>
let service: ReturnType<typeof createTransferService>
let opCounter = 0

function input(overrides: Partial<TransferInput> = {}): TransferInput {
  return {
    opId: `op-${++opCounter}`,
    itemId: 'switches',
    targetLocationId: 'shelf-b',
    quantity: 1,
    expectedQuantity: 3,
    expectedLocationId: 'shelf-a',
    mergeIntoId: null,
    ...overrides,
  }
}

/** Fails the given call once: either before it reaches Homebox, or after it was applied (lost response). */
function failOnce(method: string, when: 'before' | 'after', status = 0, match?: (args: unknown[]) => boolean) {
  let fired = false
  hb.setFault((m, args, w) => {
    if (!fired && m === method && w === when && (!match || match(args))) {
      fired = true
      throw new HomeboxError(status, 'injected failure')
    }
  })
}

function totalQuantity(name: string) {
  return hb.items().filter(i => i.name.endsWith(name)).reduce((sum, i) => sum + i.quantity, 0)
}

beforeEach(() => {
  hb = createFakeHomebox()
  hb.addLocation('wh1', 'Склад 1')
  hb.addLocation('shelf-a', 'Полка 01', 'wh1')
  hb.addLocation('wh2', 'Склад 2')
  hb.addLocation('shelf-b', 'Полка 01', 'wh2')
  hb.addItem('switches', 'D-Link DGS-1005C', 'shelf-a', {
    quantity: 3,
    manufacturer: 'D-Link',
    modelNumber: 'DGS-1005C',
    notes: 'партия 2025',
    fields: [{ name: 'Инв. номер', type: 'text', textValue: 'INV-42' }],
  })
  hb.addItem('router', 'TP-Link ER605', 'shelf-a', { quantity: 1, modelNumber: 'ER605', manufacturer: 'TP-Link' })
  journal = createSqliteJournal(':memory:')
  service = createTransferService({ homebox: hb.port, journal })
})

describe('whole transfer', () => {
  it('moves the item and keeps its identity', async () => {
    const result = await service.execute(input({ itemId: 'router', quantity: 1, expectedQuantity: 1 }))

    expect(result).toMatchObject({ status: 'done', kind: 'whole', target: { id: 'router', quantity: 1 } })
    expect(hb.get('router')!.parent!.id).toBe('shelf-b')
    expect(hb.items()).toHaveLength(2)
  })

  it('moves the whole quantity without merging', async () => {
    const result = await service.execute(input({ quantity: 3 }))

    expect(result.kind).toBe('whole')
    expect(hb.get('switches')).toMatchObject({ quantity: 3, parent: { id: 'shelf-b' } })
  })
})

describe('split (new Item at target)', () => {
  it('creates a copy with the moved quantity and keeps all data', async () => {
    const result = await service.execute(input())

    expect(result.status).toBe('done')
    expect(result.source.quantity).toBe(2)
    const copy = hb.get(result.target!.id)!
    expect(copy).toMatchObject({
      name: 'D-Link DGS-1005C',
      quantity: 1,
      parent: { id: 'shelf-b' },
      modelNumber: 'DGS-1005C',
      notes: 'партия 2025',
    })
    expect(copy.fields).toEqual([{ name: 'Инв. номер', type: 'text', textValue: 'INV-42' }])
    expect(hb.get('switches')!.quantity).toBe(2)
    expect(totalQuantity('DGS-1005C')).toBe(3)
  })
})

describe('merge (add to existing Item at target)', () => {
  beforeEach(() => {
    hb.addItem('switches-b', 'D-Link DGS-1005C', 'shelf-b', { quantity: 2, manufacturer: 'D-Link', modelNumber: 'DGS-1005C' })
  })

  it('adds the quantity to the matching Item', async () => {
    const result = await service.execute(input({ mergeIntoId: 'switches-b' }))

    expect(result).toMatchObject({ status: 'done', kind: 'merge', target: { id: 'switches-b', quantity: 3 } })
    expect(hb.get('switches')!.quantity).toBe(2)
    expect(hb.get('switches-b')!.quantity).toBe(3)
    expect(hb.items()).toHaveLength(3)
  })

  it('suggests the single matching Item in the preview', async () => {
    const { mergeIntoId: _, opId: __, ...previewInput } = input()
    const preview = await service.preview(previewInput)

    expect(preview.kind).toBe('merge')
    expect(preview.suggestedMergeIntoId).toBe('switches-b')
    expect(preview.target.path.map(p => p.name)).toEqual(['Склад 2', 'Полка 01'])
  })

  it('does not suggest a merge when several Items match', async () => {
    hb.addItem('switches-c', 'D-Link DGS-1005C (б/у)', 'shelf-b', { quantity: 4, manufacturer: 'D-Link', modelNumber: 'DGS-1005C' })
    const { mergeIntoId: _, opId: __, ...previewInput } = input()
    const preview = await service.preview(previewInput)

    expect(preview.kind).toBe('split')
    expect(preview.mergeCandidates.map(c => c.id).sort()).toEqual(['switches-b', 'switches-c'])
  })

  it('refuses to merge into a different product', async () => {
    hb.addItem('other', 'D-Link DGS-1008A', 'shelf-b', { quantity: 5, manufacturer: 'D-Link', modelNumber: 'DGS-1008A' })

    await expect(service.execute(input({ mergeIntoId: 'other' }))).rejects.toMatchObject({ code: 'VALIDATION' })
    expect(hb.get('other')!.quantity).toBe(5)
  })

  it('matches by exact name when there is no model', async () => {
    hb.addItem('clips', 'Крокодилы', 'shelf-a', { quantity: 50 })
    hb.addItem('clips-b', 'Крокодилы', 'shelf-b', { quantity: 25 })
    hb.addItem('clips-c', 'Крокодилы большие', 'shelf-b', { quantity: 5 })
    const preview = await service.preview({
      itemId: 'clips',
      targetLocationId: 'shelf-b',
      quantity: 10,
      expectedQuantity: 50,
      expectedLocationId: 'shelf-a',
    })

    expect(preview.suggestedMergeIntoId).toBe('clips-b')
  })
})

describe('individually tracked records (quantity 1) are never merged', () => {
  it('moves ABS-6000 ×1 next to another ABS-6000 ×1 as a separate record', async () => {
    hb.addItem('abs-1', 'ABS-6000', 'shelf-a', { quantity: 1, modelNumber: 'ABS-6000' })
    hb.addItem('abs-2', 'ABS-6000', 'shelf-b', { quantity: 1, modelNumber: 'ABS-6000' })
    const base = { itemId: 'abs-1', quantity: 1, expectedQuantity: 1, expectedLocationId: 'shelf-a', targetLocationId: 'shelf-b' }

    const preview = await service.preview(base)
    expect(preview).toMatchObject({ kind: 'whole', mergeCandidates: [], suggestedMergeIntoId: null })

    await expect(service.execute(input({ ...base, mergeIntoId: 'abs-2' }))).rejects.toMatchObject({ code: 'VALIDATION' })
    const result = await service.execute(input(base))
    expect(result.kind).toBe('whole')
    expect(hb.get('abs-1')).toMatchObject({ quantity: 1, parent: { id: 'shelf-b' } })
    expect(hb.get('abs-2')).toMatchObject({ quantity: 1, parent: { id: 'shelf-b' } })
  })

  it('does not add part of a quantity record into a ×1 record', async () => {
    hb.addItem('single', 'D-Link DGS-1005C', 'shelf-b', { quantity: 1, manufacturer: 'D-Link', modelNumber: 'DGS-1005C' })
    const { mergeIntoId: _, opId: __, ...previewInput } = input()

    const preview = await service.preview(previewInput)
    expect(preview).toMatchObject({ kind: 'split', mergeCandidates: [] })
    await expect(service.execute(input({ mergeIntoId: 'single' }))).rejects.toMatchObject({ code: 'VALIDATION' })

    const result = await service.execute(input())
    expect(result.kind).toBe('split')
    expect(hb.get('single')!.quantity).toBe(1)
  })
})

describe('whole-quantity merge of a quantity record', () => {
  beforeEach(() => {
    hb.addItem('clips', 'Крокодилы', 'shelf-a', { quantity: 50 })
    hb.addItem('clips-b', 'Крокодилы', 'shelf-b', { quantity: 25 })
  })

  const base = { itemId: 'clips', quantity: 50, expectedQuantity: 50, expectedLocationId: 'shelf-a' }

  it('adds everything to the matching record and deletes the empty source', async () => {
    const preview = await service.preview({ ...base, targetLocationId: 'shelf-b' })
    expect(preview).toMatchObject({ kind: 'merge', suggestedMergeIntoId: 'clips-b' })

    const result = await service.execute(input({ ...base, mergeIntoId: 'clips-b' }))
    expect(result).toMatchObject({
      status: 'done',
      kind: 'merge',
      sourceRemoved: true,
      source: { quantity: 0 },
      target: { id: 'clips-b', quantity: 75 },
    })
    expect(hb.get('clips')).toBeUndefined()
    expect(hb.get('clips-b')!.quantity).toBe(75)
  })

  it('moves the record itself when the user opts for a separate record', async () => {
    const result = await service.execute(input({ ...base, mergeIntoId: null }))

    expect(result).toMatchObject({ kind: 'whole', sourceRemoved: false })
    expect(hb.get('clips')).toMatchObject({ quantity: 50, parent: { id: 'shelf-b' } })
  })

  it('completes once when the delete response was lost', async () => {
    failOnce('deleteEntity', 'after')
    const request = input({ ...base, mergeIntoId: 'clips-b' })
    expect((await service.execute(request)).status).toBe('pending')

    const result = await service.execute(request)
    expect(result).toMatchObject({ status: 'done', sourceRemoved: true })
    expect(hb.get('clips')).toBeUndefined()
    expect(hb.get('clips-b')!.quantity).toBe(75)
  })

  it('keeps the remainder instead of deleting when stock was added meanwhile', async () => {
    failOnce('patchEntity', 'after', 0, ([p]) => (p as { id: string }).id === 'clips-b')
    const request = input({ ...base, mergeIntoId: 'clips-b' })
    expect((await service.execute(request)).status).toBe('pending')
    hb.get('clips')!.quantity = 53 // someone added 3 in Homebox before the saga resumed

    const result = await service.execute(request)
    expect(result).toMatchObject({ status: 'done', sourceRemoved: false, source: { quantity: 3 } })
    expect(hb.get('clips')!.quantity).toBe(3)
    expect(hb.get('clips-b')!.quantity).toBe(75)
  })
})

describe('validation', () => {
  it.each([
    [{ quantity: 4 }, 'VALIDATION'],
    [{ quantity: -1 }, 'VALIDATION'],
    [{ quantity: 1.5 }, 'VALIDATION'],
    [{ quantity: 0 }, 'VALIDATION'],
    [{ targetLocationId: 'shelf-a' }, 'VALIDATION'],
    [{ targetLocationId: 'router' }, 'VALIDATION'],
    [{ targetLocationId: 'missing' }, 'NOT_FOUND'],
    [{ itemId: 'missing' }, 'NOT_FOUND'],
    [{ expectedQuantity: 5 }, 'STALE'],
    [{ expectedLocationId: 'shelf-b' }, 'STALE'],
  ] as const)('rejects %o with %s and changes nothing', async (overrides, code) => {
    await expect(service.execute(input(overrides))).rejects.toMatchObject({ code })
    expect(hb.get('switches')).toMatchObject({ quantity: 3, parent: { id: 'shelf-a' } })
    expect(hb.items()).toHaveLength(2)
  })

  it('rejects a partial transfer of a fractional quantity', async () => {
    hb.get('switches')!.quantity = 2.5
    await expect(service.execute(input({ expectedQuantity: 2.5 }))).rejects.toMatchObject({ code: 'VALIDATION' })
  })
})

describe('idempotency', () => {
  it('does not repeat an operation sent twice', async () => {
    const request = input()
    const first = await service.execute(request)
    const second = await service.execute(request)

    expect(second).toEqual(first)
    expect(hb.get('switches')!.quantity).toBe(2)
    expect(hb.items()).toHaveLength(3)
  })

  it('runs concurrent duplicates of one request only once', async () => {
    const request = input()
    const results = await Promise.all([service.execute(request), service.execute(request), service.execute(request)])

    expect(new Set(results.map(r => r.target!.id)).size).toBe(1)
    expect(hb.get('switches')!.quantity).toBe(2)
    expect(hb.items()).toHaveLength(3)
  })

  it('rejects a reused opId with different parameters', async () => {
    const request = input()
    await service.execute(request)

    await expect(service.execute({ ...request, quantity: 2, expectedQuantity: 2 }))
      .rejects.toMatchObject({ code: 'OP_CONFLICT' })
  })

  it('serialises two terminals moving the same Item; the second sees the new quantity', async () => {
    const [a, b] = await Promise.allSettled([
      service.execute(input({ quantity: 2 })),
      service.execute(input({ quantity: 2 })),
    ])

    expect(a.status).toBe('fulfilled')
    expect(b).toMatchObject({ status: 'rejected', reason: { code: 'STALE' } })
    expect(hb.get('switches')!.quantity).toBe(1)
    expect(totalQuantity('DGS-1005C')).toBe(3)
  })
})

describe('failures and recovery', () => {
  it('fails cleanly when Homebox goes down before any write', async () => {
    hb.addItem('switches-b', 'D-Link DGS-1005C', 'shelf-b', { quantity: 2, manufacturer: 'D-Link', modelNumber: 'DGS-1005C' })
    // The saga's first request (reading the merge target) fails after planning succeeded.
    let reads = 0
    hb.setFault((m, args, w) => {
      if (m === 'getEntity' && args[0] === 'switches-b' && w === 'before' && ++reads === 2) throw new HomeboxError(0, 'down')
    })
    const result = await service.execute(input({ mergeIntoId: 'switches-b' }))

    expect(result.status).toBe('failed')
    expect(hb.get('switches')!.quantity).toBe(3)
    expect(hb.get('switches-b')!.quantity).toBe(2)
  })

  it('keeps an in-doubt first write pending and completes it exactly once', async () => {
    // Network error on duplicate: Homebox may or may not have created the copy.
    failOnce('duplicateEntity', 'before')
    const request = input()
    expect((await service.execute(request)).status).toBe('pending')

    expect((await service.execute(request)).status).toBe('done')
    expect(hb.items()).toHaveLength(3)
    expect(hb.get('switches')!.quantity).toBe(2)
  })

  it('fails cleanly when Homebox rejects the first write', async () => {
    failOnce('patchEntity', 'before', 400)
    const result = await service.execute(input({ itemId: 'router', quantity: 1, expectedQuantity: 1 }))

    expect(result.status).toBe('failed')
    expect(hb.get('router')!.parent!.id).toBe('shelf-a')
  })

  it('adopts the copy when the duplicate response was lost', async () => {
    failOnce('duplicateEntity', 'after')
    const request = input()
    const interrupted = await service.execute(request)

    expect(interrupted.status).toBe('pending')
    expect(interrupted.target).toBeNull()

    const resumed = await service.execute(request)
    expect(resumed.status).toBe('done')
    expect(hb.items()).toHaveLength(3)
    expect(hb.get('switches')!.quantity).toBe(2)
    expect(hb.get(resumed.target!.id)).toMatchObject({ name: 'D-Link DGS-1005C', quantity: 1 })
  })

  it('never decrements twice when the decrement response was lost', async () => {
    failOnce('patchEntity', 'after', 0, ([p]) => (p as { id: string }).id === 'switches')
    const request = input()
    expect((await service.execute(request)).status).toBe('pending')
    expect(hb.get('switches')!.quantity).toBe(2)

    const [resumed] = await service.resumePending()
    expect(resumed!.status).toBe('done')
    expect(hb.get('switches')!.quantity).toBe(2)
    expect(totalQuantity('DGS-1005C')).toBe(3)
  })

  it('leaves a surplus, never a loss, when interrupted between steps', async () => {
    hb.addItem('switches-b', 'D-Link DGS-1005C', 'shelf-b', { quantity: 2, manufacturer: 'D-Link', modelNumber: 'DGS-1005C' })
    failOnce('patchEntity', 'before', 0, ([p]) => (p as { id: string }).id === 'switches')
    const request = input({ mergeIntoId: 'switches-b' })

    expect((await service.execute(request)).status).toBe('pending')
    expect(totalQuantity('DGS-1005C')).toBe(6)

    expect((await service.execute(request)).status).toBe('done')
    expect(hb.get('switches')!.quantity).toBe(2)
    expect(hb.get('switches-b')!.quantity).toBe(3)
  })

  it('finishes a split interrupted before the rename', async () => {
    failOnce('renameEntity', 'before')
    const request = input()
    expect((await service.execute(request)).status).toBe('pending')
    expect(hb.items().some(i => i.name.startsWith(copyMarker(request.opId)))).toBe(true)

    expect((await service.execute(request)).status).toBe('done')
    expect(hb.items().map(i => i.name)).not.toContainEqual(expect.stringContaining('[hbt:'))
  })

  it('asks for attention when the quantity changed while a write was in doubt', async () => {
    failOnce('patchEntity', 'after', 0, ([p]) => (p as { id: string }).id === 'switches')
    const request = input()
    await service.execute(request)
    hb.get('switches')!.quantity = 7 // someone edited it in Homebox meanwhile

    const result = await service.execute(request)
    expect(result.status).toBe('needs_attention')
    expect(result.message).toContain('7')
  })

  it('keeps the journal across service restarts', async () => {
    failOnce('patchEntity', 'before', 503, ([p]) => (p as { id: string }).id === 'switches')
    const request = input()
    await service.execute(request)

    const restarted = createTransferService({ homebox: hb.port, journal })
    const [result] = await restarted.resumePending()
    expect(result).toMatchObject({ opId: request.opId, status: 'done' })
    expect(hb.get('switches')!.quantity).toBe(2)
  })
})

it('exposes TransferError codes for the API layer', () => {
  expect(new TransferError('STALE', 'x').code).toBe('STALE')
})
