import { z } from 'zod'
import type { ItemSearchResult } from '../../../shared/types/terminal'
import type { HbEntitySummary } from '../../homebox/types'
import { toItemSummary } from '../../homebox/mappers'

const LIMIT = 50

const Query = z.object({ q: z.string().trim().min(1).max(200) })

/** Search by name, model, serial number or asset id (UID), through Homebox's own search. */
export default defineTerminalHandler(async (event): Promise<ItemSearchResult> => {
  const { q } = parseWith(Query, getQuery(event))
  const [byAsset, found] = await Promise.all([
    looksLikeAssetId(q) ? useHomebox().getByAssetId(q).then(withPhotos) : Promise.resolve([]),
    useHomebox().listItems({ q, pageSize: LIMIT }).then(r => r.items ?? []),
  ])

  const seen = new Set<string>()
  const merged: HbEntitySummary[] = []
  for (const item of [...byAsset, ...found]) {
    if (item.entityType.isLocation || item.archived || seen.has(item.id)) continue
    seen.add(item.id)
    merged.push(item)
  }

  return { items: merged.slice(0, LIMIT).map(toItemSummary), total: merged.length }
})
