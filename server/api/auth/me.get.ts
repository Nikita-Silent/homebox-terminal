import type { SessionUser } from '../../../shared/types/terminal'

export default defineTerminalHandler(async (event): Promise<SessionUser> => {
  const user = requireUser(event)
  return { id: user.id, name: user.name, role: user.role, idleMinutes: useAuthService().idleMinutes }
})
