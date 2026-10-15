import { beforeEach, describe, expect, it } from 'vitest'
import { admin, signInAs as as, staff } from '~/test/fixtures'

beforeEach(() => as(null))

describe('auth route guard', () => {
  it('sends anonymous visitors to sign-in and remembers where they were going', async () => {
    const router = useRouter()
    await router.push('/cart?x=1')
    expect(router.currentRoute.value.path).toBe('/login')
    expect(router.currentRoute.value.query).toEqual({ next: '/cart?x=1' })
    await router.push('/')
    expect(router.currentRoute.value.fullPath).toBe('/login')
  })

  it('keeps employees out of admin pages', async () => {
    as(staff)
    const router = useRouter()
    await router.push('/admin/users')
    expect(router.currentRoute.value.path).toBe('/')
    as(admin)
    await router.push('/admin/journal')
    expect(router.currentRoute.value.path).toBe('/admin/journal')
  })

  it('moves a signed-in employee off the sign-in screen, to a safe destination only', async () => {
    as(staff)
    const router = useRouter()
    await router.push('/login?next=/browse')
    expect(router.currentRoute.value.path).toBe('/browse')
    await router.push('/login?next=//evil.example')
    expect(router.currentRoute.value.fullPath).toBe('/')
  })
})
