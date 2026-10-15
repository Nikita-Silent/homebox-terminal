import { registerEndpoint } from '@nuxt/test-utils/runtime'
import { getQuery, readBody } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DOMWrapper } from '@vue/test-utils'
import type { JournalEntry, TransferResult, UserAccount } from '#shared/types/terminal'
import { admin, item, signInAs, staff, tree } from '~/test/fixtures'
import { mountPage, scan, settle } from '~/test/mount'
import JournalPage from './admin/journal.vue'
import UsersPage from './admin/users.vue'
import BrowseAll from './browse/all.vue'
import BrowseIndex from './browse/index.vue'
import BrowsePlace from './browse/[id].vue'
import SearchPage from './index.vue'
import CardPage from './item/[id]/index.vue'
import ResultPage from './result/[opId].vue'

const ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const route = () => useRouter().currentRoute.value

beforeEach(() => {
  signInAs(staff)
  useCart().clear()
})
afterEach(() => vi.restoreAllMocks())

describe('search screen', () => {
  beforeEach(() => {
    registerEndpoint('/api/items', event => ({ items: getQuery(event).q === 'кроко' ? [item('1', 30, { name: 'Крокодилы' })] : [], total: 0 }))
    registerEndpoint('/api/items/lookup', (event) => {
      const code = String(getQuery(event).code)
      if (code === '000-016') return { items: [item(ID)], location: null }
      if (code === 'SHELF') return { items: [], location: { id: 'shelf', name: 'Полка 01' } }
      return { items: [item('x'), item('y')], location: null }
    })
  })

  it('searches as you type and keeps the query in the address', async () => {
    const page = await mountPage(SearchPage)
    await page.find('#search').setValue('кроко')
    await settle(500)
    expect(page.text()).toContain('Найдено: 1')
    expect(page.text()).toContain('Крокодилы')
    expect(route().query.q).toBe('кроко')
    await page.find('#search').setValue('нет такого')
    await settle(500)
    expect(page.text()).toContain('Ничего не найдено по «нет такого»')
  })

  it('opens the card for a scanned item and the shelf for a scanned shelf label', async () => {
    await mountPage(SearchPage)
    scan('000-016')
    await settle()
    expect(route().path).toBe(`/item/${ID}`)
    await useRouter().push('/')
    await mountPage(SearchPage)
    scan('SHELF')
    await settle()
    expect(route().path).toBe('/browse/shelf')
  })

  it('lists several matches of a code instead of guessing', async () => {
    const page = await mountPage(SearchPage)
    await page.find('#search').setValue('4600000000017')
    await page.find('form').trigger('submit')
    await settle()
    expect(page.findAll('a[href^="/item/"]')).toHaveLength(2)
  })

  it('offers the list for unknown names', async () => {
    const page = await mountPage(SearchPage)
    expect(page.find('a[href="/browse"]').text()).toContain('Не знаю названия')
  })
})

