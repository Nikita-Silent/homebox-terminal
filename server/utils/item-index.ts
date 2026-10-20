import type { HbEntitySummary } from '../homebox/types'

/** A short-lived copy of the whole item list, for the full list screen. ~1000 items fit in one request. */
const MAX_AGE_MS = 30_000
const PAGE_SIZE = 1000

let cache: { at: number, items: HbEntitySummary[] } | null = null
let loading: Promise<HbEntitySummary[]> | null = null

async function load(): Promise<HbEntitySummary[]> {
  const homebox = useHomebox()
  const items: HbEntitySummary[] = []
  for (let page = 1; ; page++) {
    const result = await homebox.listItems({ page, pageSize: PAGE_SIZE })
    items.push(...(result.items ?? []))
    if (!result.items?.length || items.length >= result.total) break
  }
  cache = { at: Date.now(), items }
  return items
}

export async function getAllItems(): Promise<HbEntitySummary[]> {
  if (cache && Date.now() - cache.at < MAX_AGE_MS) return cache.items
  loading ??= load().finally(() => {
    loading = null
  })
  return loading
}

export function invalidateItemIndex() {
  cache = null
}

/**
 * Homebox's asset-id lookup (`/v1/assets/{id}`) returns entities without photo ids;
 * the item card has them. A UID matches one record, so this is a request or two.
 */
export async function withPhotos<T extends HbEntitySummary>(items: T[]): Promise<T[]> {
  const homebox = useHomebox()
  return Promise.all(items.map(async (item) => {
    if (item.entityType.isLocation || item.imageId) return item
    const { imageId, thumbnailId } = await homebox.getEntity(item.id)
    return imageId ? { ...item, imageId, thumbnailId } : item
  }))
}
