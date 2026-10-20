import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TestServer } from '../test/nitro'
import { createTestServer, HOST } from '../test/nitro'

let s: TestServer
let admin: string
let staff: string

beforeEach(async () => {
  s = await createTestServer()
  ;({ admin, staff } = await s.withPeople())
})
afterEach(() => {
  s.close()
  vi.restoreAllMocks()
})

const json = { 'content-type': 'application/json' }

describe('health', () => {
  it('is public and says whether Homebox is configured, its version and whether it is tested', async () => {
    expect((await s.request('GET', '/api/health')).body).toEqual({
      ok: true, homeboxConfigured: true, homeboxVersion: '0.27.0', homeboxTested: true,
    })
  })

  it('flags a Homebox version the terminal was not checked against', async () => {
    s.hb.setVersion('v0.28.0')
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect((await s.request('GET', '/api/health')).body).toMatchObject({ homeboxVersion: '0.28.0', homeboxTested: false })
  })
})

describe('sign-in API', () => {
  it('lists active employees for the sign-in screen without signing in', async () => {
    const res = await s.request('GET', '/api/auth/users')
    expect(res.status).toBe(200)
    expect(res.body.map((u: { name: string }) => u.name)).toEqual(['Админ', 'Иван'])
    expect(Object.keys(res.body[0]).sort()).toEqual(['id', 'name'])
  })

  it('sets an HttpOnly, SameSite=Strict session cookie and returns the employee', async () => {
    const user = s.auth.listUsers().find(u => u.name === 'Иван')!
    const res = await s.request('POST', '/api/auth/login', { body: { userId: user.id, pin: '4826' } })
    expect(res.body).toEqual({ id: user.id, name: 'Иван', role: 'staff', idleMinutes: 15 })
    const cookie = res.headers.get('set-cookie')!
    expect(cookie).toMatch(/^hbt_session=[\w-]{43}; Path=\/; HttpOnly; SameSite=Strict$/)
  })

  it('marks the cookie Secure behind HTTPS', async () => {
    const user = s.auth.listUsers().find(u => u.name === 'Иван')!
    const res = await s.request('POST', '/api/auth/login', {
      body: { userId: user.id, pin: '4826' },
      headers: { 'x-forwarded-proto': 'https' },
    })
    expect(res.headers.get('set-cookie')).toContain('Secure')
  })

  it('reports a wrong PIN and validates the request', async () => {
    const user = s.auth.listUsers().find(u => u.name === 'Иван')!
    const wrong = await s.request('POST', '/api/auth/login', { body: { userId: user.id, pin: '1111' } })
    expect(wrong).toMatchObject({ status: 422, code: 'WRONG_PIN', message: 'Неверный PIN. Осталось попыток: 4' })
    const bad = await s.request('POST', '/api/auth/login', { body: { userId: 'not-a-uuid', pin: '1111' } })
    expect(bad).toMatchObject({ status: 422, code: 'VALIDATION' })
  })

  it('says who is signed in, and signs out', async () => {
    expect((await s.request('GET', '/api/auth/me', { cookie: staff })).body).toMatchObject({ name: 'Иван', role: 'staff' })
    const out = await s.request('POST', '/api/auth/logout', { body: {}, cookie: staff })
    expect(out.headers.get('set-cookie')).toMatch(/^hbt_session=; Max-Age=0/)
    expect((await s.request('GET', '/api/auth/me', { cookie: staff })).status).toBe(401)
  })

  it('ends an idle session and clears its cookie', async () => {
    s.setNow(new Date('2026-10-15T09:15:00Z'))
    const res = await s.request('GET', '/api/auth/me', { cookie: staff })
    expect(res).toMatchObject({ status: 401, code: 'UNAUTHENTICATED' })
    expect(res.headers.get('set-cookie')).toMatch(/^hbt_session=; Max-Age=0/)
  })
})

