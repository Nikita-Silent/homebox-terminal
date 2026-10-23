import type { LocationRef } from '#shared/types/terminal'

export interface BackTarget {
  to: string
  label: string
}

/**
 * Where «Назад» from an item card leads: the list the card was opened from (search results with
 * their query, a shelf, the catalogue, the cart), else the shelf the item lies on.
 * `previous` is the router's previous history entry; `placeName` names a location by id.
 */
export function backTarget(
  previous: string | null | undefined,
  shelf: LocationRef | null,
  placeName: (id: string) => string | null,
): BackTarget {
  if (previous) {
    const url = new URL(previous, 'http://terminal')
    const path = url.pathname
    if (path === '/') {
      const q = url.searchParams.get('q')
      return { to: previous, label: q ? `К выдаче «${q}»` : 'К поиску' }
    }
    if (path === '/browse') return { to: previous, label: 'Ко всем складам' }
    if (path === '/browse/all') return { to: previous, label: 'Ко всему оборудованию' }
    if (path.startsWith('/browse/')) {
      const name = placeName(path.slice('/browse/'.length))
      return { to: previous, label: name ? `К месту «${name}»` : 'К месту' }
    }
    if (path === '/cart') return { to: previous, label: 'К корзине' }
    if (path.startsWith('/admin/journal')) return { to: previous, label: 'К журналу' }
  }
  if (shelf) return { to: `/browse/${shelf.id}`, label: `К полке «${shelf.name}»` }
  return { to: '/', label: 'К поиску' }
}
