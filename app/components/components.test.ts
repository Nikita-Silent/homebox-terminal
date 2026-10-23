import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { admin, item, signInAs, staff, tree } from '~/test/fixtures'
import AppRail from './AppRail.vue'
import CameraScanner from './CameraScanner.vue'
import HomeboxStatus from './HomeboxStatus.vue'
import ItemPhoto from './ItemPhoto.vue'
import ItemRow from './ItemRow.vue'
import LocationPicker from './LocationPicker.vue'
import LocationRow from './LocationRow.vue'
import QuantityStepper from './QuantityStepper.vue'
import StatusStrip from './StatusStrip.vue'
import TouchKeyboard from './TouchKeyboard.vue'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('ItemPhoto', () => {
  it('asks the proxy for a versioned thumbnail or the full photo', async () => {
    const photo = item('1', 1, { hasImage: true, imageId: 'img-7' })
    const thumb = await mountSuspended(ItemPhoto, { props: { item: photo } })
    expect(thumb.find('img').attributes()).toMatchObject({ src: '/api/items/1/image?size=thumb&v=img-7', alt: 'Фото: Item 1', loading: 'lazy' })
    const full = await mountSuspended(ItemPhoto, { props: { item: photo, size: 'full', decorative: true } })
    expect(full.find('img').attributes()).toMatchObject({ src: '/api/items/1/image?size=full&v=img-7', alt: '' })
  })

  it('renders nothing without a photo, and disappears when the photo fails', async () => {
    expect((await mountSuspended(ItemPhoto, { props: { item: item('1') } })).find('img').exists()).toBe(false)
    const wrapper = await mountSuspended(ItemPhoto, { props: { item: item('1', 1, { hasImage: true, imageId: 'a' }) } })
    await wrapper.find('img').trigger('error')
    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.emitted('failed')).toHaveLength(1)
    // A replaced photo gets another chance.
    await wrapper.setProps({ item: item('1', 1, { hasImage: true, imageId: 'b' }) })
    expect(wrapper.find('img').exists()).toBe(true)
  })
})

describe('ItemRow', () => {
  it('links to the card and shows name, quantity, UID, model and place', async () => {
    const wrapper = await mountSuspended(ItemRow, { props: { item: item('7', 35, { name: 'Крокодилы', modelNumber: 'AC-1' }) } })
    expect(wrapper.find('a').attributes('href')).toBe('/item/7')
    const text = wrapper.text()
    for (const part of ['Крокодилы', '35', 'UID 000-7', 'AC-1', 'Полка 01']) expect(text).toContain(part)
    expect(wrapper.find('img').exists()).toBe(false)
  })

  it('shows the thumbnail when the item has a photo', async () => {
    const wrapper = await mountSuspended(ItemRow, { props: { item: item('7', 1, { hasImage: true, imageId: 'x' }) } })
    expect(wrapper.find('img').attributes('src')).toContain('size=thumb')
  })

  it('names the warehouse and the room, not just a shelf that repeats everywhere', async () => {
    registerEndpoint('/api/locations/tree', () => tree)
    useLocationTree().tree.value = null
    const wrapper = await mountSuspended(ItemRow, { props: { item: item('7') } })
    await flushPromises()
    expect(wrapper.find('[data-place]').text().replace(/\s+/g, ' ')).toBe('Склад 1 / Помещение А / Полка 01')
    const inPlace = await mountSuspended(ItemRow, { props: { item: item('7'), place: false } })
    expect(inPlace.find('[data-place]').exists()).toBe(false)
  })
})