describe('item card', () => {
  beforeEach(() => {
    registerEndpoint(`/api/items/${ID}`, () => ({
      ...item(ID, 2, { name: 'D-Link DGS-1005C', manufacturer: 'D-Link', modelNumber: 'DGS-1005C', hasImage: true, imageId: 'img' }),
      serialNumber: 'SN-1', description: '', locationPath: [{ id: 'wh1', name: 'Склад 1' }, { id: 'shelf', name: 'Полка 01' }],
    }))
    registerEndpoint('/api/items/lookup', () => ({ items: [], location: { id: 'shelf2', name: 'Полка 02' } }))
  })

  it('shows where the item lies, how many, and its photo', async () => {
    const page = await mountPage(CardPage, { route: `/item/${ID}` })
    const text = page.text()
    for (const part of ['D-Link DGS-1005C', 'Количественный учёт', 'UID 000-', 'SN-1', 'Склад 1', 'Полка 01', '2']) expect(text).toContain(part)
    expect(page.find('img').attributes('src')).toBe(`/api/items/${ID}/image?size=full&v=img`)
    expect(page.find(`a[href="/item/${ID}/move"]`).exists()).toBe(true)
  })

  it('opens the photo full screen and closes it with Escape', async () => {
    const page = await mountPage(CardPage, { route: `/item/${ID}`, attachTo: document.body })
    await page.find('[aria-label="Открыть фото во весь экран"]').trigger('click')
    expect(document.querySelector('[role="dialog"]')).not.toBeNull()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await settle(0)
    expect(document.querySelector('[role="dialog"]')).toBeNull()
  })

  it('puts the item into the cart once', async () => {
    const page = await mountPage(CardPage, { route: `/item/${ID}` })
    await page.findAll('button').find(b => b.text().includes('В корзину'))!.trigger('click')
    expect(useCart().has(ID)).toBe(true)
    expect(page.find('a[href="/cart"]').text()).toContain('В корзине · открыть')
  })

  it('jumps to the move screen when a shelf is scanned', async () => {
    await mountPage(CardPage, { route: `/item/${ID}` })
    scan('SHELF2')
    await settle()
    expect(route().fullPath).toBe(`/item/${ID}/move?to=shelf2`)
  })

  it('reports an unknown item', async () => {
    registerEndpoint(`/api/items/${ID}`, () => {
      throw createError({ statusCode: 404, data: { code: 'NOT_FOUND', message: 'Не найдено в Homebox' } })
    })
    const page = await mountPage(CardPage, { route: `/item/${ID}` })
    expect(page.text()).toContain('Оборудование не найдено')
  })
})

describe('result label', () => {
  function result(status: TransferResult['status'], extra: Partial<TransferResult> = {}): TransferResult {
    return {
      opId: 'op-1', status, actor: { id: 'u1', name: 'Иван Петров' }, createdAt: '2026-10-15T08:21:00Z', kind: 'split', quantity: 5,
      source: { id: 'src', name: 'Крокодилы', quantity: 25, location: { id: 'shelf', name: 'Полка 01' }, path: [{ id: 'wh', name: 'Склад 1' }, { id: 'shelf', name: 'Полка 01' }] },
      sourceRemoved: false,
      target: status === 'done' ? { id: 'copy', assetId: '000-030', name: 'Крокодилы', quantity: 5, location: { id: 'shelf2', name: 'Полка 02' }, path: [{ id: 'wh2', name: 'Склад 2' }, { id: 'shelf2', name: 'Полка 02' }] } : null,
      message: status === 'done' ? null : 'Связь с Homebox прервалась.',
      ...extra,
    }
  }

  it('prints what moved where, who did it and what stayed behind', async () => {
    registerEndpoint('/api/transfers/op-1', () => result('done'))
    const page = await mountPage(ResultPage, { route: '/result/op-1' })
    const text = page.text()
    for (const part of ['Перемещено', 'Крокодилы', '5', 'Склад 2', 'Полка 02', 'UID 000-030', 'осталось 25 шт.', 'Сотрудник: Иван Петров']) expect(text).toContain(part)
  })

  it('explains an unfinished and a failed operation', async () => {
    registerEndpoint('/api/transfers/op-1', () => result('needs_attention'))
    const attention = await mountPage(ResultPage, { route: '/result/op-1' })
    expect(attention.text()).toContain('Нужна проверка')
    expect(attention.text()).toContain('Номер операции: op-1')
    clearNuxtData()
    clearNuxtState('transfer:op-1')
    registerEndpoint('/api/transfers/op-1', () => result('failed'))
    const failed = await mountPage(ResultPage, { route: '/result/op-1' })
    expect(failed.find('a[href="/item/src/move"]').text()).toContain('Попробовать снова')
  })

  it('keeps checking a pending operation until it settles', async () => {
    let calls = 0
    registerEndpoint('/api/transfers/op-1', () => (++calls < 2 ? result('pending') : result('done')))
    const page = await mountPage(ResultPage, { route: '/result/op-1' })
    expect(page.text()).toContain('Завершается')
    await settle(3_300)
    expect(page.text()).toContain('Перемещено')
  }, 10_000)

  it('reports an unknown operation and starts the next move from a scan', async () => {
    registerEndpoint('/api/transfers/op-1', () => {
      throw createError({ statusCode: 404, data: { code: 'NOT_FOUND', message: 'Операция не найдена' } })
    })
    registerEndpoint('/api/items/lookup', () => ({ items: [item(ID)], location: null }))
    const page = await mountPage(ResultPage, { route: '/result/op-1' })
    expect(page.text()).toContain('Операция не найдена')
    scan('000-001')
    await settle()
    expect(route().path).toBe(`/item/${ID}`)
  })
})

