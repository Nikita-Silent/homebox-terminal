import { registerEndpoint } from '@nuxt/test-utils/runtime'
import { getQuery, readBody } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { mountPage as mountSuspended, scan, settle } from '~/test/mount'
import type { TransferPreview, TransferResult } from '#shared/types/terminal'
import { item, signInAs, staff, tree } from '~/test/fixtures'
import CartPage from './cart.vue'
import LoginPage from './login.vue'
import MovePage from './item/[id]/move.vue'

function press(key: string) {
  window.dispatchEvent(new KeyboardEvent('keydown', { key }))
}



afterEach(() => vi.restoreAllMocks())

describe('sign-in page', () => {
  const people = [{ id: '11111111-1111-4111-8111-111111111111', name: 'Иван Петров' }, { id: '22222222-2222-4222-8222-222222222222', name: 'Анна' }]
  let attempts: unknown[]

  beforeEach(() => {
    signInAs(null)
    attempts = []
    registerEndpoint('/api/auth/users', () => people)
    registerEndpoint('/api/auth/login', {
      method: 'POST',
      handler: async (event) => {
        const body = await readBody(event)
        attempts.push(body)
        if (body.pin !== '4826') throw createError({ statusCode: 422, data: { code: 'WRONG_PIN', message: 'Неверный PIN. Осталось попыток: 4' } })
        return { ...staff, id: body.userId }
      },
    })
  })

  it('asks who works and lets one choose', async () => {
    const page = await mountSuspended(LoginPage)
    expect(page.text()).toContain('Кто работает?')
    await page.findAll('li button').at(0)!.trigger('click')
    expect(page.text()).toContain('Иван Петров')
    expect(page.text()).toContain('Личный PIN')
    await page.find('button[type="button"]').trigger('click')
    expect(page.text()).toContain('Кто работает?')
  })

  it('takes the PIN from the keypad, never shows it, and needs 4 digits', async () => {
    const page = await mountSuspended(LoginPage)
    await page.findAll('li button').at(0)!.trigger('click')
    const key = (label: string) => page.findAll('[aria-label="Клавиатура PIN"] button').find(b => b.text() === label || b.attributes('aria-label') === label)!
    const submit = page.find('button[type="submit"]')
    for (const d of ['4', '8', '2']) await key(d).trigger('click')
    expect(page.find('[role="status"]').attributes('aria-label')).toBe('Введено цифр: 3')
    expect(page.text()).not.toContain('482')
    expect(submit.attributes('disabled')).toBeDefined()
    await key('Стереть цифру').trigger('click')
    for (const d of ['2', '6']) await key(d).trigger('click')
    expect(submit.attributes('disabled')).toBeUndefined()
  })

  it('reports a wrong PIN, clears it, and signs in with the right one from the keyboard', async () => {
    const page = await mountSuspended(LoginPage, { route: '/login?next=/cart' })
    await page.findAll('li button').at(0)!.trigger('click')
    for (const k of ['1', '1', '1', '1', 'Enter']) press(k)
    await settle()
    expect(page.text()).toContain('Неверный PIN. Осталось попыток: 4')
    expect(page.find('[role="status"]').attributes('aria-label')).toBe('Введено цифр: 0')
    for (const k of ['4', '8', '2', '6', 'Enter']) press(k)
    await settle()
    expect(attempts).toEqual([
      { userId: people[0]!.id, pin: '1111' },
      { userId: people[0]!.id, pin: '4826' },
    ])
    expect(useAuth().user.value?.name).toBe('Иван Петров')
  })

  it('caps the PIN at 8 digits and goes back on Escape', async () => {
    const page = await mountSuspended(LoginPage)
    await page.findAll('li button').at(1)!.trigger('click')
    for (const k of '1234567890') press(k)
    await flushPromises()
    expect(page.find('[role="status"]').attributes('aria-label')).toBe('Введено цифр: 8')
    press('Escape')
    await flushPromises()
    expect(page.text()).toContain('Кто работает?')
  })

  it('explains an automatic sign-out', async () => {
    const idle = await mountSuspended(LoginPage, { route: '/login?reason=idle' })
    expect(idle.text()).toContain('Терминал закрылся после бездействия')
  })

  it('explains how to get the first administrator when nobody is set up', async () => {
    registerEndpoint('/api/auth/users', () => [])
    const empty = await mountSuspended(LoginPage)
    expect(empty.text()).toContain('Сотрудники не заведены')
    expect(empty.text()).toContain('NUXT_ADMIN_PIN')
  })
})

