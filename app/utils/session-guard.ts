/**
 * Wraps `fetch` so that any «401» from this terminal's own API ends the session in the UI:
 * the server already forgot it (idle, disabled employee, restart).
 */
export function guardFetch(original: typeof fetch, origin: string, onExpired: () => void, isSignedIn: () => boolean): typeof fetch {
  return async (input, init) => {
    const response = await original(input, init)
    if (response.status === 401 && isSignedIn()) {
      const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      const url = new URL(raw, origin)
      if (url.origin === origin && url.pathname.startsWith('/api/')) onExpired()
    }
    return response
  }
}

export interface IdleWatchOptions {
  target: EventTarget
  isSignedIn: () => boolean
  idleMs: () => number
  onIdle: () => void
  /** Activity without API calls (reading the journal) still has to keep the server session alive. */
  onKeepalive: () => void
  checkEveryMs?: number
  keepaliveEveryMs?: number
}

const ACTIVITY = ['pointerdown', 'keydown', 'touchstart', 'wheel', 'scroll'] as const

/** Calls `onIdle` once nobody touched the terminal for `idleMs`. Returns a stop function. */
export function watchIdle(options: IdleWatchOptions) {
  const { checkEveryMs = 10_000, keepaliveEveryMs = 120_000 } = options
  let lastActive = Date.now()
  let lastKeepalive = Date.now()

  const markActive = () => {
    lastActive = Date.now()
    if (options.isSignedIn() && lastActive - lastKeepalive > keepaliveEveryMs) {
      lastKeepalive = lastActive
      options.onKeepalive()
    }
  }
  for (const name of ACTIVITY) options.target.addEventListener(name, markActive, { passive: true, capture: true })

  const timer = setInterval(() => {
    if (options.isSignedIn() && Date.now() - lastActive >= options.idleMs()) options.onIdle()
  }, checkEveryMs)

  return {
    /** A fresh sign-in starts a fresh idle period. */
    reset() {
      lastActive = lastKeepalive = Date.now()
    },
    stop() {
      clearInterval(timer)
      for (const name of ACTIVITY) options.target.removeEventListener(name, markActive, { capture: true })
    },
  }
}
