import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import type { HbEntitySummary } from '../homebox/types'
import { HomeboxError } from '../homebox/client'
import { TransferError } from '../services/transfers/types'
import { installNitroGlobals } from '../test/nitro'

beforeAll(installNitroGlobals)
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('toHttpError', () => {
  it('maps terminal error codes to HTTP statuses with data.code', async () => {
    const { toHttpError } = await import('./errors')
    const cases: [TransferError['code'], number][] = [
      ['HOMEBOX_UNAVAILABLE', 503], ['HOMEBOX_UNAUTHORIZED', 502], ['NOT_FOUND', 404], ['VALIDATION', 422],
      ['STALE', 409], ['BUSY', 409], ['OP_CONFLICT', 409], ['UNAUTHENTICATED', 401], ['FORBIDDEN', 403],
      ['WRONG_PIN', 422], ['LOCKED', 429], ['INTERNAL', 500],
    ]
    for (const [code, status] of cases) {
      expect(toHttpError(new TransferError(code, 'msg'))).toMatchObject({ statusCode: status, data: { code, message: 'msg' } })
    }
  })

  it('translates Homebox failures without leaking internals', async () => {
    const { toHttpError } = await import('./errors')
    expect(toHttpError(new HomeboxError(401, 'bad key'))).toMatchObject({ statusCode: 502, data: { code: 'HOMEBOX_UNAUTHORIZED' } })
    expect(toHttpError(new HomeboxError(403, 'no'))).toMatchObject({ data: { code: 'HOMEBOX_UNAUTHORIZED' } })
    expect(toHttpError(new HomeboxError(404, 'gone'))).toMatchObject({ statusCode: 404, data: { message: 'Не найдено в Homebox' } })
    expect(toHttpError(new HomeboxError(0, 'Homebox is unreachable: ECONNREFUSED 10.0.0.1'))).toMatchObject({ statusCode: 503, data: { message: expect.not.stringContaining('10.0.0.1') } })
    expect(toHttpError(new HomeboxError(500, 'sql'))).toMatchObject({ data: { code: 'HOMEBOX_UNAVAILABLE' } })
    expect(toHttpError(new HomeboxError(422, 'quantity must be int'))).toMatchObject({ statusCode: 500, data: { message: 'Ошибка Homebox: quantity must be int' } })
  })

  it('passes h3 errors through and hides unexpected ones', async () => {
    const { toHttpError } = await import('./errors')
    const h3Error = createError({ statusCode: 418, statusMessage: 'teapot' })
    expect(toHttpError(h3Error)).toBe(h3Error)
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(toHttpError(new Error('stack trace with secrets'))).toMatchObject({ statusCode: 500, data: { message: 'Внутренняя ошибка сервера' } })
    expect(log).toHaveBeenCalled()
  })
})

describe('parseWith', () => {
  it('returns parsed data or a readable validation error naming the field', async () => {
    const { parseWith } = await import('./errors')
    const schema = z.object({ quantity: z.number() })
    expect(parseWith(schema, { quantity: 2 })).toEqual({ quantity: 2 })
    expect(() => parseWith(schema, { quantity: '2' })).toThrow(/Некорректный запрос: quantity — /)
    expect(() => parseWith(schema, 'text')).toThrow(/Некорректный запрос: тело — /)
  })
})

