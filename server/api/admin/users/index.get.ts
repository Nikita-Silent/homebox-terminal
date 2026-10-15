import type { UserAccount } from '../../../../shared/types/terminal'

export default defineTerminalHandler(async (): Promise<UserAccount[]> => useAuthService().listUsers())
