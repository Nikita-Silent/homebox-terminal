import type { ItemSummary } from '../../../shared/types/terminal'
import { toItemSummary } from '../../homebox/mappers'

/** Every item, sorted by name — for picking from a list when the name is unknown. */
export default defineTerminalHandler(async (): Promise<ItemSummary[]> => {
  const items = await getAllItems()
  return items
    .filter(item => !item.entityType.isLocation && !item.archived)
    .sort((a, b) => a.name.localeCompare(b.name, 'ru', { numeric: true }))
    .map(toItemSummary)
})