describe('access', () => {
  it.each([
    ['GET', '/api/items?q=dlink'],
    ['GET', '/api/items/all'],
    ['GET', '/api/items/lookup?code=000-001'],
    ['GET', '/api/items/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'],
    ['GET', '/api/items/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/image'],
    ['GET', '/api/locations/tree'],
    ['GET', '/api/locations/11111111-1111-4111-8111-111111111111'],
    ['POST', '/api/transfers/preview'],
    ['POST', '/api/transfers'],
    ['GET', '/api/transfers/00000000-0000-4000-8000-000000000000'],
    ['GET', '/api/auth/me'],
    ['GET', '/api/admin/users'],
    ['GET', '/api/admin/journal'],
  ])('%s %s needs a signed-in employee', async (method, path) => {
    const res = await s.request(method, path, method === 'POST' ? { body: {} } : {})
    expect(res).toMatchObject({ status: 401, code: 'UNAUTHENTICATED' })
  })

  it.each([
    ['GET', '/api/admin/users'],
    ['POST', '/api/admin/users'],
    ['PATCH', '/api/admin/users/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'],
    ['GET', '/api/admin/journal'],
  ])('%s %s is admin-only', async (method, path) => {
    const res = await s.request(method, path, { cookie: staff, ...(method === 'GET' ? {} : { body: {} }) })
    expect(res).toMatchObject({ status: 403, code: 'FORBIDDEN' })
  })
})

describe('request guards', () => {
  it('rejects writes that are not JSON (a cross-site form cannot send JSON)', async () => {
    for (const type of ['text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data; boundary=x']) {
      const res = await s.request('POST', '/api/auth/logout', { raw: { body: '{}', type }, cookie: staff })
      expect(res, type).toMatchObject({ status: 422, message: 'Ожидается JSON' })
    }
  })

  it('rejects writes from another origin, including opaque ones', async () => {
    for (const origin of ['http://evil.example', 'null', `https://${HOST}.evil.example`]) {
      const res = await s.request('POST', '/api/auth/logout', { body: {}, cookie: staff, headers: { origin } })
      expect(res, origin).toMatchObject({ status: 422, message: 'Запрос с чужого сайта отклонён' })
    }
    const same = await s.request('POST', '/api/auth/logout', { body: {}, cookie: staff, headers: { origin: `http://${HOST}` } })
    expect(same.status).toBe(200)
  })

  it('lets reads through without an Origin check', async () => {
    const res = await s.request('GET', '/api/auth/me', { cookie: staff, headers: { origin: 'http://evil.example' } })
    expect(res.status).toBe(200)
  })

  it('accepts only allowed hosts when NUXT_ALLOWED_HOSTS is set', async () => {
    s.config.allowedHosts = ' Terminal.test , 10.0.0.5:3000'
    expect((await s.request('GET', '/api/health')).status).toBe(200)
    expect((await s.request('GET', '/api/health', { headers: { host: 'terminal.test:8080' } })).status).toBe(200)
    expect((await s.request('GET', '/api/health', { headers: { host: '10.0.0.5:3000' } })).status).toBe(200)
    const other = await s.request('GET', '/api/health', { headers: { host: '10.0.0.5:4000' } })
    expect(other).toMatchObject({ status: 422, message: expect.stringContaining('не разрешён') })
    expect((await s.request('GET', '/api/health', { headers: { host: 'rebind.evil.example' } })).status).toBe(422)
  })

  it('leaves non-API paths alone', async () => {
    s.config.allowedHosts = 'only.example'
    // No route there, but the guards did not answer first.
    expect((await s.request('GET', '/login', { headers: { host: 'evil.example' } })).status).toBe(404)
  })
})

