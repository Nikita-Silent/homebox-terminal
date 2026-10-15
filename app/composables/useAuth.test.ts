import { registerEndpoint } from '@nuxt/test-utils/runtime'
import { readBody } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { safeNext, useAuth } from './useAuth'

const ivan = { id: 'u1', name: 'Иван', role: 'staff', idleMinutes: 15 }

beforeEach(() => {
  useAuth().user.value = null
  useAuth().checked.value = false
})

describe('safeNext', () => {
  it('follows only paths inside the terminal', () => {
    expect(safeNext('/cart?x=1')).toBe('/cart?x=1')
    for (const bad of ['//evil.example', '/\\evil.example', 'https://evil.example', 'javascript:alert(1)', '', undefined, ['/cart']]) {
      expect(safeNext(bad), String(bad)).toBe('/')
    }
  })
})

describe('useAuth', () => {
  it('learns who is signed in, or that nobody is', async () => {
    registerEndpoint('/api/auth/me', () => ivan)
    const auth = useAuth()
    expect(await auth.refresh()).toEqual(ivan)
    expect(auth.checked.value).toBe(true)
    registerEndpoint('/api/auth/me', () => {
      throw createError({ statusCode: 401 })
    })
    expect(await auth.refresh()).toBeNull()
  })

  it('signs in with the chosen employee and PIN', async () => {
    const seen: unknown[] = []
    registerEndpoint('/api/auth/login', {
      method: 'POST',
      handler: async (event) => {
        seen.push(await readBody(event))
        return ivan
      },
    })
    const auth = useAuth()
    await auth.signIn('u1', '4826')
    expect(seen).toEqual([{ userId: 'u1', pin: '4826' }])
    expect(auth.user.value).toEqual(ivan)
  })

  it('signs out to the sign-in screen, remembering the page only for automatic sign-outs', async () => {
    const logout = vi.fn(() => ({ ok: true }))
    registerEndpoint('/api/auth/logout', { method: 'POST', handler: logout })
    const auth = useAuth()
    const router = useRouter()
    auth.user.value = ivan as never
    auth.checked.value = true
    await router.push('/cart?from=test')

    await auth.signOut('idle')
    expect(router.currentRoute.value.path).toBe('/login')
    expect(router.currentRoute.value.query).toEqual({ reason: 'idle', next: '/cart?from=test' })
    expect(auth.user.value).toBeNull()

    auth.user.value = ivan as never
    await router.push('/cart')
    await auth.signOut()
    expect(router.currentRoute.value.fullPath).toBe('/login')
    expect(logout).toHaveBeenCalledTimes(2)
  })

  it('still leaves when the server cannot be reached', async () => {
    registerEndpoint('/api/auth/logout', { method: 'POST', handler: () => {
      throw createError({ statusCode: 503 })
    } })
    const auth = useAuth()
    auth.user.value = ivan as never
    await auth.signOut()
    expect(auth.user.value).toBeNull()
    expect(useRouter().currentRoute.value.path).toBe('/login')
  })
})
