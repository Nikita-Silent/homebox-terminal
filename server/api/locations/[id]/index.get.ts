import type { LocationContents, LocationNode } from '../../../../shared/types/terminal'
import { toItemSummary, toLocationTree } from '../../../homebox/mappers'
import { TransferError } from '../../../services/transfers/types'

/** What lies directly in a location: its sublocations and its items. */
export default defineTerminalHandler(async (event): Promise<LocationContents> => {
  const id = getIdParam(event)
  const homebox = useHomebox()
  const [location, path, tree, list] = await Promise.all([
    homebox.getEntity(id),
    homebox.getPath(id),
    homebox.getLocationTree(),
    homebox.listItems({ parentIds: [id], pageSize: 1000 }),
  ])
  if (!location.entityType.isLocation) throw new TransferError('NOT_FOUND', 'Это не локация')

  const find = (nodes: LocationNode[]): LocationNode | null => {
    for (const node of nodes) {
      if (node.id === id) return node
      const found = find(node.children)
      if (found) return found
    }
    return null
  }
  const node = find(toLocationTree(tree))
  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'ru', { numeric: true })

  return {
    location: { id: location.id, name: location.name },
    path: path.map(p => ({ id: p.id, name: p.name })),
    sublocations: (node?.children ?? []).map(c => ({ id: c.id, name: c.name })).sort(byName),
    items: (list.items ?? [])
      .filter(item => !item.entityType.isLocation && !item.archived && item.parent?.id === id)
      .sort(byName)
      .map(toItemSummary),
  }
})