describe('browsing', () => {
  it('starts from warehouses sorted by name and the full list', async () => {
    registerEndpoint('/api/locations/tree', () => [...tree].reverse())
    const page = await mountPage(BrowseIndex)
    const links = page.findAll('a[href^="/browse/"]').map(a => a.attributes('href'))
    expect(links).toEqual(['/browse/all', '/browse/wh1', '/browse/wh2'])
  })

  it('shows a place: its path, what is inside and what lies there', async () => {
    registerEndpoint('/api/locations/room', () => ({
      location: { id: 'room', name: 'Помещение А' },
      path: [{ id: 'wh1', name: 'Склад 1' }, { id: 'room', name: 'Помещение А' }],
      sublocations: [{ id: 'shelf', name: 'Полка 01' }],
      items: [item('1', 3, { name: 'Коммутатор' })],
    }))
    const page = await mountPage(BrowsePlace, { route: '/browse/room' })
    expect(page.find('a[href="/browse/wh1"]').text()).toContain('Склад 1')
    expect(page.find('a[href="/browse/shelf"]').text()).toContain('Полка 01')
    expect(page.find('a[href="/item/1"]').text()).toContain('Коммутатор')
  })

  it('says when a place is empty', async () => {
    registerEndpoint('/api/locations/shelf', () => ({ location: { id: 'shelf', name: 'Полка 01' }, path: [{ id: 'shelf', name: 'Полка 01' }], sublocations: [], items: [] }))
    const page = await mountPage(BrowsePlace, { route: '/browse/shelf' })
    expect(page.find('a[href="/browse"]').exists()).toBe(true)
    expect(page.text()).toMatch(/пуст|ничего/i)
  })

  it('offers a retry when the places cannot be loaded', async () => {
    let fail = true
    registerEndpoint('/api/locations/tree', () => {
      if (fail) throw createError({ statusCode: 503, data: { code: 'HOMEBOX_UNAVAILABLE', message: 'Homebox недоступен' } })
      return tree
    })
    const page = await mountPage(BrowseIndex)
    expect(page.text()).toContain('Homebox недоступен')
    fail = false
    await page.findAll('button').find(b => b.text().includes('Повторить'))!.trigger('click')
    await settle()
    expect(page.find('a[href="/browse/wh1"]').exists()).toBe(true)
  })

  it('jumps to the first item of a letter, loading more if needed', async () => {
    const names = [...Array.from({ length: 70 }, (_, i) => `Аккумулятор ${i}`), 'Ящик']
    registerEndpoint('/api/items/all', () => names.map((name, i) => item(String(i), 1, { name })))
    const scrolled = vi.fn()
    vi.spyOn(HTMLElement.prototype, 'scrollIntoView').mockImplementation(scrolled)
    const page = await mountPage(BrowseAll, { attachTo: document.body })
    await page.findAll('nav button').find(b => b.text() === 'Я')!.trigger('click')
    await settle(0)
    expect(page.find('#item-70').exists()).toBe(true)
    expect(scrolled).toHaveBeenCalled()
  })

  it('filters the full list, jumps by letter and pages by 60', async () => {
    const names = ['Аккумулятор', 'Батарейка', 'Zyxel', '3M скотч', '[старое]', ...Array.from({ length: 70 }, (_, i) => `Кабель ${i}`)]
    registerEndpoint('/api/items/all', () => names.map((name, i) => item(String(i), 1, { name })))
    const page = await mountPage(BrowseAll)
    expect(page.findAll('nav button').map(b => b.text())).toEqual(['А', 'Б', 'A–Z', '0–9', '#', 'К'])
    expect(page.findAll('a[href^="/item/"]')).toHaveLength(60)
    await page.findAll('button').find(b => b.text().includes('Показать ещё'))!.trigger('click')
    expect(page.findAll('a[href^="/item/"]')).toHaveLength(75)
    await page.find('#all-filter').setValue('батар')
    expect(page.text()).toContain('1 из 75')
    await page.find('#all-filter').setValue('ничего такого')
    expect(page.text()).toContain('Ничего не подходит')
  })
})

