import type { TransferResult } from '../../../shared/types/terminal'
import { TransferError } from '../../services/transfers/types'

export default defineTerminalHandler(async (event): Promise<TransferResult> => {
  const result = useTransferService().getResult(parseWith(OpIdParam, { opId: getRouterParam(event, 'opId') }).opId)
  if (!result) throw new TransferError('NOT_FOUND', 'Операция не найдена')
  return result
})
