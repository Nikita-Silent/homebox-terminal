import { z } from 'zod'
import type { LookupResult } from '../../../shared/types/terminal'
import { HomeboxError } from '../../homebox/client'
import { toItemSummary } from '../../homebox/mappers'

const Query = z.object({ code: z.string().trim().min(1).max(500) })

/** Resolves a scanned barcode / QR code. */
export default defineTerminalHandler(async (event): Promise<LookupResult> => {
  const { code } = parseWith(Query, getQuery(event))
  const homebox = useHomebox()
  const parsed = parseScannedCode(code)

  if (parsed.kind === 'entity') {
    try {
      const entity = await homebox.getEntity(parsed.id)
      return entity.entityType.isLocation
        ? { items: [], location: { id: entity.id, name: entity.name } }
        : { items: [toItemSummary(entity)], location: null }
    }
    catch (error) {
      if (error instanceof HomeboxError && error.isNotFound) return { items: [], location: null }
      throw error
    }
  }

  if (parsed.kind === 'asset') {
    const found = await homebox.getByAssetId(parsed.assetId)
    const location = found.find(e => e.entityType.isLocation)
    return {
      items: found.filter(e => !e.entityType.isLocation).map(toItemSummary),
      location: location ? { id: location.id, name: location.name } : null,
    }
  }

  const [remote, all] = await Promise.all([
    homebox.listItems({ q: parsed.text, pageSize: 30 }).then(r => r.items ?? []),
    getAllItems(),
  ])
  const ids = new Set(remote.map(item => item.id))
  const local = all.filter(item => !ids.has(item.id) && matchesQuery(item, parsed.text))
  return { items: [...remote, ...local].slice(0, 30).map(toItemSummary), location: null }
})