describe('cart page', () => {
  const shelf2 = { id: 'shelf2', name: 'Полка 02' }
  let previews: Record<string, Partial<TransferPreview> | { error: [number, string, string] }>
  let moves: Record<string, unknown>[]
  let reject: Set<string>

  function preview(itemId: string, extra: Partial<TransferPreview> = {}): Partial<TransferPreview> {
    return { kind: 'split', quantity: 1, mergeCandidates: [], suggestedMergeIntoId: null, item: item(itemId) as never, target: { ...shelf2, path: [] }, ...extra }
  }

  beforeEach(() => {
    signInAs(staff)
    useCart().clear()
    moves = []
    reject = new Set()
    previews = { a: preview('a', { kind: 'whole' }), b: preview('b') }
    registerEndpoint('/api/locations/tree', () => tree)
    for (const id of ['a', 'b', 'c']) registerEndpoint(`/api/items/${id}`, () => ({ ...item(id, id === 'b' ? 40 : 1), locationPath: [] }))
    registerEndpoint('/api/items/lookup', (event) => {
      const code = String(getQuery(event).code)
      if (code === 'SHELF2') return { items: [], location: shelf2 }
      return { items: code === 'ITEMC' ? [item('c')] : [], location: null }
    })
    registerEndpoint('/api/transfers/preview', {
      method: 'POST',
      handler: async (event) => {
        const body = await readBody(event)
        const result = previews[body.itemId]!
        if ('error' in result) throw createError({ statusCode: result.error[0], data: { code: result.error[1], message: result.error[2] } })
        return result
      },
    })
    registerEndpoint('/api/transfers', {
      method: 'POST',
      handler: async (event) => {
        const body = await readBody(event)
        moves.push(body)
        if (reject.has(body.itemId)) throw createError({ statusCode: 409, data: { code: 'STALE', message: 'Количество изменилось' } })
        return { opId: body.opId, status: 'done', kind: 'split', quantity: body.quantity, source: { id: body.itemId, name: `Item ${body.itemId}` }, target: { location: shelf2, assetId: `NEW-${body.itemId}` }, sourceRemoved: false, actor: staff, createdAt: '' } as unknown as TransferResult
      },
    })
  })

  const moveButton = (page: Awaited<ReturnType<typeof mountSuspended>>) => page.findAll('button').find((b: { text: () => string }) => b.text().includes('Переместить всё'))!

  it('is empty until something is scanned or added', async () => {
    const page = await mountSuspended(CartPage)
    expect(page.text()).toContain('Корзина пуста')
    scan('ITEMC')
    await settle()
    expect(page.text()).toContain('Item c')
    scan('ITEMC')
    await settle()
    expect(page.text()).toContain('«Item c» уже в корзине')
    expect(useCart().count.value).toBe(1)
  })

  it('checks every line against the scanned shelf before allowing the move', async () => {
    useCart().add(item('a'))
    useCart().add(item('b', 40))
    const page = await mountSuspended(CartPage)
    await settle()
    expect(moveButton(page).attributes('disabled')).toBeDefined()
    scan('SHELF2')
    await settle()
    expect(page.text()).toContain('Запись переедет целиком')
    expect(page.text()).toContain('Появится новая запись со своим UID')
    expect(page.text()).toContain('2 поз. · 2 шт.')
    expect(moveButton(page).attributes('disabled')).toBeUndefined()
  })

  it('waits for a choice where the shelf has several matching records', async () => {
    previews.b = preview('b', {
      kind: 'merge',
      mergeCandidates: [item('x', 35, { assetId: '000-017' }), item('y', 5, { assetId: '000-028' })],
    })
    useCart().add(item('b', 40))
    const page = await mountSuspended(CartPage)
    scan('SHELF2')
    await settle()
    expect(page.text()).toContain('выберите, к какой добавить')
    expect(moveButton(page).attributes('disabled')).toBeDefined()
    await page.findAll('[role="radio"]').find(b => b.text().includes('000-017'))!.trigger('click')
    expect(moveButton(page).attributes('disabled')).toBeUndefined()
    await moveButton(page).trigger('click')
    await settle()
    expect(moves).toEqual([expect.objectContaining({ itemId: 'b', mergeIntoId: 'x', targetLocationId: 'shelf2', quantity: 1, expectedQuantity: 40 })])
  })

  it('blocks a line that cannot move and lets it be removed', async () => {
    previews.a = { error: [422, 'VALIDATION', 'Оборудование уже находится в этой локации'] }
    useCart().add(item('a'))
    useCart().add(item('b', 40))
    const page = await mountSuspended(CartPage)
    scan('SHELF2')
    await settle()
    expect(page.text()).toContain('уже находится в этой локации')
    expect(page.text()).toContain('Проверьте строк: 1')
    expect(moveButton(page).attributes('disabled')).toBeDefined()
    await page.find('[aria-label="Убрать «Item a» из корзины"]').trigger('click')
    await settle()
    expect(moveButton(page).attributes('disabled')).toBeUndefined()
  })

  it('moves lines one by one, each once, and empties the cart', async () => {
    useCart().add(item('a'))
    useCart().add(item('b', 40))
    const page = await mountSuspended(CartPage)
    scan('SHELF2')
    await settle()
    await moveButton(page).trigger('click')
    await settle()
    expect(moves.map(m => m.itemId)).toEqual(['a', 'b'])
    expect(new Set(moves.map(m => m.opId)).size).toBe(2)
    expect(useCart().count.value).toBe(0)
    expect(page.text()).toContain('Перемещено: 2')
    expect(page.text()).toContain('NEW-b')
  })

  it('keeps failed lines with the reason and moves the rest', async () => {
    reject.add('a')
    useCart().add(item('a'))
    useCart().add(item('b', 40))
    const page = await mountSuspended(CartPage)
    scan('SHELF2')
    await settle()
    await moveButton(page).trigger('click')
    await settle()
    expect(useCart().lines.value.map(l => l.item.id)).toEqual(['a'])
    expect(page.text()).toContain('Перемещено 1 из 2. Не перемещено: «Item a» — Количество изменилось')
    expect(page.text()).toContain('Перемещено: 1')
  })
})

