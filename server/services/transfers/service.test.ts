import { beforeEach, describe, expect, it } from 'vitest'
import type { TransferInput } from '../../../shared/types/terminal'
import { HomeboxError } from '../../homebox/client'
import { createFakeHomebox } from './fake-homebox'
import { createSqliteJournal } from './journal'
import { copyMarker, createTransferService } from './service'

let hb: ReturnType<typeof createFakeHomebox>
let journal: ReturnType<typeof createSqliteJournal>
let service: ReturnType<typeof createTransferService>
let opCounter = 0

const ACTOR = { id: 'user-1', name: 'Тест' }

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


// Business rules (what moves where, when records merge) are specified in logic/features/*.feature.
// These tests cover API-level guards and saga internals the scenarios don't reach.

describe('API guards', () => {
  it.each([
    [{ quantity: -1 }, 'VALIDATION'],
    [{ quantity: 1.5 }, 'VALIDATION'],
    [{ targetLocationId: 'router' }, 'VALIDATION'],
    [{ targetLocationId: 'missing' }, 'NOT_FOUND'],
    [{ itemId: 'missing' }, 'NOT_FOUND'],
    [{ expectedLocationId: 'shelf-b' }, 'STALE'],
  ] as const)('rejects %o with %s and changes nothing', async (overrides, code) => {
    await expect(service.execute(input(overrides), ACTOR)).rejects.toMatchObject({ code })
    expect(hb.get('switches')).toMatchObject({ quantity: 3, parent: { id: 'shelf-a' } })
    expect(hb.items()).toHaveLength(2)
  })

  it('rejects a partial transfer of a fractional quantity', async () => {
    hb.get('switches')!.quantity = 2.5
    await expect(service.execute(input({ expectedQuantity: 2.5 }), ACTOR)).rejects.toMatchObject({ code: 'VALIDATION' })
  })

  it('rejects a forced merge into a different product', async () => {
    hb.addItem('other', 'D-Link DGS-1008A', 'shelf-b', { quantity: 5, manufacturer: 'D-Link', modelNumber: 'DGS-1008A' })

    await expect(service.execute(input({ mergeIntoId: 'other' }), ACTOR)).rejects.toMatchObject({ code: 'VALIDATION' })
    expect(hb.get('other')!.quantity).toBe(5)
  })

  it('rejects a forced merge into or from a ×1 record', async () => {
    hb.addItem('single', 'D-Link DGS-1005C', 'shelf-b', { quantity: 1, manufacturer: 'D-Link', modelNumber: 'DGS-1005C' })
    hb.addItem('many', 'TP-Link ER605', 'shelf-b', { quantity: 4, manufacturer: 'TP-Link', modelNumber: 'ER605' })

    await expect(service.execute(input({ mergeIntoId: 'single' }), ACTOR)).rejects.toMatchObject({ code: 'VALIDATION' })
    await expect(service.execute(input({ itemId: 'router', quantity: 1, expectedQuantity: 1, mergeIntoId: 'many' }), ACTOR))
      .rejects.toMatchObject({ code: 'VALIDATION' })
    expect(hb.get('single')!.quantity).toBe(1)
    expect(hb.get('many')!.quantity).toBe(4)
  })

  it('moves a whole quantity record itself when no merge is requested', async () => {
    hb.addItem('clips', 'Крокодилы', 'shelf-a', { quantity: 50 })
    hb.addItem('clips-b', 'Крокодилы', 'shelf-b', { quantity: 25 })
    const result = await service.execute(input({ itemId: 'clips', quantity: 50, expectedQuantity: 50 }), ACTOR)

    expect(result).toMatchObject({ kind: 'whole', sourceRemoved: false })
    expect(hb.get('clips')).toMatchObject({ quantity: 50, parent: { id: 'shelf-b' } })
  })

  it('returns the full target path in the preview', async () => {
    const { mergeIntoId: _, opId: __, ...previewInput } = input()
    const preview = await service.preview(previewInput)

    expect(preview.target.path.map(p => p.name)).toEqual(['Склад 2', 'Полка 01'])
  })
})