describe('items', () => {
  it('searches names, makers and model numbers through Homebox, without loading the whole list', async () => {
    const listed: unknown[] = []
    s.hb.setFault((method, args, when) => {
      if (method === 'listItems' && when === 'before') listed.push(args[0])
    })
    const byName = await s.request('GET', '/api/items', { cookie: staff, query: { q: 'кроко' } })
    expect(byName.body.items.map((i: { name: string }) => i.name)).toEqual(['Крокодилы'])
    const byMaker = await s.request('GET', '/api/items', { cookie: staff, query: { q: 'd-link dgs' } })
    expect(byMaker.body).toMatchObject({ total: 1, items: [{ name: 'D-Link DGS-1005C', location: { name: 'Полка 01' } }] })
    const scanned = await s.request('GET', '/api/items/lookup', { cookie: staff, query: { code: 'КРОКОДИЛЫ' } })
    expect(scanned.body.items.map((i: { name: string }) => i.name)).toEqual(['Крокодилы'])
    expect(listed).toEqual([{ q: 'кроко', pageSize: 50 }, { q: 'd-link dgs', pageSize: 50 }, { q: 'КРОКОДИЛЫ', pageSize: 30 }])
  })

  it('finds by UID with the photo id the asset lookup lacks', async () => {
    s.hb.addPhoto(s.ids.switches, { id: 'photo-1', type: 'image/jpeg' })
    const assetId = s.hb.get(s.ids.switches)!.assetId
    const res = await s.request('GET', '/api/items', { cookie: staff, query: { q: assetId } })
    expect(res.body.items[0]).toMatchObject({ id: s.ids.switches, hasImage: true, imageId: 'photo-1' })
  })

  it('skips locations and archived records', async () => {
    s.hb.addItem('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Крокодилы старые', s.ids.shelf1, { archived: true })
    const all = await s.request('GET', '/api/items/all', { cookie: staff })
    // Russian collation: Cyrillic names first.
    expect(all.body.map((i: { name: string }) => i.name)).toEqual(['Крокодилы', 'D-Link DGS-1005C'])
  })

  it('validates the query', async () => {
    expect((await s.request('GET', '/api/items', { cookie: staff, query: { q: '  ' } })).code).toBe('VALIDATION')
    expect((await s.request('GET', '/api/items', { cookie: staff, query: { q: 'x'.repeat(201) } })).code).toBe('VALIDATION')
  })

  it('returns an item card with its full path', async () => {
    const res = await s.request('GET', `/api/items/${s.ids.switches}`, { cookie: staff })
    expect(res.body).toMatchObject({ name: 'D-Link DGS-1005C', quantity: 3, locationPath: [{ name: 'Склад 1' }, { name: 'Полка 01' }] })
  })

  it('refuses locations, unknown ids and non-UUIDs as items', async () => {
    expect(await s.request('GET', `/api/items/${s.ids.shelf1}`, { cookie: staff })).toMatchObject({ status: 404, message: expect.stringContaining('локация') })
    expect(await s.request('GET', '/api/items/99999999-9999-4999-8999-999999999999', { cookie: staff })).toMatchObject({ status: 404, code: 'NOT_FOUND' })
    expect(await s.request('GET', '/api/items/not-a-uuid', { cookie: staff })).toMatchObject({ status: 422, code: 'VALIDATION' })
  })
})

describe('lookup of scanned codes', () => {
  it('resolves an item label, a shelf label and a UID', async () => {
    const item = await s.request('GET', '/api/items/lookup', { cookie: staff, query: { code: `https://hb/item/${s.ids.switches}` } })
    expect(item.body).toMatchObject({ items: [{ id: s.ids.switches }], location: null })
    const shelf = await s.request('GET', '/api/items/lookup', { cookie: staff, query: { code: `https://hb/location/${s.ids.shelf2}` } })
    expect(shelf.body).toEqual({ items: [], location: { id: s.ids.shelf2, name: 'Полка 01' } })
    const uid = await s.request('GET', '/api/items/lookup', { cookie: staff, query: { code: s.hb.get(s.ids.clips)!.assetId } })
    expect(uid.body.items.map((i: { id: string }) => i.id)).toEqual([s.ids.clips])
  })

  it('returns nothing for an unknown label and searches text', async () => {
    const missing = await s.request('GET', '/api/items/lookup', { cookie: staff, query: { code: 'https://hb/item/99999999-9999-4999-8999-999999999999' } })
    expect(missing.body).toEqual({ items: [], location: null })
    const text = await s.request('GET', '/api/items/lookup', { cookie: staff, query: { code: 'крокодилы' } })
    expect(text.body.items.map((i: { name: string }) => i.name)).toEqual(['Крокодилы'])
  })
})

