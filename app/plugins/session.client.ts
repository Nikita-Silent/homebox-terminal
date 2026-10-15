/**
 * A shared terminal must not stay signed in when the employee walks away:
 * after the idle timeout the next person meets the sign-in screen.
 * Any API answer «401» (session ended on the server) also leads there.
 */
export default defineNuxtPlugin(() => {
  const { user, signOut } = useAuth()
  const signedIn = () => !!user.value

  window.fetch = guardFetch(window.fetch.bind(window), window.location.origin, () => signOut('expired'), signedIn)

  const idle = watchIdle({
    target: window,
    isSignedIn: signedIn,
    idleMs: () => (user.value?.idleMinutes ?? 15) * 60_000,
    onIdle: () => signOut('idle'),
    onKeepalive: () => {
      $fetch('/api/auth/me').catch(() => {})
    },
  })

  watch(user, (value) => {
    if (value) idle.reset()
  })
})