describe('move page', () => {
  let posted: Record<string, unknown>[]
  beforeEach(() => {
    signInAs(staff)
    posted = []
    registerEndpoint('/api/items/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', () => ({ ...item('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 30, { name: 'Крокодилы' }), locationPath: [{ id: 'wh1', name: 'Склад 1' }, { id: 'shelf', name: 'Полка 01' }] }))
    registerEndpoint('/api/locations/tree', () => tree)
    registerEndpoint('/api/transfers/preview', { method: 'POST', handler: async (event) => {
      const body = await readBody(event)
      return { kind: 'split', quantity: body.quantity, mergeCandidates: [], suggestedMergeIntoId: null }
    } })
    registerEndpoint('/api/transfers', { method: 'POST', handler: async (event) => {
      const body = await readBody(event)
      posted.push(body)
      if (posted.length === 1) throw createError({ statusCode: 409, data: { code: 'STALE', message: 'Количество изменилось: в Homebox сейчас 20 шт.' } })
      return { opId: body.opId, status: 'done' }
    } })
  })

  it('confirms the exact outcome, reports a stale card and retries as a new operation', async () => {
    const page = await mountSuspended(MovePage, { route: '/item/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/move?to=shelf2' })
    await settle()
    expect(page.text()).toContain('Появится новая запись')
    const confirm = page.findAll('button').find(b => b.text().includes('Подтвердить'))!
    await confirm.trigger('click')
    await settle()
    expect(page.text()).toContain('Количество изменилось: в Homebox сейчас 20 шт.')
    await confirm.trigger('click')
    await settle()
    expect(posted).toHaveLength(2)
    expect(posted[0]).toMatchObject({ targetLocationId: 'shelf2', quantity: 1, expectedQuantity: 30, expectedLocationId: 'shelf' })
    // A definite rejection changed nothing, so the retry must not reuse the operation id.
    expect(posted[1]!.opId).not.toBe(posted[0]!.opId)
  })
})

describe('move page choices', () => {
  const ITEM = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  let posted: Record<string, unknown>[]
  beforeEach(() => {
    signInAs(staff)
    posted = []
    localStorage.setItem('hbt:recent-locations', JSON.stringify([{ id: 'shelf2', name: 'Полка 02', path: 'Склад 2 / Полка 02' }]))
    registerEndpoint(`/api/items/${ITEM}`, () => ({ ...item(ITEM, 30, { name: 'Крокодилы' }), locationPath: [] }))
    registerEndpoint('/api/locations/tree', () => tree)
    registerEndpoint('/api/items/lookup', (event) => {
      const code = String(getQuery(event).code)
      if (code === 'SHELF2') return { items: [], location: { id: 'shelf2', name: 'Полка 02' } }
      if (code === 'HERE') return { items: [], location: { id: 'shelf', name: 'Полка 01' } }
      if (code === 'OTHER') return { items: [item('other')], location: null }
      return { items: [], location: null }
    })
    registerEndpoint('/api/transfers/preview', { method: 'POST', handler: async (event) => {
      const body = await readBody(event)
      return {
        kind: 'merge', quantity: body.quantity, suggestedMergeIntoId: null,
        mergeCandidates: [item('m1', 35, { name: 'Крокодилы', assetId: '000-017' }), item('m2', 5, { name: 'Крокодилы', assetId: '000-028' })],
      }
    } })
    registerEndpoint('/api/transfers', { method: 'POST', handler: async (event) => {
      posted.push(await readBody(event))
      return { opId: 'op', status: 'done' }
    } })
  })

  it('takes the target from a scan or a recent place, never the current shelf', async () => {
    const page = await mountSuspended(MovePage, { route: `/item/${ITEM}/move` })
    await settle()
    scan('HERE')
    await settle()
    expect(page.text()).toContain('уже лежит в «Полка 01»')
    await page.findAll('button').find((b: { text: () => string }) => b.text().includes('Склад 2Полка 02'))!.trigger('click')
    await settle()
    expect(page.text()).toContain('На полке уже есть такой товар')
    scan('OTHER')
    await settle()
    expect(useRouter().currentRoute.value.path).toBe('/item/other')
  })

  it('waits for the choice between several matching records, then merges into it', async () => {
    const page = await mountSuspended(MovePage, { route: `/item/${ITEM}/move?to=shelf2` })
    await settle()
    const confirm = page.findAll('button').find((b: { text: () => string }) => b.text().includes('Подтвердить'))!
    expect(page.text()).toContain('Выберите запись на полке')
    expect(confirm.attributes('disabled')).toBeDefined()
    await page.find('[aria-label="Больше"]').trigger('click')
    await settle()
    await page.findAll('[role="radio"]').find((b: { text: () => string }) => b.text().includes('000-028'))!.trigger('click')
    expect(page.text()).toContain('5 → 7 шт.')
    expect(page.text()).toContain('Здесь останется 28 шт.')
    await confirm.trigger('click')
    await settle()
    expect(posted).toEqual([expect.objectContaining({ mergeIntoId: 'm2', quantity: 2, targetLocationId: 'shelf2' })])
    expect(useRouter().currentRoute.value.path).toBe('/result/op')
  })

  it('can write the quantity as a separate record instead', async () => {
    const page = await mountSuspended(MovePage, { route: `/item/${ITEM}/move?to=shelf2` })
    await settle()
    await page.findAll('[role="radio"]').find((b: { text: () => string }) => b.text().includes('Записать отдельной строкой'))!.trigger('click')
    expect(page.text()).toContain('Появится новая запись')
    await page.findAll('button').find((b: { text: () => string }) => b.text().includes('Подтвердить'))!.trigger('click')
    await settle()
    expect(posted[0]).toMatchObject({ mergeIntoId: null })
  })
})

