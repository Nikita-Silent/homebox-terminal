import type { TransferPreview } from '../../../shared/types/terminal'

/** Validates a transfer and shows what will happen, without changing anything. */
export default defineTerminalHandler(async (event): Promise<TransferPreview> => {
  const input = parseWith(TransferPreviewSchema, await readBody(event))
  return useTransferService().preview(input)
})
