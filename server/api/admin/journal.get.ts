import { z } from 'zod'
import type { Actor, JournalPage } from '../../../shared/types/terminal'

const PAGE = 50

const Query = z.object({
  from: z.iso.datetime({ offset: true }),
  to: z.iso.datetime({ offset: true }),
  userId: z.uuid().optional(),
  q: z.string().trim().max(200).optional(),
  offset: z.coerce.number().int().min(0).default(0),
})

/** The transfer report. Totals cover the whole filter; entries are one page. */
export default defineTerminalHandler(async (event): Promise<JournalPage> => {
  const { offset, ...filter } = parseWith(Query, getQuery(event))
  const entries = useTransferService().listJournal(filter)

  const actors = new Map<string, Actor>()
  for (const user of useAuthService().listUsers()) actors.set(user.id, { id: user.id, name: user.name })

  return {
    entries: entries.slice(offset, offset + PAGE),
    total: entries.length,
    totalQuantity: entries.filter(e => e.status === 'done').reduce((sum, e) => sum + e.quantity, 0),
    actors: [...actors.values()],
  }
})
