import type { ItemSummary, LocationNode, SessionUser } from '#shared/types/terminal'

export function item(id: string, quantity = 1, extra: Partial<ItemSummary> = {}): ItemSummary {
  return {
    id, name: `Item ${id}`, assetId: `000-${id}`, quantity, manufacturer: '', modelNumber: '',
    location: { id: 'shelf', name: 'Полка 01' }, hasImage: false, imageId: null, ...extra,
  }
}

export const staff: SessionUser = { id: 'u1', name: 'Иван Петров', role: 'staff', idleMinutes: 15 }
export const admin: SessionUser = { id: 'u2', name: 'Анна', role: 'admin', idleMinutes: 15 }

/** Sign in for the route guard without going through the API. */
export function signInAs(user: SessionUser | null) {
  useAuth().user.value = user
  useAuth().checked.value = true
}

export const tree: LocationNode[] = [
  { id: 'wh1', name: 'Склад 1', children: [
    { id: 'room', name: 'Помещение А', children: [{ id: 'shelf', name: 'Полка 01', children: [] }] },
  ] },
  { id: 'wh2', name: 'Склад 2', children: [{ id: 'shelf2', name: 'Полка 02', children: [] }] },
]
