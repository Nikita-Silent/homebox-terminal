import { z } from 'zod'

const id = z.string().trim().min(1).max(100)

export const TransferPreviewSchema = z.object({
  itemId: id,
  targetLocationId: id,
  quantity: z.number().finite(),
  expectedQuantity: z.number().finite(),
  expectedLocationId: id.nullable(),
})

export const TransferSchema = TransferPreviewSchema.extend({
  opId: z.uuid(),
  mergeIntoId: id.nullable(),
})
