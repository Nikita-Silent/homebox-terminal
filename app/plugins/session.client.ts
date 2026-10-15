const CHECK_EVERY_MS = 10_000
// Activity without API calls (reading the journal) still has to keep the server session alive.
const KEEPALIVE_EVERY_MS = 120_000

/**
 * A shared terminal must not stay signed in when the employee walks away:
 * after the idle timeout the next person meets the sign-in screen.
 * Any API answer «401» (session ended on the server) also leads there.
 */
export default defineNuxtPlugin(() => {
  const { user, signOut } = useAuth()

  const originalFetch = window.fetch.bind(window)
  window.fetch = async (input, init) => {
    const response = await originalFetch(input, init)
    if (response.status === 401 && user.value) {
      const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      const url = new URL(raw, window.location.href)
      if (url.origin === window.location.origin && url.pathname.startsWith('/api/')) signOut('expired')
    }
    return response
  }

  let lastActive = Date.now()
  let lastKeepalive = Date.now()
  const markActive = () => {
    lastActive = Date.now()
    if (user.value && lastActive - lastKeepalive > KEEPALIVE_EVERY_MS) {
      lastKeepalive = lastActive
      $fetch('/api/auth/me').catch(() => {})
    }
  }
  for (const name of ['pointerdown', 'keydown', 'touchstart', 'wheel', 'scroll'] as const) {
    window.addEventListener(name, markActive, { passive: true, capture: true })
  }

  setInterval(() => {
    if (!user.value) return
    if (Date.now() - lastActive >= user.value.idleMinutes * 60_000) signOut('idle')
  }, CHECK_EVERY_MS)

  watch(user, (value) => {
    if (value) lastActive = lastKeepalive = Date.now()
  })
})
