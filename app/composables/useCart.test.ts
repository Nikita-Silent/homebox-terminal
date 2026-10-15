import { beforeEach, describe, expect, it } from 'vitest'
import { item } from '~/test/fixtures'
import { CART_LIMIT, useCart } from './useCart'


beforeEach(() => useCart().clear())

describe('useCart', () => {
  it('adds a line once and counts it', () => {
    const cart = useCart()
    expect(cart.add(item('1'))).toBe('added')
    expect(cart.add(item('1'))).toBe('exists')
    expect(cart.count.value).toBe(1)
    expect(cart.has('1')).toBe(true)
    expect(cart.has('2')).toBe(false)
  })

  it('starts quantity-tracked records at 1 piece and single units at their quantity', () => {
    const cart = useCart()
    cart.add(item('many', 140))
    cart.add(item('one', 1))
    cart.add(item('empty', 0))
    expect(cart.lines.value.map(l => l.quantity)).toEqual([1, 1, 0])
  })

  it(`refuses more than ${CART_LIMIT} lines`, () => {
    const cart = useCart()
    for (let i = 0; i < CART_LIMIT; i++) expect(cart.add(item(String(i)))).toBe('added')
    expect(cart.add(item('extra'))).toBe('full')
    expect(cart.count.value).toBe(CART_LIMIT)
  })

  it('removes a line and clears everything', () => {
    const cart = useCart()
    cart.add(item('1'))
    cart.add(item('2'))
    cart.remove('1')
    expect(cart.lines.value.map(l => l.item.id)).toEqual(['2'])
    cart.clear()
    expect(cart.count.value).toBe(0)
  })

  it('shares one cart across components', () => {
    useCart().add(item('1'))
    expect(useCart().count.value).toBe(1)
  })
})
