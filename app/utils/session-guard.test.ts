import { afterEach, describe, expect, it, vi } from 'vitest'
import { guardFetch, watchIdle } from './session-guard'

const ORIGIN = 'http://terminal.test'

describe('guardFetch', () => {
  function setup(status: number, signedIn = true) {
    const onExpired = vi.fn()
    const original = vi.fn(async () => new Response(null, { status }))
    const fetch = guardFetch(original as unknown as typeof globalThis.fetch, ORIGIN, onExpired, () => signedIn)
    return { fetch, original, onExpired }
  }

  it('ends the session on a 401 from the terminal API, in every input form', async () => {
    const { fetch, onExpired, original } = setup(401)
    const res = await fetch('/api/items?q=x', { method: 'GET' })
    await fetch(new URL(`${ORIGIN}/api/auth/me`))
    await fetch(new Request(`${ORIGIN}/api/transfers`))
    expect(res.status).toBe(401)
    expect(onExpired).toHaveBeenCalledTimes(3)
    expect(original).toHaveBeenCalledWith('/api/items?q=x', { method: 'GET' })
  })

  it('ignores other statuses, other origins, non-API paths and signed-out states', async () => {
    expect((await (async () => {
      const { fetch, onExpired } = setup(403)
      await fetch('/api/admin/users')
      return onExpired
    })())).not.toHaveBeenCalled()
    const { fetch, onExpired } = setup(401)
    await fetch('https://homebox.example/api/v1/entities')
    await fetch('/_nuxt/app.js')
    expect(onExpired).not.toHaveBeenCalled()
    const out = setup(401, false)
    await out.fetch('/api/auth/me')
    expect(out.onExpired).not.toHaveBeenCalled()
  })
})

describe('watchIdle', () => {
  afterEach(() => vi.useRealTimers())

  function setup(signedIn = { value: true }) {
    vi.useFakeTimers({ now: 0 })
    const target = new EventTarget()
    const onIdle = vi.fn()
    const onKeepalive = vi.fn()
    const idle = watchIdle({ target, isSignedIn: () => signedIn.value, idleMs: () => 15 * 60_000, onIdle, onKeepalive })
    return { target, onIdle, onKeepalive, idle }
  }

  it('signs out after the idle period without activity', () => {
    const { onIdle, idle } = setup()
    vi.advanceTimersByTime(14 * 60_000)
    expect(onIdle).not.toHaveBeenCalled()
    vi.advanceTimersByTime(60_000)
    expect(onIdle).toHaveBeenCalled()
    idle.stop()
  })

  it('counts taps, keys and scrolling as activity and keeps the server session alive', () => {
    const { target, onIdle, onKeepalive, idle } = setup()
    for (let minute = 0; minute < 40; minute += 5) {
      vi.advanceTimersByTime(5 * 60_000)
      target.dispatchEvent(new Event(['pointerdown', 'keydown', 'touchstart', 'wheel', 'scroll'][minute % 5]!))
    }
    expect(onIdle).not.toHaveBeenCalled()
    // Throttled: at most once per two minutes of activity.
    expect(onKeepalive).toHaveBeenCalledTimes(8)
    target.dispatchEvent(new Event('keydown'))
    expect(onKeepalive).toHaveBeenCalledTimes(8)
    idle.stop()
  })

  it('does nothing while nobody is signed in, and restarts on sign-in', () => {
    const signedIn = { value: false }
    const { onIdle, idle } = setup(signedIn)
    vi.advanceTimersByTime(60 * 60_000)
    expect(onIdle).not.toHaveBeenCalled()
    signedIn.value = true
    idle.reset()
    vi.advanceTimersByTime(10 * 60_000)
    expect(onIdle).not.toHaveBeenCalled()
    idle.stop()
  })

  it('stops listening when stopped', () => {
    const { target, onIdle, onKeepalive, idle } = setup()
    idle.stop()
    vi.advanceTimersByTime(60 * 60_000)
    target.dispatchEvent(new Event('keydown'))
    expect(onIdle).not.toHaveBeenCalled()
    expect(onKeepalive).not.toHaveBeenCalled()
  })
})
