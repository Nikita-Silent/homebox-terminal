import { z } from 'zod'
import type { UserAccount } from '../../../../shared/types/terminal'
import { TransferError } from '../../../services/transfers/types'

const Body = z.object({
  name: z.string().max(100).optional(),
  pin: z.string().max(16).optional(),
  role: z.enum(['admin', 'staff']).optional(),
  active: z.boolean().optional(),
})

export default defineTerminalHandler(async (event): Promise<UserAccount> => {
  const id = getIdParam(event)
  const input = parseWith(Body, await readBody(event))
  const me = requireUser(event)
  // Locking yourself out from your own session is never what the admin meant.
  if (id === me.id && (input.active === false || input.role === 'staff')) {
    throw new TransferError('VALIDATION', 'Нельзя отключить себя или снять с себя роль администратора')
  }
  return useAuthService().updateUser(id, input)
})