describe('QuantityStepper', () => {
  async function mount(value: number, max: number) {
    const updates: number[] = []
    const wrapper = await mountSuspended(QuantityStepper, {
      props: { 'modelValue': value, max, 'onUpdate:modelValue': (v: number) => {
        updates.push(v)
        void wrapper.setProps({ modelValue: v })
      } },
    })
    return { wrapper, updates }
  }

  it('steps within 1…max and offers «all»', async () => {
    const { wrapper, updates } = await mount(1, 3)
    const [minus, plus, all] = [wrapper.find('[aria-label="Меньше"]'), wrapper.find('[aria-label="Больше"]'), wrapper.findAll('button').at(-1)!]
    expect(minus.attributes('disabled')).toBeDefined()
    await plus.trigger('click')
    await plus.trigger('click')
    expect(updates).toEqual([2, 3])
    expect(plus.attributes('disabled')).toBeDefined()
    await minus.trigger('click')
    await all.trigger('click')
    expect(updates.at(-1)).toBe(3)
    expect(all.text()).toContain('Все 3 шт.')
  })

  it('clamps typed values at once, says so, and restores a valid number on blur', async () => {
    const { wrapper, updates } = await mount(2, 10)
    const input = wrapper.find('input')
    await input.setValue('25')
    expect(updates.at(-1)).toBe(10)
    // The field shows what will move, not what was typed.
    expect((input.element as HTMLInputElement).value).toBe('10')
    expect(wrapper.text()).toContain('Больше нет: здесь всего 10 шт.')
    await input.setValue('0')
    expect(updates.at(-1)).toBe(1)
    expect(wrapper.text()).not.toContain('Больше нет')
    await input.setValue('abc')
    await input.trigger('blur')
    expect((input.element as HTMLInputElement).value).toBe('1')
  })

  it('repeats a held key, faster and on round numbers the longer it is held', async () => {
    vi.useFakeTimers()
    try {
      const { wrapper, updates } = await mount(1, 100)
      const plus = wrapper.find('[aria-label="Больше"]')
      await plus.trigger('pointerdown', { button: 0 })
      expect(updates).toEqual([2])
      await vi.advanceTimersByTimeAsync(450 + 110 * 6)
      expect(updates.at(-1)).toBe(9)
      await vi.advanceTimersByTimeAsync(110 * 3)
      // Past the first second, steps of 5 land on round numbers.
      expect(updates.slice(-3)).toEqual([10, 15, 20])
      await plus.trigger('pointerup')
      const last = updates.length
      await vi.advanceTimersByTimeAsync(1000)
      expect(updates).toHaveLength(last)
      // The click that ends a press adds nothing; one from the keyboard steps once.
      await plus.trigger('click', { detail: 1 })
      expect(updates).toHaveLength(last)
    }
    finally {
      vi.useRealTimers()
    }
  })
})

describe('StatusStrip', () => {
  it('announces errors and attention as alerts, the rest as status', async () => {
    const error = await mountSuspended(StatusStrip, { props: { kind: 'error', title: 'Не удалось', message: 'Нет связи' } })
    expect(error.attributes('role')).toBe('alert')
    expect(error.text()).toContain('Не удалось')
    expect(error.text()).toContain('Нет связи')
    expect(error.classes()).toContain('bg-ink')
    for (const kind of ['info', 'pending'] as const) {
      expect((await mountSuspended(StatusStrip, { props: { kind, message: 'x' } })).attributes('role')).toBe('status')
    }
    const attention = await mountSuspended(StatusStrip, { props: { kind: 'attention', message: 'x' } })
    expect(attention.attributes('role')).toBe('alert')
    expect(attention.find('.hatch-attention').exists()).toBe(true)
  })
})

describe('LocationPicker', () => {
  async function mount(currentId: string | null = null) {
    const picked: unknown[] = []
    const wrapper = await mountSuspended(LocationPicker, {
      props: { 'tree': tree, currentId, 'modelValue': null, 'onUpdate:modelValue': (v: unknown) => {
        picked.push(v)
        void wrapper.setProps({ modelValue: v as never })
      } },
    })
    const rows = () => wrapper.findAll('li[data-id]').map(r => r.text().replace(/\s+/g, ' ').trim())
    const button = (name: string) => wrapper.findAll('button').find(b => b.text().replace(/\s+/g, ' ').includes(name) || b.attributes('aria-label') === name)!
    return { wrapper, picked, rows, button }
  }

  it('shows one level at a time: a place with places inside opens, it never gets picked by that tap', async () => {
    const { picked, rows, button } = await mount()
    expect(rows()).toEqual(['Склад 1Внутри: 1', 'Склад 2Внутри: 1'])
    await button('Открыть «Склад 1»').trigger('click')
    expect(rows()).toEqual(['Помещение АВнутри: 1'])
    expect(picked).toEqual([])
    await button('Открыть «Помещение А»').trigger('click')
    expect(rows()).toEqual(['Полка 01'])
    await button('На уровень выше').trigger('click')
    expect(rows()).toEqual(['Помещение АВнутри: 1'])
    await button('Все склады').trigger('click')
    expect(rows()).toEqual(['Склад 1Внутри: 1', 'Склад 2Внутри: 1'])
  })

  it('picks a shelf with one tap, and a room only with its own «Сюда» key', async () => {
    const { picked, button } = await mount()
    await button('Открыть «Склад 1»').trigger('click')
    await button('Сюда: «Склад 1»').trigger('click')
    expect(picked).toEqual([{ id: 'wh1', name: 'Склад 1', path: 'Склад 1' }])
    await button('Открыть «Склад 1»').trigger('click')
    await button('Открыть «Помещение А»').trigger('click')
    await button('Полка 01').trigger('click')
    expect(picked.at(-1)).toEqual({ id: 'shelf', name: 'Полка 01', path: 'Склад 1 / Помещение А / Полка 01' })
  })

  it('opens next to the current place and refuses to pick it', async () => {
    const { wrapper, picked } = await mount('shelf')
    expect(wrapper.find('[data-id="shelf"]').text()).toContain('Сейчас здесь')
    const current = wrapper.find('[data-id="shelf"] button')
    expect(current.attributes('disabled')).toBeDefined()
    await current.trigger('click')
    expect(picked).toEqual([])
  })

  it('filters by every word over the full path, grouped by warehouse, ignoring case and ё', async () => {
    const { wrapper, picked, rows } = await mount()
    await wrapper.find('input').setValue('СКЛАД 2 полка')
    expect(rows()).toEqual(['Полка 02'])
    expect(wrapper.find('section[aria-label="Склад 2"]').exists()).toBe(true)
    await wrapper.find('[data-id="shelf2"] button').trigger('click')
    expect(picked).toEqual([{ id: 'shelf2', name: 'Полка 02', path: 'Склад 2 / Полка 02' }])
    await nextTick()
    expect(wrapper.text()).toContain('Куда: Склад 2')
    await wrapper.find('input').setValue('чердак')
    expect(wrapper.text()).toContain('Нет мест по запросу «чердак»')
    await wrapper.find('[aria-label="Очистить: Найти склад, помещение или полку"]').trigger('click')
    expect((wrapper.find('input').element as HTMLInputElement).value).toBe('')
  })
})