describe('photo proxy', () => {
  it('serves the photo, or the thumbnail for lists, with safe headers', async () => {
    s.hb.addPhoto(s.ids.switches, { id: 'photo-1', type: 'image/jpeg', body: new Uint8Array([9, 9, 9]), thumbnail: { id: 'thumb-1', type: 'image/webp' } })
    const full = await s.request('GET', `/api/items/${s.ids.switches}/image`, { cookie: staff })
    expect(full.status).toBe(200)
    expect(full.headers.get('content-type')).toBe('image/jpeg')
    expect(full.headers.get('content-security-policy')).toBe('default-src \'none\'; sandbox')
    expect(full.headers.get('x-content-type-options')).toBe('nosniff')
    expect(full.headers.get('cache-control')).toBe('private, max-age=300')
    const thumb = await s.request('GET', `/api/items/${s.ids.switches}/image`, { cookie: staff, query: { size: 'thumb', v: 'photo-1' } })
    expect(thumb.headers.get('content-type')).toBe('image/webp')
    expect(thumb.headers.get('cache-control')).toBe('private, max-age=86400, immutable')
  })

  it('falls back to the photo while Homebox has no thumbnail yet', async () => {
    s.hb.addPhoto(s.ids.switches, { id: 'photo-1', type: 'image/png' })
    const res = await s.request('GET', `/api/items/${s.ids.switches}/image`, { cookie: staff, query: { size: 'thumb' } })
    expect(res.headers.get('content-type')).toBe('image/png')
  })

  it('refuses SVG and other non-raster «photos»', async () => {
    for (const type of ['image/svg+xml', 'text/html', 'text/plain; charset=utf-8']) {
      s.hb.addPhoto(s.ids.switches, { id: `p-${type}`, type })
      const res = await s.request('GET', `/api/items/${s.ids.switches}/image`, { cookie: staff })
      expect(res, type).toMatchObject({ status: 404, message: 'Вложение не является фотографией' })
    }
  })

  it('reports a missing photo and validates the size', async () => {
    expect(await s.request('GET', `/api/items/${s.ids.clips}/image`, { cookie: staff })).toMatchObject({ status: 404, message: 'У оборудования нет фото' })
    expect((await s.request('GET', `/api/items/${s.ids.clips}/image`, { cookie: staff, query: { size: 'huge' } })).code).toBe('VALIDATION')
  })
})

describe('locations', () => {
  it('returns the tree of locations', async () => {
    const res = await s.request('GET', '/api/locations/tree', { cookie: staff })
    expect(res.body).toEqual([
      { id: s.ids.warehouse1, name: 'Склад 1', children: [{ id: s.ids.shelf1, name: 'Полка 01', children: [] }] },
      { id: s.ids.warehouse2, name: 'Склад 2', children: [{ id: s.ids.shelf2, name: 'Полка 01', children: [] }] },
    ])
  })

  it('shows what lies directly in a place', async () => {
    const warehouse = await s.request('GET', `/api/locations/${s.ids.warehouse1}`, { cookie: staff })
    expect(warehouse.body).toMatchObject({ path: [{ name: 'Склад 1' }], sublocations: [{ id: s.ids.shelf1 }], items: [] })
    const shelf = await s.request('GET', `/api/locations/${s.ids.shelf1}`, { cookie: staff })
    expect(shelf.body.path.map((p: { name: string }) => p.name)).toEqual(['Склад 1', 'Полка 01'])
    expect(shelf.body.items.map((i: { name: string }) => i.name)).toEqual(['Крокодилы', 'D-Link DGS-1005C'])
  })

  it('refuses an item as a place', async () => {
    expect(await s.request('GET', `/api/locations/${s.ids.switches}`, { cookie: staff })).toMatchObject({ status: 404, message: 'Это не локация' })
  })
})

