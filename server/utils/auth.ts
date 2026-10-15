import type { H3Event } from 'h3'
import type { UserAccount } from '../../shared/types/terminal'
import type { AuthService } from '../services/auth/service'
import { createAuthService } from '../services/auth/service'
import { TransferError } from '../services/transfers/types'

export const SESSION_COOKIE = 'hbt_session'

let service: AuthService | null = null

/** Employees and sessions live in the same SQLite file as the transfer journal. */
export function useAuthService(): AuthService {
  if (service) return service
  const { journalPath, session } = useRuntimeConfig()
  service = createAuthService({ path: journalPath, idleMinutes: Number(session.idleMinutes) || 15 })
  return service
}

/** The employee of this request; set by the auth middleware for every protected API route. */
export function requireUser(event: H3Event): UserAccount {
  const user = event.context.user as UserAccount | undefined
  if (!user) throw new TransferError('UNAUTHENTICATED', 'Войдите в терминал')
  return user
}

export function setSessionCookie(event: H3Event, token: string) {
  setCookie(event, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: getRequestProtocol(event) === 'https',
    path: '/',
  })
}

export function clearSessionCookie(event: H3Event) {
  deleteCookie(event, SESSION_COOKIE, { path: '/' })
}
