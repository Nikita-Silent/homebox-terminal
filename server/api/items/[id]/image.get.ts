import { TransferError } from '../../../services/transfers/types'

/** Proxies the item's primary photo, so the browser never needs the Homebox token. */
export default defineTerminalHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const homebox = useHomebox()
  const entity = await homebox.getEntity(id)
  if (!entity.imageId) throw new TransferError('NOT_FOUND', 'У оборудования нет фото')

  const response = await homebox.getAttachment(entity.id, entity.imageId)
  const type = response.headers.get('content-type') ?? 'application/octet-stream'
  if (!type.startsWith('image/')) throw new TransferError('NOT_FOUND', 'Вложение не является изображением')

  setResponseHeaders(event, { 'Content-Type': type, 'Cache-Control': 'private, max-age=300' })
  return new Uint8Array(await response.arrayBuffer())
})