describe('transfers', () => {
  const body = (s: TestServer, extra: Record<string, unknown> = {}) => ({
    itemId: s.ids.switches,
    targetLocationId: s.ids.shelf2,
    quantity: 1,
    expectedQuantity: 3,
    expectedLocationId: s.ids.shelf1,
    ...extra,
  })
  const opId = '0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a'

  it('previews without changing anything', async () => {
    const res = await s.request('POST', '/api/transfers/preview', { cookie: staff, body: body(s) })
    expect(res.body).toMatchObject({ kind: 'split', quantity: 1, target: { id: s.ids.shelf2 } })
    expect(s.hb.get(s.ids.switches)!.quantity).toBe(3)
  })

  it('moves on behalf of the signed-in employee and shows the result', async () => {
    const res = await s.request('POST', '/api/transfers', { cookie: staff, body: { ...body(s), opId, mergeIntoId: null } })
    expect(res.body).toMatchObject({ status: 'done', kind: 'split', actor: { name: 'Иван' } })
    expect(s.hb.get(s.ids.switches)!.quantity).toBe(2)
    const again = await s.request('GET', `/api/transfers/${opId}`, { cookie: staff })
    expect(again.body).toMatchObject({ opId, status: 'done', actor: { name: 'Иван' } })
  })

  it('refreshes the search index after a move', async () => {
    const before = await s.request('GET', '/api/items', { cookie: staff, query: { q: 'кроко' } })
    expect(before.body.items[0].location.id).toBe(s.ids.shelf1)
    await s.request('POST', '/api/transfers', {
      cookie: staff,
      body: { ...body(s, { itemId: s.ids.clips, expectedQuantity: 1 }), opId, mergeIntoId: null },
    })
    const after = await s.request('GET', '/api/items', { cookie: staff, query: { q: 'кроко' } })
    expect(after.body.items[0].location.id).toBe(s.ids.shelf2)
  })

  it('validates ids, numbers and the operation id', async () => {
    const cases = [
      body(s, { itemId: '..' }),
      body(s, { quantity: '1' }),
      body(s, { expectedLocationId: 'shelf' }),
      { ...body(s), opId: 'op-1', mergeIntoId: null },
    ]
    for (const [i, payload] of cases.entries()) {
      const path = i < 3 ? '/api/transfers/preview' : '/api/transfers'
      expect(await s.request('POST', path, { cookie: staff, body: payload }), JSON.stringify(payload)).toMatchObject({ status: 422, code: 'VALIDATION' })
    }
    expect(await s.request('GET', '/api/transfers/abc', { cookie: staff })).toMatchObject({ status: 422, message: expect.stringContaining('opId') })
    expect(await s.request('GET', `/api/transfers/${opId}`, { cookie: staff })).toMatchObject({ status: 404, message: 'Операция не найдена' })
  })

  it('maps Homebox being down to a clear error', async () => {
    const { HomeboxError } = await import('../homebox/client')
    s.hb.setFault(() => {
      throw new HomeboxError(0, 'down')
    })
    expect(await s.request('POST', '/api/transfers/preview', { cookie: staff, body: body(s) })).toMatchObject({ status: 503, code: 'HOMEBOX_UNAVAILABLE' })
  })
})

describe('employees API', () => {
  it('lets an admin add, rename, change and disable employees', async () => {
    const created = await s.request('POST', '/api/admin/users', { cookie: admin, body: { name: 'Мария', pin: '5093', role: 'staff' } })
    expect(created.body).toMatchObject({ name: 'Мария', role: 'staff', active: true })
    const id = created.body.id
    const renamed = await s.request('PATCH', `/api/admin/users/${id}`, { cookie: admin, body: { name: 'Мария С.' } })
    expect(renamed.body.name).toBe('Мария С.')
    const disabled = await s.request('PATCH', `/api/admin/users/${id}`, { cookie: admin, body: { active: false } })
    expect(disabled.body.active).toBe(false)
    const list = await s.request('GET', '/api/admin/users', { cookie: admin })
    expect(list.body.map((u: { name: string, active: boolean }) => `${u.name}:${u.active}`)).toEqual(['Админ:true', 'Иван:true', 'Мария С.:false'])
  })

  it('does not let an admin lock themselves out', async () => {
    const me = s.auth.listUsers().find(u => u.name === 'Админ')!
    for (const change of [{ active: false }, { role: 'staff' }]) {
      const res = await s.request('PATCH', `/api/admin/users/${me.id}`, { cookie: admin, body: change })
      expect(res, JSON.stringify(change)).toMatchObject({ status: 422, message: expect.stringContaining('Нельзя отключить себя') })
    }
    // Renaming yourself is fine.
    expect((await s.request('PATCH', `/api/admin/users/${me.id}`, { cookie: admin, body: { name: 'Главный' } })).status).toBe(200)
  })

  it('validates input and ids', async () => {
    expect((await s.request('POST', '/api/admin/users', { cookie: admin, body: { name: 'X', pin: '1', role: 'boss' } })).code).toBe('VALIDATION')
    expect((await s.request('POST', '/api/admin/users', { cookie: admin, body: { name: 'Мария', pin: '1111', role: 'staff' } })).message).toContain('Слишком простой')
    expect((await s.request('PATCH', '/api/admin/users/abc', { cookie: admin, body: {} })).code).toBe('VALIDATION')
    expect((await s.request('PATCH', '/api/admin/users/99999999-9999-4999-8999-999999999999', { cookie: admin, body: { active: true } })).code).toBe('NOT_FOUND')
  })
})

