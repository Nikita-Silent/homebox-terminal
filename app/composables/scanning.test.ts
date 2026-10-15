import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { getQuery } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { useBrowseScanner } from './useBrowseScanner'
import { lookupCode } from './useLookup'
import { useRecentLocations } from './useRecentLocations'
import { useScanner } from './useScanner'

function type(text: string, target: EventTarget = window) {
  for (const key of text) target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
}

async function mountScanner(onScan: (code: string) => void, template = () => h('div')) {
  return mountSuspended(defineComponent({
    setup() {
      useScanner(onScan)
      return template
    },
  }), { attachTo: document.body })
}

afterEach(() => vi.restoreAllMocks())
// Screens are behind sign-in; navigation in these tests happens as a signed-in employee.
beforeEach(() => {
  useAuth().user.value = { id: 'u1', name: 'Иван', role: 'staff', idleMinutes: 15 }
  useAuth().checked.value = true
})

describe('useScanner', () => {
  it('turns a fast burst of keys ending with Enter into a code', async () => {
    const onScan = vi.fn()
    const wrapper = await mountScanner(onScan)
    type('000-016\n'.replace('\n', ''))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    expect(onScan).toHaveBeenCalledWith('000-016')
    wrapper.unmount()
  })

  it('ignores slow human typing, short codes and modified keys', async () => {
    const onScan = vi.fn()
    let t = 0
    vi.spyOn(performance, 'now').mockImplementation(() => (t += 100))
    const wrapper = await mountScanner(onScan)
    type('12345')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    vi.restoreAllMocks()
    type('ab')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', ctrlKey: true }))
    expect(onScan).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('leaves keys typed into a field to the field', async () => {
    const onScan = vi.fn()
    const wrapper = await mountScanner(onScan, () => h('input', { id: 'field' }))
    const input = document.getElementById('field')!
    type('000-016', input)
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(onScan).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('stops listening when the screen goes away', async () => {
    const onScan = vi.fn()
    const wrapper = await mountScanner(onScan)
    wrapper.unmount()
    type('000-016')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    expect(onScan).not.toHaveBeenCalled()
  })
})

describe('lookupCode', () => {
  it('asks the terminal API with the code', async () => {
    registerEndpoint('/api/items/lookup', (event) => ({ items: [], location: { id: 'x', name: String(getQuery(event).code) } }))
    expect(await lookupCode('А/1 2')).toEqual({ items: [], location: { id: 'x', name: 'А/1 2' } })
  })
})

describe('useBrowseScanner', () => {
  it('opens a location, an item or the search depending on the code', async () => {
    const results: Record<string, unknown> = {
      shelf: { items: [], location: { id: 'loc-1', name: 'Полка' } },
      item: { items: [{ id: 'item-1' }], location: null },
      many: { items: [{ id: 'a' }, { id: 'b' }], location: null },
    }
    registerEndpoint('/api/items/lookup', event => results[String(getQuery(event).code)])
    const onUnknown = vi.fn()
    const wrapper = await mountSuspended(defineComponent({
      setup() {
        useBrowseScanner(onUnknown)
        return () => h('div')
      },
    }))
    const router = useRouter()
    const scan = async (code: string) => {
      type(code)
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
      await vi.waitFor(() => expect(router.currentRoute.value.fullPath).not.toBe(before))
    }
    let before = router.currentRoute.value.fullPath
    await scan('shelf')
    expect(router.currentRoute.value.path).toBe('/browse/loc-1')
    before = router.currentRoute.value.fullPath
    await scan('item')
    expect(router.currentRoute.value.path).toBe('/item/item-1')
    before = router.currentRoute.value.fullPath
    await scan('many')
    expect(router.currentRoute.value.fullPath).toBe('/?q=many')
    wrapper.unmount()
  })

  it('reports lookup failures instead of navigating', async () => {
    registerEndpoint('/api/items/lookup', () => {
      throw createError({ statusCode: 503, data: { code: 'HOMEBOX_UNAVAILABLE', message: 'Homebox недоступен' } })
    })
    const onUnknown = vi.fn()
    const wrapper = await mountSuspended(defineComponent({
      setup() {
        useBrowseScanner(onUnknown)
        return () => h('div')
      },
    }))
    type('000-001')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    await vi.waitFor(() => expect(onUnknown).toHaveBeenCalledWith('Homebox недоступен'))
    wrapper.unmount()
  })
})

describe('useRecentLocations', () => {
  it('remembers the last six places, newest first, without duplicates, across visits', async () => {
    localStorage.removeItem('hbt:recent-locations')
    let api!: ReturnType<typeof useRecentLocations>
    const Probe = defineComponent({
      setup() {
        api = useRecentLocations()
        return () => h('div')
      },
    })
    const first = await mountSuspended(Probe)
    for (const id of ['1', '2', '3', '4', '5', '6', '7', '3']) api.remember({ id, name: `Полка ${id}`, path: `Склад / Полка ${id}` })
    expect(api.recent.value.map(l => l.id)).toEqual(['3', '7', '6', '5', '4', '2'])
    first.unmount()
    api.recent.value = []
    await mountSuspended(Probe)
    expect(api.recent.value.map(l => l.id)).toEqual(['3', '7', '6', '5', '4', '2'])
  })

  it('survives damaged or blocked storage', async () => {
    localStorage.setItem('hbt:recent-locations', '{broken')
    let api!: ReturnType<typeof useRecentLocations>
    await mountSuspended(defineComponent({
      setup() {
        api = useRecentLocations()
        return () => h('div')
      },
    }))
    expect(api.recent.value).toEqual([])
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota')
    })
    api.remember({ id: '1', name: 'Полка', path: 'Полка' })
    expect(api.recent.value).toHaveLength(1)
  })
})
