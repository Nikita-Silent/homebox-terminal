import { describe, expect, it } from 'vitest'
import { backTarget } from './back-target'

const shelf = { id: 'shelf', name: 'Полка 01' }
const names: Record<string, string> = { room: 'Помещение А' }
const place = (id: string) => names[id] ?? null

describe('back from an item card', () => {
  it('returns to the list the card was opened from, with its query', () => {
    expect(backTarget('/?q=%D0%BA%D0%B0%D0%B1', shelf, place)).toEqual({ to: '/?q=%D0%BA%D0%B0%D0%B1', label: 'К выдаче «каб»' })
    expect(backTarget('/', shelf, place)).toEqual({ to: '/', label: 'К поиску' })
    expect(backTarget('/browse/room?view=items', shelf, place)).toEqual({ to: '/browse/room?view=items', label: 'К месту «Помещение А»' })
    expect(backTarget('/browse/unknown', shelf, place).label).toBe('К месту')
    expect(backTarget('/browse/all', shelf, place).label).toBe('Ко всему оборудованию')
    expect(backTarget('/browse', shelf, place).label).toBe('Ко всем складам')
    expect(backTarget('/cart', shelf, place).label).toBe('К корзине')
    expect(backTarget('/admin/journal?period=week', shelf, place).label).toBe('К журналу')
  })

  it('falls back to the item\'s own shelf when it came from elsewhere or from nowhere', () => {
    expect(backTarget('/result/op-1', shelf, place)).toEqual({ to: '/browse/shelf', label: 'К полке «Полка 01»' })
    expect(backTarget(null, shelf, place)).toEqual({ to: '/browse/shelf', label: 'К полке «Полка 01»' })
    expect(backTarget(null, null, place)).toEqual({ to: '/', label: 'К поиску' })
  })
})
