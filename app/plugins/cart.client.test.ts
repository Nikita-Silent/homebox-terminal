import { beforeEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { item } from '~/test/fixtures'

const anna = { id: 'anna', name: 'Анна', role: 'staff' as const, idleMinutes: 15 }
const boris = { id: 'boris', name: 'Борис', role: 'staff' as const, idleMinutes: 15 }

async function signInAs(user: typeof anna | null) {
  useAuth().user.value = user
  await nextTick()
}

beforeEach(async () => {
  localStorage.clear()
  await signInAs(null)
})

describe('cart storage', () => {
  it('keeps each employee’s cart to themselves and brings it back on their next sign-in', async () => {
    const cart = useCart()
    await signInAs(anna)
    cart.add(item('1'))
    await nextTick()
    expect(JSON.parse(localStorage.getItem('hbt:cart:anna')!)).toHaveLength(1)

    await signInAs(null)
    expect(cart.count.value).toBe(0)
    await signInAs(boris)
    expect(cart.count.value).toBe(0)
    cart.add(item('2'))
    await nextTick()
    await signInAs(null)

    await signInAs(anna)
    expect(cart.lines.value.map(l => l.item.id)).toEqual(['1'])
  })

  it('removes the saved cart when it is emptied', async () => {
    const cart = useCart()
    await signInAs(anna)
    cart.add(item('1'))
    await nextTick()
    cart.clear()
    await nextTick()
    expect(localStorage.getItem('hbt:cart:anna')).toBeNull()
  })

  it('starts empty when the saved cart is damaged', async () => {
    localStorage.setItem('hbt:cart:anna', '{oops')
    await signInAs(anna)
    expect(useCart().count.value).toBe(0)
    localStorage.setItem('hbt:cart:boris', '"not a list"')
    await signInAs(boris)
    expect(useCart().count.value).toBe(0)
  })
})
