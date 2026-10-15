import type { TransferResult } from '../../../shared/types/terminal'

/**
 * Executes a transfer. Idempotent by `opId`: re-sending the same request returns the
 * stored result or resumes an interrupted operation, never repeats it.
 */
export default defineTerminalHandler(async (event): Promise<TransferResult> => {
  const input = parseWith(TransferSchema, await readBody(event))
  try {
    return await useTransferService().execute(input, requireUser(event))
  }
  finally {
    invalidateItemIndex()
  }
})
