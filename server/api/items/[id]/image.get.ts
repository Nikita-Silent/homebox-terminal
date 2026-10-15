import { TransferError } from '../../../services/transfers/types'

// Raster formats only: an SVG "photo" would run its scripts on the terminal's origin.
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'])

/** Proxies the item's primary photo, so the browser never needs the Homebox token. */
export default defineTerminalHandler(async (event) => {
  const id = getIdParam(event)
  const homebox = useHomebox()
  const entity = await homebox.getEntity(id)
  if (!entity.imageId) throw new TransferError('NOT_FOUND', 'У оборудования нет фото')

  const response = await homebox.getAttachment(entity.id, entity.imageId)
  const type = (response.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase()
  if (!IMAGE_TYPES.has(type)) throw new TransferError('NOT_FOUND', 'Вложение не является фотографией')

  setResponseHeaders(event, {
    'Content-Type': type,
    'Cache-Control': 'private, max-age=300',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': 'default-src \'none\'; sandbox',
  })
  return new Uint8Array(await response.arrayBuffer())
})
