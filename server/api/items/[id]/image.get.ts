import { z } from 'zod'
import { TransferError } from '../../../services/transfers/types'

// Raster formats only: an SVG "photo" would run its scripts on the terminal's origin.
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'])

const Query = z.object({
  size: z.enum(['thumb', 'full']).default('full'),
  // Cache key only (the photo's id); the photo itself is always read from Homebox.
  v: z.string().max(64).optional(),
})

/**
 * Proxies the item's primary photo, so the browser never needs the Homebox token.
 * `size=thumb` serves Homebox's small WebP for lists, falling back to the photo itself.
 */
export default defineTerminalHandler(async (event) => {
  const id = getIdParam(event)
  const { size, v } = parseWith(Query, getQuery(event))
  const homebox = useHomebox()
  const entity = await homebox.getEntity(id)
  if (!entity.imageId) throw new TransferError('NOT_FOUND', 'У оборудования нет фото')

  const attachmentId = size === 'thumb' ? entity.thumbnailId || entity.imageId : entity.imageId
  const response = await homebox.getAttachment(entity.id, attachmentId)
  const type = (response.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase()
  if (!IMAGE_TYPES.has(type)) throw new TransferError('NOT_FOUND', 'Вложение не является фотографией')

  setResponseHeaders(event, {
    'Content-Type': type,
    // A versioned URL never changes its content; an unversioned one is rechecked soon.
    'Cache-Control': v === entity.imageId ? 'private, max-age=86400, immutable' : 'private, max-age=300',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': 'default-src \'none\'; sandbox',
  })
  return new Uint8Array(await response.arrayBuffer())
})
