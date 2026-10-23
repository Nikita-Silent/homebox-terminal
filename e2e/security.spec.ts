// The project's test brings the staff member the API checks sign in as.
import { apiSignIn, expect, STAFF, test } from './fixtures'

test.describe('security', () => {
  test('pages carry a strict CSP and cannot be framed', async ({ request }) => {
    const response = await request.get('/login')
    const headers = response.headers()
    expect(headers['content-security-policy']).toContain('frame-ancestors \'none\'')
    expect(headers['content-security-policy']).toContain('object-src \'none\'')
    expect(headers['x-frame-options']).toBe('DENY')
    expect(headers['x-content-type-options']).toBe('nosniff')
  })

  test('the API answers only signed-in employees', async ({ request }) => {
    for (const path of ['/api/items?q=a', '/api/items/all', '/api/locations/tree', '/api/admin/users']) {
      expect((await request.get(path)).status(), path).toBe(401)
    }
    expect((await request.get('/api/health')).status()).toBe(200)
  })

  test('cross-site writes, non-JSON writes, bad ids and foreign hosts are refused', async ({ request }) => {
    await apiSignIn(request, STAFF)
    const logout = (headers: Record<string, string>, data: string) => request.post('/api/auth/logout', { headers, data })
    expect((await logout({ 'content-type': 'text/plain' }, '{}')).status()).toBe(422)
    expect((await logout({ 'content-type': 'application/json', 'origin': 'http://evil.example' }, '{}')).status()).toBe(422)
    expect((await request.get('/api/items/not-a-uuid')).status()).toBe(422)
    expect((await request.get('/api/items/..%2F..%2Fusers')).status()).toBe(422)
    expect((await request.get('/api/health', { headers: { host: 'rebind.evil.example' } })).status()).toBe(422)
  })

  test('wrong PINs lock the employee for 5 minutes', async ({ playwright, baseURL }) => {
    const request = await playwright.request.newContext({ baseURL })
    // A dedicated employee, so the lock does not affect other tests.
    await apiSignIn(request, { name: 'Администратор', pin: '604918' })
    const name = `Блок ${Date.now()}`
    const created = await request.post('/api/admin/users', { data: { name, pin: '4826', role: 'staff' } })
    const { id } = await created.json() as { id: string }
    for (let i = 0; i < 4; i++) expect((await request.post('/api/auth/login', { data: { userId: id, pin: '0000' } })).status()).toBe(422)
    const locked = await request.post('/api/auth/login', { data: { userId: id, pin: '0000' } })
    expect(locked.status()).toBe(429)
    const right = await request.post('/api/auth/login', { data: { userId: id, pin: '4826' } })
    expect(right.status()).toBe(429)
    await request.dispose()
  })
})