describe('LocationRow', () => {
  it('links to the place with an optional hint', async () => {
    const wrapper = await mountSuspended(LocationRow, { props: { to: '/browse/wh1', name: 'Склад 1', hint: 'Внутри: 2' } })
    expect(wrapper.find('a').attributes('href')).toBe('/browse/wh1')
    expect(wrapper.text()).toContain('Внутри: 2')
  })
})

describe('AppRail', () => {
  beforeEach(() => useCart().clear())

  it('shows only the brand before sign-in', async () => {
    signInAs(null)
    const wrapper = await mountSuspended(AppRail)
    expect(wrapper.text()).not.toContain('Выйти')
    expect(wrapper.text()).not.toContain('Журнал')
  })

  it('gives staff no admin sections, and the cart always, with its count once it has lines', async () => {
    signInAs(staff)
    const wrapper = await mountSuspended(AppRail)
    expect(wrapper.text()).toContain('Иван Петров')
    expect(wrapper.text()).toContain('Выйти')
    expect(wrapper.find('a[href="/admin/journal"]').exists()).toBe(false)
    // An empty cart is still where collecting by scanner starts.
    expect(wrapper.find('a[href="/cart"]').attributes('aria-label')).toBe('Корзина')
    useCart().add(item('1'))
    useCart().add(item('2'))
    await nextTick()
    expect(wrapper.find('a[href="/cart"]').attributes('aria-label')).toBe('Корзина: 2')
  })

  it('gives admins the journal and employees', async () => {
    signInAs(admin)
    const wrapper = await mountSuspended(AppRail)
    expect(wrapper.find('a[href="/admin/journal"]').exists()).toBe(true)
    expect(wrapper.find('a[href="/admin/users"]').exists()).toBe(true)
  })
})

