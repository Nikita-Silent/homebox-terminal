import type { LocationNode, LocationRef } from '#shared/types/terminal'

/** Places change rarely; a list opened again within this time reuses the tree it already has. */
const MAX_AGE_MS = 60_000

let loading: Promise<void> | null = null

/**
 * The location tree shared by every screen of the terminal, loaded once and refreshed when it is
 * older than a minute. Lists use it to show where an item lies: «Склад 1 / Помещение 2 / Полка 01»,
 * not just «Полка 01», which repeats in every warehouse.
 */
export function useLocationTree() {
  const tree = useState<LocationNode[] | null>('location-tree', () => null)
  const loadedAt = useState('location-tree:at', () => 0)

  function load(force = false) {
    if (!force && tree.value && Date.now() - loadedAt.value < MAX_AGE_MS) return Promise.resolve()
    loading ??= $fetch<LocationNode[]>('/api/locations/tree')
      .then((value) => {
        tree.value = value
        loadedAt.value = Date.now()
      })
      // Without the tree a list still shows the item's own place.
      .catch(() => {})
      .finally(() => {
        loading = null
      })
    return loading
  }

  /** Root → location, for every location in the tree. */
  const paths = computed(() => {
    const map = new Map<string, LocationRef[]>()
    const walk = (nodes: LocationNode[], parents: LocationRef[]) => {
      for (const node of nodes) {
        const path = [...parents, { id: node.id, name: node.name }]
        map.set(node.id, path)
        walk(node.children, path)
      }
    }
    walk(tree.value ?? [], [])
    return map
  })

  const pathTo = (locationId: string | null | undefined) => (locationId ? paths.value.get(locationId) ?? null : null)

  return { tree, load, paths, pathTo }
}
