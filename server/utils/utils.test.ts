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

  it('adds photo ids to asset lookups from the item card, only where they are missing', async () => {
    const { withPhotos } = await import('./item-index')
    const getEntity = vi.fn(async (id: string) => id === '1' ? entity('1', 'a', { imageId: 'img', thumbnailId: 'th' }) : entity(id, 'b'))
    vi.stubGlobal('useHomebox', () => ({ getEntity }))
    const location = entity('9', 'Полка', { entityType: { id: 'l', name: 'Location', isLocation: true } })
    const withPhoto = entity('3', 'c', { imageId: 'own' })
    expect(await withPhotos([location, withPhoto])).toEqual([location, withPhoto])
    expect(getEntity).not.toHaveBeenCalled()
    expect(await withPhotos([entity('1', 'a'), entity('2', 'b')])).toEqual([
      expect.objectContaining({ id: '1', imageId: 'img', thumbnailId: 'th' }),
      expect.not.objectContaining({ imageId: expect.anything() }),
    ])
  })
})

describe('homebox link', () => {
  it('asks Homebox at most every 10 s and tells a refused key from an outage', async () => {
    vi.useFakeTimers()
    vi.resetModules()
    const { checkHomeboxLink } = await import('./homebox-link')
    // The same module instance the fresh import uses, so instanceof holds.
    const { HomeboxError } = await import('../homebox/client')
    vi.stubGlobal('useRuntimeConfig', () => ({ homebox: { baseUrl: 'http://hb', token: 'hb_x' } }))
    const checkAccess = vi.fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new HomeboxError(401, 'unauthorized'))
      .mockRejectedValueOnce(new HomeboxError(0, 'Homebox is unreachable'))
      .mockRejectedValueOnce(new HomeboxError(502, 'Bad Gateway'))
    vi.stubGlobal('useHomebox', () => ({ checkAccess }))

    expect(await Promise.all([checkHomeboxLink(), checkHomeboxLink()])).toEqual(['ok', 'ok'])
    expect(checkAccess).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(9_000)
    expect(await checkHomeboxLink()).toBe('ok')
    for (const expected of ['unauthorized', 'unreachable', 'unreachable']) {
      vi.advanceTimersByTime(10_000)
      expect(await checkHomeboxLink()).toBe(expected)
    }

    vi.stubGlobal('useRuntimeConfig', () => ({ homebox: { baseUrl: '', token: '' } }))
    expect(await checkHomeboxLink()).toBe('not_configured')
    expect(checkAccess).toHaveBeenCalledTimes(4)
  })
})

describe('homebox version', () => {
  async function load() {
    vi.resetModules()
    const mod = await import('./homebox-version')
    mod.resetHomeboxVersion()
    return mod
  }

  it('reads release tags and knows which versions are tested', async () => {
    const { describeVersion, parseVersion } = await load()
    expect(parseVersion('v0.27.0')).toEqual([0, 27, 0])
    expect(parseVersion('0.27.1-rc.1')).toEqual([0, 27, 1])
    expect(parseVersion('dev')).toBeNull()
    expect(describeVersion('v0.27.0')).toEqual({ version: '0.27.0', tested: true })
    expect(describeVersion('v0.26.2')).toEqual({ version: '0.26.2', tested: false })
    expect(describeVersion('v0.28.3')).toEqual({ version: '0.28.3', tested: false })
    expect(describeVersion('')).toEqual({ version: null, tested: false })
  })

  it('asks Homebox once per 5 minutes, logs each new version and warns about untested ones', async () => {
    vi.useFakeTimers()
    const { getHomeboxVersion } = await load()
    let version = 'v0.27.0'
    const getStatus = vi.fn(async () => ({ build: { version } }))
    vi.stubGlobal('useHomebox', () => ({ getStatus }))
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const [a, b] = await Promise.all([getHomeboxVersion(), getHomeboxVersion()])
    expect(a).toEqual({ version: '0.27.0', tested: true })
    expect(b).toBe(a)
    expect(getStatus).toHaveBeenCalledTimes(1)
    expect(info).toHaveBeenCalledWith('[homebox] version 0.27.0')

    version = 'v0.28.0'
    vi.advanceTimersByTime(4 * 60_000)
    await getHomeboxVersion()
    expect(getStatus).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(60_000)
    expect(await getHomeboxVersion()).toMatchObject({ version: '0.28.0', tested: false })
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('version 0.28.0 has not been tested'))

    vi.advanceTimersByTime(5 * 60_000)
    await getHomeboxVersion()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(info).toHaveBeenCalledTimes(1)
  })

  it('treats an unreachable Homebox as an unknown version and asks again after 30 s', async () => {
    vi.useFakeTimers()
    const { getHomeboxVersion } = await load()
    const getStatus = vi.fn()
      .mockRejectedValueOnce(new Error('Homebox is unreachable'))
      .mockResolvedValue({ build: { version: 'v0.27.0' } })
    vi.stubGlobal('useHomebox', () => ({ getStatus }))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'info').mockImplementation(() => {})

    expect(await getHomeboxVersion()).toEqual({ version: null, tested: false })
    expect(warn).toHaveBeenCalledWith('[homebox] version check failed:', 'Homebox is unreachable')
    vi.advanceTimersByTime(29_000)
    await getHomeboxVersion()
    expect(getStatus).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1_000)
    expect(await getHomeboxVersion()).toEqual({ version: '0.27.0', tested: true })
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