describe('HomeboxStatus', () => {
  const health = (homebox: string, homeboxVersion: string | null = '0.27.0', homeboxTested = true) =>
    registerEndpoint('/api/health', () => ({ ok: true, homebox, homeboxConfigured: homebox !== 'not_configured', homeboxVersion, homeboxTested }))

  async function mount() {
    const wrapper = await mountSuspended(HomeboxStatus)
    const status = () => wrapper.find('[role="status"]').text()
    return { wrapper, status }
  }

  it('shows a working Homebox quietly and a problem loudly', async () => {
    health('ok')
    const { wrapper, status } = await mount()
    await vi.waitFor(() => expect(status()).toBe('Homebox на связи'))
    expect(wrapper.find('button').classes()).not.toContain('bg-paper')
    expect(wrapper.find('button').attributes('title')).toBeUndefined()
    expect(wrapper.find('button').text()).toBe('')
    expect(wrapper.find('.bg-connection-ok').exists()).toBe(true)

    health('unreachable', null, false)
    await wrapper.find('button').trigger('click')
    await vi.waitFor(() => expect(status()).toBe('Homebox недоступен'))
    expect(wrapper.find('button').classes()).toContain('bg-paper')
    expect(wrapper.find('.hatch-attention').exists()).toBe(true)
  })

  it('opens connection details on touch and closes them on the next tap', async () => {
    health('ok')
    const { wrapper, status } = await mount()
    await vi.waitFor(() => expect(status()).toBe('Homebox на связи'))
    const button = wrapper.find('button')
    expect(button.attributes('aria-expanded')).toBe('false')
    await button.trigger('click')
    expect(button.attributes('aria-expanded')).toBe('true')
    expect(wrapper.text()).toContain('Версия 0.27.0')
    await button.trigger('click')
    expect(button.attributes('aria-expanded')).toBe('false')
    expect(wrapper.text()).not.toContain('Версия 0.27.0')
  })

  it('names a refused key, a missing setup, an untested version and a lost terminal server', async () => {
    const cases: [() => void, string][] = [
      [() => health('unauthorized'), 'Homebox: ключ не принят'],
      [() => health('not_configured', null, false), 'Homebox не настроен'],
      [() => health('ok', '0.28.0', false), 'Homebox 0.28.0 не проверен'],
      [() => registerEndpoint('/api/health', () => { throw createError({ statusCode: 502 }) }), 'Нет связи с терминалом'],
    ]
    for (const [setup, text] of cases) {
      setup()
      const { status } = await mount()
      await vi.waitFor(() => expect(status()).toBe(text))
    }
  })

  it('checks again every 20 s', async () => {
    let calls = 0
    registerEndpoint('/api/health', () => {
      calls++
      return { ok: true, homebox: 'ok', homeboxConfigured: true, homeboxVersion: '0.27.0', homeboxTested: true }
    })
    vi.useFakeTimers()
    await mount()
    await vi.advanceTimersByTimeAsync(0)
    const first = calls
    await vi.advanceTimersByTimeAsync(20_000)
    expect(calls).toBe(first + 1)
    vi.useRealTimers()
  })
})

describe('CameraScanner', () => {
  it('explains when the browser gives no camera (plain HTTP over the LAN)', async () => {
    vi.stubGlobal('navigator', { ...navigator, mediaDevices: undefined })
    const wrapper = await mountSuspended(CameraScanner)
    await vi.waitFor(() => expect(wrapper.text()).toContain('Камера работает только по HTTPS'))
  })

  it('explains a denied camera', async () => {
    vi.stubGlobal('navigator', { ...navigator, mediaDevices: { getUserMedia: () => Promise.reject(new DOMException('no', 'NotAllowedError')) } })
    const wrapper = await mountSuspended(CameraScanner)
    await vi.waitFor(() => expect(wrapper.text()).toContain('Разрешите доступ к камере'))
  })

  it('reads a code with the native detector, then releases the camera', async () => {
    const stopTrack = vi.fn()
    vi.stubGlobal('navigator', { ...navigator, mediaDevices: { getUserMedia: async () => ({ getTracks: () => [{ stop: stopTrack }] }) } })
    vi.stubGlobal('BarcodeDetector', class {
      async detect() {
        return [{ rawValue: '000-016' }]
      }
    })
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
    vi.spyOn(HTMLMediaElement.prototype, 'srcObject', 'set').mockImplementation(() => {})
    vi.spyOn(HTMLMediaElement.prototype, 'readyState', 'get').mockReturnValue(4)
    const wrapper = await mountSuspended(CameraScanner)
    await vi.waitFor(() => expect(wrapper.emitted('scan')).toEqual([['000-016']]))
    wrapper.unmount()
    expect(stopTrack).toHaveBeenCalled()
  })

  it('closes on the button and on Escape', async () => {
    vi.stubGlobal('navigator', { ...navigator, mediaDevices: undefined })
    const wrapper = await mountSuspended(CameraScanner)
    await wrapper.find('button').trigger('click')
    await wrapper.trigger('keydown', { key: 'Escape' })
    expect(wrapper.emitted('close')).toHaveLength(2)
  })
})

