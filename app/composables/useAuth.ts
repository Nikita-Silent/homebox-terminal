import type { SessionUser } from '#shared/types/terminal'

export type SignOutReason = 'idle' | 'expired' | 'manual'

/** Only same-app paths are followed after sign-in (no `//host` or `/\host`). */
export function safeNext(value: unknown) {
  return typeof value === 'string' && value.startsWith('/') && !/^\/[/\\]/.test(value) ? value : '/'
}

export function useAuth() {
  const user = useState<SessionUser | null>('auth:user', () => null)
  const checked = useState('auth:checked', () => false)
  // Captured now: signOut also runs from timers, outside any component.
  const router = useRouter()

  async function refresh() {
    try {
      user.value = await $fetch<SessionUser>('/api/auth/me')
    }
    catch {
      user.value = null
    }
    checked.value = true
    return user.value
  }

  async function signIn(userId: string, pin: string) {
    user.value = await $fetch<SessionUser>('/api/auth/login', { method: 'POST', body: { userId, pin } })
    checked.value = true
    return user.value
  }

  /** Ends the session and returns to the sign-in screen, remembering where the employee was. */
  async function signOut(reason: SignOutReason = 'manual') {
    const next = reason === 'manual' ? undefined : router.currentRoute.value.fullPath
    user.value = null
    try {
      await $fetch('/api/auth/logout', { method: 'POST', body: {} })
    }
    catch {
      // The session is gone either way.
    }
    await navigateTo({ path: '/login', query: { ...(reason === 'manual' ? {} : { reason }), ...(next && next !== '/' ? { next } : {}) } })
  }

  return { user, checked, refresh, signIn, signOut }
}
