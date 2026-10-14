import type { ItemDetail } from '../../../../shared/types/terminal'
import { toItemDetail } from '../../../homebox/mappers'
import { TransferError } from '../../../services/transfers/types'

export default defineTerminalHandler(async (event): Promise<ItemDetail> => {
  const id = getRouterParam(event, 'id')!
  const homebox = useHomebox()
  const [entity, path] = await Promise.all([homebox.getEntity(id), homebox.getPath(id)])
  if (entity.entityType.isLocation) throw new TransferError('NOT_FOUND', 'Это локация, а не оборудование')
  return toItemDetail(entity, path)
})