describe('item index', () => {
  function entity(id: string, name: string, extra: Partial<HbEntitySummary> = {}): HbEntitySummary {
    return {
      id, name, assetId: `000-${id}`, description: '', quantity: 1, archived: false, createdAt: '', updatedAt: '',
      entityType: { id: 't', name: 'Item', isLocation: false }, tags: [], ...extra,
    }
  }

  it('normalises case, ё and spaces, and needs every word', async () => {
    const { matchesQuery, normalizeSearch } = await import('./item-index')
    expect(normalizeSearch('  Ёлка   ЗЕЛЁНАЯ ')).toBe('елка зеленая')
    const item = entity('7', 'Зелёная ёлка')
    expect(matchesQuery(item, 'ЕЛКА зел')).toBe(true)
    expect(matchesQuery(item, 'елка синяя')).toBe(false)
    expect(matchesQuery(item, '000-7')).toBe(true)
  })

  it('loads every page once, caches for 30 s and shares a load in flight', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-15T09:00:00Z') })
    const { getAllItems, invalidateItemIndex } = await import('./item-index')
    invalidateItemIndex()
    const pages = [[entity('1', 'a'), entity('2', 'b')], [entity('3', 'c')], []]
    const listItems = vi.fn(async ({ page }: { page: number }) => ({ items: pages[page - 1], page, pageSize: 2, total: 3 }))
    vi.stubGlobal('useHomebox', () => ({ listItems }))

    const [first, second] = await Promise.all([getAllItems(), getAllItems()])
    expect(first.map(i => i.id)).toEqual(['1', '2', '3'])
    expect(second).toBe(first)
    expect(listItems).toHaveBeenCalledTimes(2)

    vi.advanceTimersByTime(29_000)
    await getAllItems()
    expect(listItems).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(2_000)
    await getAllItems()
    expect(listItems).toHaveBeenCalledTimes(4)
    invalidateItemIndex()
    await getAllItems()
    expect(listItems).toHaveBeenCalledTimes(6)
  })

  it('adds photo ids to asset lookups only when something is missing', async () => {
    const { invalidateItemIndex, withPhotos } = await import('./item-index')
    invalidateItemIndex()
    const listItems = vi.fn(async () => ({ items: [entity('1', 'a', { imageId: 'img', thumbnailId: 'th' })], page: 1, pageSize: 1000, total: 1 }))
    vi.stubGlobal('useHomebox', () => ({ listItems }))
    const location = entity('9', 'Полка', { entityType: { id: 'l', name: 'Location', isLocation: true } })
    expect(await withPhotos([location])).toEqual([location])
    expect(listItems).not.toHaveBeenCalled()
    expect(await withPhotos([entity('1', 'a'), entity('2', 'b')])).toEqual([
      expect.objectContaining({ id: '1', imageId: 'img', thumbnailId: 'th' }),
      expect.not.objectContaining({ imageId: expect.anything() }),
    ])
  })
})

describe('service factories', () => {
  it('refuses to talk to Homebox until it is configured, then reuses one client', async () => {
    vi.stubGlobal('useRuntimeConfig', () => ({ homebox: { baseUrl: '', token: '' } }))
    vi.resetModules()
    const { useHomebox } = await import('./homebox')
    expect(() => useHomebox()).toThrow('NUXT_HOMEBOX_BASE_URL')
    vi.stubGlobal('useRuntimeConfig', () => ({ homebox: { baseUrl: 'http://hb', token: 'hb_x' } }))
    expect(useHomebox()).toBe(useHomebox())
  })

  it('opens employees in the journal file with the configured idle timeout', async () => {
    vi.stubGlobal('useRuntimeConfig', () => ({ journalPath: ':memory:', session: { idleMinutes: '7' } }))
    vi.resetModules()
    const { useAuthService } = await import('./auth')
    expect(useAuthService().idleMinutes).toBe(7)
    expect(useAuthService()).toBe(useAuthService())
  })

  it('builds one transfer service over the configured Homebox and journal', async () => {
    vi.stubGlobal('useRuntimeConfig', () => ({ journalPath: ':memory:' }))
    vi.stubGlobal('useHomebox', () => ({}))
    vi.resetModules()
    const { useTransferService } = await import('./transfers')
    expect(useTransferService()).toBe(useTransferService())
    expect(useTransferService().listJournal({ from: '2000-01-01T00:00:00Z', to: '2100-01-01T00:00:00Z' })).toEqual([])
  })

  it('requireUser rejects requests the auth middleware did not sign', async () => {
    const { requireUser } = await import('./auth')
    expect(() => requireUser({ context: {} } as never)).toThrow('Войдите в терминал')
    expect(requireUser({ context: { user: { name: 'Иван' } } } as never)).toEqual({ name: 'Иван' })
  })
})