describe('journal API', () => {
  async function move(cookie: string, opId: string, itemId: string, expectedQuantity: number, quantity = 1) {
    const res = await s.request('POST', '/api/transfers', {
      cookie,
      body: { opId, itemId, targetLocationId: s.ids.shelf2, quantity, expectedQuantity, expectedLocationId: s.ids.shelf1, mergeIntoId: null },
    })
    expect(res.status).toBe(200)
  }
  const range = { from: '2026-10-01T00:00:00Z', to: '2026-11-01T00:00:00Z' }

  it('reports a period with totals over finished operations and the list of employees', async () => {
    await move(staff, '00000000-0000-4000-8000-000000000001', s.ids.switches, 3, 2)
    s.setNow(new Date('2026-10-15T09:01:00Z'))
    await move(admin, '00000000-0000-4000-8000-000000000002', s.ids.clips, 1)
    const res = await s.request('GET', '/api/admin/journal', { cookie: admin, query: range })
    expect(res.body).toMatchObject({ total: 2, totalQuantity: 3 })
    expect(res.body.entries.map((e: { actor: { name: string } }) => e.actor.name)).toEqual(['Админ', 'Иван'])
    expect(res.body.actors.map((a: { name: string }) => a.name)).toEqual(['Админ', 'Иван'])
  })

  it('filters by employee and text, and pages by 50', async () => {
    const ivan = s.auth.listUsers().find(u => u.name === 'Иван')!
    s.hb.addItem('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'Стяжки', s.ids.shelf1, { quantity: 100 })
    for (let i = 0; i < 52; i++) {
      // Seconds apart, so the sessions stay alive.
      s.setNow(new Date(Date.UTC(2026, 9, 15, 9, 0, i)))
      await move(staff, `00000000-0000-4000-8000-${String(i + 10).padStart(12, '0')}`, 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 100 - i)
    }
    await move(admin, '00000000-0000-4000-8000-000000000003', s.ids.clips, 1)
    const page1 = await s.request('GET', '/api/admin/journal', { cookie: admin, query: { ...range, userId: ivan.id } })
    expect(page1.body).toMatchObject({ total: 52, totalQuantity: 52 })
    expect(page1.body.entries).toHaveLength(50)
    const page2 = await s.request('GET', '/api/admin/journal', { cookie: admin, query: { ...range, userId: ivan.id, offset: '50' } })
    expect(page2.body.entries).toHaveLength(2)
    const text = await s.request('GET', '/api/admin/journal', { cookie: admin, query: { ...range, q: 'крокод' } })
    expect(text.body.entries.map((e: { item: { name: string } }) => e.item.name)).toEqual(['Крокодилы'])
  })

  it('validates the period', async () => {
    for (const query of [{}, { from: '2026-10-01', to: '2026-11-01' }, { ...range, offset: '-1' }, { ...range, userId: 'ivan' }]) {
      expect((await s.request('GET', '/api/admin/journal', { cookie: admin, query: query as Record<string, string> })).code, JSON.stringify(query)).toBe('VALIDATION')
    }
  })
})

it('keeps sent JSON content types working with a charset', async () => {
  const res = await s.request('POST', '/api/auth/logout', { body: {}, cookie: staff, headers: { ...json, 'content-type': 'application/json; charset=utf-8' } })
  expect(res.status).toBe(200)
})
