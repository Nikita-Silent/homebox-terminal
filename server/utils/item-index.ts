import type { HbEntitySummary } from '../homebox/types'

/**
 * Homebox 0.26.2 search does not match Cyrillic text (it lower-cases the query in Go but the
 * column with SQLite's ASCII-only lower()), so names are searched in a short-lived local copy
 * of the item list. ~1000 items fit in one request.
 */
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

export function normalizeSearch(text: string) {
  return text.toLocaleLowerCase('ru').replaceAll('ё', 'е').replace(/\s+/g, ' ').trim()
}

/** Every word of the query must appear in the name or the asset id. */
export function matchesQuery(item: HbEntitySummary, query: string) {
  const haystack = normalizeSearch(`${item.name} ${item.assetId}`)
  return normalizeSearch(query).split(' ').every(word => haystack.includes(word))
}

/**
 * Homebox's asset-id lookup (`/v1/assets/{id}`) returns entities without photo ids;
 * the item list has them, so they are taken from the local copy.
 */
export async function withPhotos<T extends HbEntitySummary>(items: T[]): Promise<T[]> {
  if (!items.some(item => !item.entityType.isLocation && !item.imageId)) return items
  const byId = new Map((await getAllItems()).map(item => [item.id, item]))
  return items.map((item) => {
    const known = byId.get(item.id)
    return known?.imageId ? { ...item, imageId: known.imageId, thumbnailId: known.thumbnailId } : item
  })
}