describe('employees page', () => {
  let users: UserAccount[]
  let calls: { method: string, body: Record<string, unknown> }[]

  beforeEach(() => {
    signInAs(admin)
    calls = []
    users = [
      { id: admin.id, name: 'Анна', role: 'admin', active: true, createdAt: '' },
      { id: 'ivan', name: 'Иван', role: 'staff', active: true, createdAt: '' },
    ]
    registerEndpoint('/api/admin/users', { method: 'GET', handler: () => users })
    registerEndpoint('/api/admin/users', { method: 'POST', handler: async (event) => {
      const body = await readBody(event)
      calls.push({ method: 'POST', body })
      if (body.pin === '1111') throw createError({ statusCode: 422, data: { code: 'VALIDATION', message: 'Слишком простой PIN' } })
      users = [...users, { id: 'new', name: body.name, role: body.role, active: true, createdAt: '' }]
      return users.at(-1)
    } })
    registerEndpoint('/api/admin/users/ivan', { method: 'PATCH', handler: async (event) => {
      const body = await readBody(event)
      calls.push({ method: 'PATCH', body })
      users = users.map(u => (u.id === 'ivan' ? { ...u, ...body } as UserAccount : u))
      return users[1]
    } })
  })

  type Scope = { findAll: (selector: string) => DOMWrapper<Element>[] }
  const button = (page: Scope, text: string, scope: Scope = page) => scope.findAll('button').find(b => b.text().includes(text))!

  it('adds an employee and reports a rejected PIN', async () => {
    const page = await mountPage(UsersPage)
    await page.find('input[placeholder="Как в журнале"]').setValue('Мария')
    await page.find('input[placeholder="4–8 цифр"]').setValue('1111')
    await page.find('form').trigger('submit')
    await settle(0)
    expect(page.text()).toContain('Слишком простой PIN')
    await page.find('input[placeholder="4–8 цифр"]').setValue('5093')
    await button(page, 'Администратор').trigger('click')
    await page.find('form').trigger('submit')
    await settle(0)
    expect(calls.at(-1)).toEqual({ method: 'POST', body: { name: 'Мария', pin: '5093', role: 'admin' } })
    expect(page.text()).toContain('«Мария» — в списке')
  })

  it('edits and disables others, but never offers to disable yourself', async () => {
    const page = await mountPage(UsersPage)
    const [me, ivan] = page.findAll('article')
    expect(me!.text()).toContain('это вы')
    expect(button(page, 'Отключить', me)).toBeUndefined()
    await button(page, 'Отключить', ivan).trigger('click')
    await settle(0)
    expect(calls).toEqual([{ method: 'PATCH', body: { active: false } }])
    expect(page.findAll('article')[1]!.text()).toContain('отключён')
  })

  it('asks for a new PIN before promoting to admin and sends only what changed', async () => {
    const page = await mountPage(UsersPage)
    await button(page, 'Изменить', page.findAll('article')[1]).trigger('click')
    const panel = page.findAll('article')[1]!
    await button(page, 'Администратор', panel).trigger('click')
    expect(panel.text()).toContain('Для администратора задайте новый PIN')
    expect(button(page, 'Сохранить', panel).attributes('disabled')).toBeDefined()
    await panel.find('input[placeholder="не менять"]').setValue('730591')
    await panel.find('form').trigger('submit')
    await settle(0)
    expect(calls).toEqual([{ method: 'PATCH', body: { role: 'admin', pin: '730591' } }])
  })
})