describe('TouchKeyboard', () => {
  let cleanup = () => {}
  afterEach(() => cleanup())

  async function setup(html: string) {
    const host = document.createElement('div')
    host.innerHTML = html
    document.body.append(host)
    const wrapper = await mountSuspended(TouchKeyboard, { attachTo: document.body })
    const input = host.querySelector('input')!
    const press = async (el: Element = input) => {
      el.dispatchEvent(new Event('pointerdown', { bubbles: true }))
      ;(el as HTMLElement).focus()
      await nextTick()
    }
    const tap = async (el: Element = input) => {
      await press(el)
      el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await nextTick()
    }
    const key = (name: string) => wrapper.findAll('button').find(b => b.text() === name || b.attributes('aria-label') === name)!
    cleanup = () => {
      wrapper.unmount()
      host.remove()
    }
    return { wrapper, host, input, press, tap, key }
  }

  it('opens on a tapped text field, types Russian, English and digits, and searches on «Найти»', async () => {
    const { wrapper, host, input, tap, key } = await setup(
      '<form><input type="search" inputmode="search" enterkeyhint="search"></form>',
    )
    const submitted = vi.fn((e: Event) => e.preventDefault())
    host.querySelector('form')!.addEventListener('submit', submitted)
    const typed: string[] = []
    input.addEventListener('input', () => typed.push(input.value))

    expect(wrapper.find('[aria-label="Экранная клавиатура"]').exists()).toBe(false)
    await tap()
    expect(wrapper.find('[aria-label="Экранная клавиатура"]').exists()).toBe(true)
    // The system keyboard stays down on tablets while this one is up.
    expect(input.getAttribute('inputmode')).toBe('none')

    for (const k of ['к', 'а', 'б']) await key(k).trigger('click')
    await key('Стереть').trigger('click')
    await key('Заглавная буква').trigger('click')
    await key('Ь').trigger('click')
    await key('ENG').trigger('click')
    for (const k of ['Пробел', 'u', 't', 'p', '6']) await key(k).trigger('click')
    expect(input.value).toBe('каЬ utp6')
    expect(typed).toHaveLength(10)

    await key('Всё').trigger('click')
    expect(input.value).toBe('')
    await key('Найти').trigger('click')
    expect(submitted).toHaveBeenCalledTimes(1)
    expect(wrapper.find('[aria-label="Экранная клавиатура"]').exists()).toBe(false)
    expect(input.getAttribute('inputmode')).toBe('search')
  })

  it('gives PIN fields the digit pad and hides on «Скрыть клавиатуру»', async () => {
    const { wrapper, input, tap, key } = await setup('<input inputmode="numeric">')
    await tap()
    expect(wrapper.text()).not.toContain('Пробел')
    for (const k of ['4', '8', '2']) await key(k).trigger('click')
    expect(input.value).toBe('482')
    expect(key('Готово').exists()).toBe(true)
    await key('Скрыть клавиатуру').trigger('click')
    expect(wrapper.find('[aria-label="Экранная клавиатура"]').exists()).toBe(false)
    expect(document.activeElement).not.toBe(input)
  })

  it('leaves dates, other controls and programmatic focus alone, and closes when focus moves on', async () => {
    const { wrapper, host, input, tap } = await setup('<input><input type="date"><button>ok</button>')
    input.focus()
    await nextTick()
    expect(wrapper.find('[aria-label="Экранная клавиатура"]').exists()).toBe(false)
    await tap(host.querySelector('input[type="date"]')!)
    expect(wrapper.find('[aria-label="Экранная клавиатура"]').exists()).toBe(false)

    await tap()
    expect(wrapper.find('[aria-label="Экранная клавиатура"]').exists()).toBe(true)
    await tap(host.querySelector('button')!)
    expect(wrapper.find('[aria-label="Экранная клавиатура"]').exists()).toBe(false)
    expect(input.hasAttribute('inputmode')).toBe(false)
  })

  it('comes up only when the opening tap has ended, so its click cannot land on what moved under it', async () => {
    vi.useFakeTimers()
    try {
      const { wrapper, input, press } = await setup('<input>')
      await press()
      // Already set while the finger is down: a tablet must not raise its own keyboard.
      expect(input.getAttribute('inputmode')).toBe('none')
      expect(wrapper.find('[aria-label="Экранная клавиатура"]').exists()).toBe(false)
      input.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await nextTick()
      expect(wrapper.find('[aria-label="Экранная клавиатура"]').exists()).toBe(true)

      // A long press that never clicks still gets the keyboard.
      input.blur()
      await nextTick()
      await press()
      expect(wrapper.find('[aria-label="Экранная клавиатура"]').exists()).toBe(false)
      vi.advanceTimersByTime(500)
      await nextTick()
      expect(wrapper.find('[aria-label="Экранная клавиатура"]').exists()).toBe(true)
    }
    finally {
      vi.useRealTimers()
    }
  })

  it('stays up while live search rewrites the query, and hides on a new screen', async () => {
    signInAs(staff)
    const { wrapper, tap } = await setup('<input>')
    const router = useRouter()
    await tap()
    await router.replace({ query: { q: 'каб' } })
    expect(wrapper.find('[aria-label="Экранная клавиатура"]').exists()).toBe(true)
    await router.push('/cart')
    await nextTick()
    expect(wrapper.find('[aria-label="Экранная клавиатура"]').exists()).toBe(false)
  })
})
