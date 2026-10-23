import { mountSuspended } from '@nuxt/test-utils/runtime'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { admin, item, signInAs, staff, tree } from '~/test/fixtures'
import AppRail from './AppRail.vue'
import CameraScanner from './CameraScanner.vue'
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

  it('clamps typed values and restores a valid number on blur', async () => {
    const { wrapper, updates } = await mount(2, 10)
    const input = wrapper.find('input')
    await input.setValue('25')
    expect(updates.at(-1)).toBe(10)
    await input.setValue('0')
    expect(updates.at(-1)).toBe(1)
    await input.setValue('abc')
    await input.trigger('blur')
    expect((input.element as HTMLInputElement).value).toBe('1')
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
    const rows = () => wrapper.findAll('[role="treeitem"]').map(r => r.text().replace(/\s+/g, ' ').trim())
    return { wrapper, picked, rows }
  }

  it('shows top-level places and expands on demand', async () => {
    const { wrapper, rows } = await mount()
    expect(rows()).toEqual(['Склад 1', 'Склад 2'])
    await wrapper.find('[aria-label="Развернуть Склад 1"]').trigger('click')
    expect(rows()).toEqual(['Склад 1', 'Помещение А', 'Склад 2'])
    await wrapper.find('[aria-label="Свернуть Склад 1"]').trigger('click')
    expect(rows()).toEqual(['Склад 1', 'Склад 2'])
  })

  it('opens the way to the current place and refuses to pick it', async () => {
    const { wrapper, picked } = await mount('shelf')
    expect(wrapper.find('[data-id="shelf"]').text()).toContain('Сейчас здесь')
    const current = wrapper.find('[data-id="shelf"] button:last-child')
    expect(current.attributes('disabled')).toBeDefined()
    await current.trigger('click')
    expect(picked).toEqual([])
  })

  it('filters by every word over the full path, ignoring case and ё', async () => {
    const { wrapper, picked, rows } = await mount()
    await wrapper.find('input').setValue('СКЛАД 2 полка')
    // While filtering, each row shows its parents above the name.
    expect(rows()).toEqual(['Склад 2Полка 02'])
    await wrapper.find('[data-id="shelf2"] button').trigger('click')
    expect(picked).toEqual([{ id: 'shelf2', name: 'Полка 02', path: 'Склад 2 / Полка 02' }])
    await nextTick()
    expect(wrapper.text()).toContain('Куда: Склад 2')
    await wrapper.find('input').setValue('чердак')
    expect(wrapper.text()).toContain('Нет локаций по запросу «чердак»')
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

  it('gives staff no admin sections, and the cart only when it has lines', async () => {
    signInAs(staff)
    const wrapper = await mountSuspended(AppRail)
    expect(wrapper.text()).toContain('Иван Петров')
    expect(wrapper.text()).toContain('Выйти')
    expect(wrapper.find('a[href="/admin/journal"]').exists()).toBe(false)
    expect(wrapper.find('a[href="/cart"]').exists()).toBe(false)
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
    const tap = async (el: Element = input) => {
      el.dispatchEvent(new Event('pointerdown', { bubbles: true }))
      ;(el as HTMLElement).focus()
      await nextTick()
    }
    const key = (name: string) => wrapper.findAll('button').find(b => b.text() === name || b.attributes('aria-label') === name)!
    cleanup = () => {
      wrapper.unmount()
      host.remove()
    }
    return { wrapper, host, input, tap, key }
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
})