describe('idempotency', () => {
  it('runs concurrent duplicates of one request only once', async () => {
    const request = input()
    const results = await Promise.all([service.execute(request, ACTOR), service.execute(request, ACTOR), service.execute(request, ACTOR)])

    expect(new Set(results.map(r => r.target!.id)).size).toBe(1)
    expect(hb.get('switches')!.quantity).toBe(2)
    expect(hb.items()).toHaveLength(3)
  })

  it('rejects a reused opId with different parameters', async () => {
    const request = input()
    await service.execute(request, ACTOR)

    await expect(service.execute({ ...request, quantity: 2, expectedQuantity: 2 }, ACTOR))
      .rejects.toMatchObject({ code: 'OP_CONFLICT' })
  })
})

describe('saga failures and recovery', () => {
  it('fails cleanly when Homebox goes down before any write', async () => {
    hb.addItem('switches-b', 'D-Link DGS-1005C', 'shelf-b', { quantity: 2, manufacturer: 'D-Link', modelNumber: 'DGS-1005C' })
    // The saga's first request (reading the merge target) fails after planning succeeded.
    let reads = 0
    hb.setFault((m, args, w) => {
      if (m === 'getEntity' && args[0] === 'switches-b' && w === 'before' && ++reads === 2) throw new HomeboxError(0, 'down')
    })
    const result = await service.execute(input({ mergeIntoId: 'switches-b' }), ACTOR)

    expect(result.status).toBe('failed')
    expect(hb.get('switches')!.quantity).toBe(3)
    expect(hb.get('switches-b')!.quantity).toBe(2)
  })

  it('fails cleanly when Homebox rejects the first write', async () => {
    failOnce('patchEntity', 'before', 400)
    const result = await service.execute(input({ itemId: 'router', quantity: 1, expectedQuantity: 1 }), ACTOR)

    expect(result.status).toBe('failed')
    expect(hb.get('router')!.parent!.id).toBe('shelf-a')
  })

  it('keeps an in-doubt first write pending and completes it exactly once', async () => {
    // Network error on duplicate: Homebox may or may not have created the copy.
    failOnce('duplicateEntity', 'before')
    const request = input()
    expect((await service.execute(request, ACTOR)).status).toBe('pending')

    expect((await service.execute(request, ACTOR)).status).toBe('done')
    expect(hb.items()).toHaveLength(3)
    expect(hb.get('switches')!.quantity).toBe(2)
  })

  it('finishes a split interrupted before the rename', async () => {
    failOnce('renameEntity', 'before')
    const request = input()
    expect((await service.execute(request, ACTOR)).status).toBe('pending')
    expect(hb.items().some(i => i.name.startsWith(copyMarker(request.opId)))).toBe(true)

    expect((await service.execute(request, ACTOR)).status).toBe('done')
    expect(hb.items().map(i => i.name)).not.toContainEqual(expect.stringContaining('[hbt:'))
  })

  it('keeps the remainder instead of deleting when stock was added meanwhile', async () => {
    hb.addItem('clips', 'Крокодилы', 'shelf-a', { quantity: 50 })
    hb.addItem('clips-b', 'Крокодилы', 'shelf-b', { quantity: 25 })
    failOnce('patchEntity', 'after', 0, ([p]) => (p as { id: string }).id === 'clips-b')
    const request = input({ itemId: 'clips', quantity: 50, expectedQuantity: 50, mergeIntoId: 'clips-b' })
    expect((await service.execute(request, ACTOR)).status).toBe('pending')
    hb.get('clips')!.quantity = 53 // someone added 3 in Homebox before the saga resumed

    const result = await service.execute(request, ACTOR)
    expect(result).toMatchObject({ status: 'done', sourceRemoved: false, source: { quantity: 3 } })
    expect(hb.get('clips')!.quantity).toBe(3)
    expect(hb.get('clips-b')!.quantity).toBe(75)
  })

  it('keeps the journal across service restarts', async () => {
    failOnce('patchEntity', 'before', 503, ([p]) => (p as { id: string }).id === 'switches')
    const request = input()
    await service.execute(request, ACTOR)

    const restarted = createTransferService({ homebox: hb.port, journal })
    const [result] = await restarted.resumePending()
    expect(result).toMatchObject({ opId: request.opId, status: 'done' })
    expect(hb.get('switches')!.quantity).toBe(2)
  })
})