describe('journal page', () => {
  let queries: Record<string, string>[]
  const entry = (opId: string, createdAt: string, extra: Partial<JournalEntry> = {}): JournalEntry => ({
    opId, createdAt, actor: { id: 'ivan', name: 'Иван' }, status: 'done', kind: 'merge', quantity: 3,
    item: { id: 'i', name: 'Крокодилы', assetId: '000-016' },
    from: [{ id: 'wh', name: 'Склад 1' }, { id: 's', name: 'Полка 01' }], to: [{ id: 'wh2', name: 'Склад 2' }],
    target: { id: 't', name: 'Крокодилы', assetId: '000-017', quantity: 38 }, sourceRemoved: false, message: null, ...extra,
  })

  beforeEach(() => {
    signInAs(admin)
    queries = []
    vi.useFakeTimers({ now: new Date('2026-10-15T12:00:00'), toFake: ['Date'] })
    registerEndpoint('/api/admin/journal', (event) => {
      const query = getQuery(event) as Record<string, string>
      queries.push(query)
      const entries = [
        entry('a', '2026-10-15T09:21:00'),
        entry('b', '2026-10-14T16:00:00', { kind: 'whole', actor: null }),
        entry('c', '2026-10-14T15:00:00', { status: 'needs_attention', message: 'Проверьте в Homebox' }),
      ]
      return { entries: query.offset === '3' ? [entry('d', '2026-10-13T10:00:00')] : entries, total: 4, totalQuantity: 9, actors: [{ id: 'ivan', name: 'Иван' }] }
    })
  })
  afterEach(() => vi.useRealTimers())

  it('reports the last 7 days by day, with totals, outcomes and authors', async () => {
    const page = await mountPage(JournalPage, { route: '/admin/journal' })
    await settle()
    const text = page.text()
    expect(queries[0]).toMatchObject({ from: new Date('2026-10-09T00:00:00').toISOString(), to: new Date('2026-10-16T00:00:00').toISOString(), offset: '0' })
    for (const part of ['4', '9', 'Иван', 'до входа по PIN', 'Добавлено к записи UID 000-017 (стало 38 шт.)', 'Запись перенесена целиком', 'Нужна проверка', 'Склад 1 / Полка 01']) expect(text).toContain(part)
    expect(page.findAll('h2').map(h => h.text())).toEqual([expect.stringContaining('15 октября'), expect.stringContaining('14 октября')])
    expect(page.find('a[href="/result/a"]').exists()).toBe(true)
  })

  it('sends the chosen period, employee and search, and keeps them in the address', async () => {
    const page = await mountPage(JournalPage, { route: '/admin/journal' })
    await settle()
    await page.findAll('[role="radio"]').find(b => b.text() === 'Вчера')!.trigger('click')
    await settle()
    expect(queries.at(-1)).toMatchObject({ from: new Date('2026-10-14T00:00:00').toISOString(), to: new Date('2026-10-15T00:00:00').toISOString() })
    await page.find('select').setValue('ivan')
    await page.find('#journal-search').setValue('кроко')
    await settle(500)
    expect(queries.at(-1)).toMatchObject({ userId: 'ivan', q: 'кроко' })
    expect(route().query).toMatchObject({ period: 'yesterday', user: 'ivan', q: 'кроко' })
  })

  it('takes a custom period and refuses an inverted one', async () => {
    const page = await mountPage(JournalPage, { route: '/admin/journal?period=custom&from=2026-10-10&to=2026-10-12' })
    await settle()
    expect(queries.at(-1)).toMatchObject({ from: new Date('2026-10-10T00:00:00').toISOString(), to: new Date('2026-10-13T00:00:00').toISOString() })
    const [from] = page.findAll('input[type="date"]')
    await from!.setValue('2026-10-20')
    await settle()
    expect(page.text()).toContain('дата «по» не раньше даты «с»')
  })

  it('loads more entries on request', async () => {
    const page = await mountPage(JournalPage, { route: '/admin/journal' })
    await settle()
    await page.findAll('button').find(b => b.text().includes('Показать ещё'))!.trigger('click')
    await settle()
    expect(queries.at(-1)!.offset).toBe('3')
    expect(page.find('a[href="/result/d"]').exists()).toBe(true)
  })
})
