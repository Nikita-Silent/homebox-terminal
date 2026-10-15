import { TransferError } from '../services/transfers/types'

// Reachable without signing in: the sign-in screen itself and the health check.
const PUBLIC = new Set(['/api/health', '/api/auth/users', '/api/auth/login', '/api/auth/logout'])

/** Every other API route acts on behalf of a signed-in employee; `/api/admin/*` needs an admin. */
export default defineEventHandler((event) => {
  const path = event.path.split('?')[0]!
  if (!path.startsWith('/api/') || PUBLIC.has(path)) return

  const user = useAuthService().authenticate(getCookie(event, SESSION_COOKIE))
  if (!user) {
    clearSessionCookie(event)
    throw toHttpError(new TransferError('UNAUTHENTICATED', 'Сессия закончилась. Войдите заново.'))
  }
  event.context.user = user
  if (path.startsWith('/api/admin/') && user.role !== 'admin') {
    throw toHttpError(new TransferError('FORBIDDEN', 'Доступно только администратору'))
  }
})
