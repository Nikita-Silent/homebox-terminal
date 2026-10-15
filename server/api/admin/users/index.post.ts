import { z } from 'zod'
import type { UserAccount } from '../../../../shared/types/terminal'

const Body = z.object({
  name: z.string().max(100),
  pin: z.string().max(16),
  role: z.enum(['admin', 'staff']),
})

export default defineTerminalHandler(async (event): Promise<UserAccount> => {
  return useAuthService().createUser(parseWith(Body, await readBody(event)))
})
