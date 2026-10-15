import type { Actor } from '../../../shared/types/terminal'

/** Names for the sign-in screen. Active employees only. */
export default defineTerminalHandler(async (): Promise<Actor[]> => useAuthService().signInList())
