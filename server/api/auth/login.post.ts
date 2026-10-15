import { z } from 'zod'
import type { SessionUser } from '../../../shared/types/terminal'

const Body = z.object({ userId: z.uuid(), pin: z.string().min(1).max(16) })

export default defineTerminalHandler(async (event): Promise<SessionUser> => {
  const { userId, pin } = parseWith(Body, await readBody(event))
  const auth = useAuthService()
  const { token, user } = await auth.signIn(userId, pin)
  setSessionCookie(event, token)
  return { id: user.id, name: user.name, role: user.role, idleMinutes: auth.idleMinutes }
})
