import type { H3Event } from 'h3'
import { z } from 'zod'

// Homebox ids are UUIDs. Anything else is rejected before it reaches a Homebox URL.
const id = z.uuid()

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

const IdParam = z.object({ id: z.uuid() })

/** The `[id]` route parameter, validated as a Homebox UUID. */
export function getIdParam(event: H3Event): string {
  return parseWith(IdParam, { id: getRouterParam(event, 'id') }).id
}

export const OpIdParam = z.object({ opId: z.uuid() })
