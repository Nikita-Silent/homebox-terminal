// Runs the real API handlers and middleware without Nitro: Nitro's auto-imports are provided as
// globals (h3 itself plus the project's server utils), Homebox is the in-memory fake, the journal and
// employees live in in-memory SQLite. Requests go through a real h3 app, cookies and all.
import * as h3 from 'h3'
import { vi } from 'vitest'
import type { HomeboxClient } from '../homebox/client'
import type { AuthService } from '../services/auth/service'
import type { TransferService } from '../services/transfers/service'
import { createAuthService } from '../services/auth/service'
import { createFakeHomebox } from '../services/transfers/fake-homebox'
import { createSqliteJournal } from '../services/transfers/journal'
import { createTransferService } from '../services/transfers/service'

export interface TestConfig {
  homebox: { baseUrl: string, token: string }
  journalPath: string
  journalRetentionYears: number
  allowedHosts: string
  session: { idleMinutes: number }
  admin: { name: string, pin: string }
}

/** The h3 helpers and Nitro composables that server code uses without importing. */
const H3_GLOBALS = [
  'defineEventHandler', 'getRouterParam', 'getQuery', 'readBody', 'setResponseHeaders', 'setCookie',
  'deleteCookie', 'getCookie', 'getRequestHeader', 'getRequestProtocol', 'createError',
] as const

// Mutable holders: globals are installed once per test file, the instances change per test.
const current: {
  config: TestConfig
  homebox: HomeboxClient | null
  transfers: TransferService | null
  auth: AuthService | null
} = { config: defaultConfig(), homebox: null, transfers: null, auth: null }

function defaultConfig(): TestConfig {
  return {
    homebox: { baseUrl: 'http://homebox.test', token: 'hb_test' },
    journalPath: ':memory:',
    journalRetentionYears: 5,
    allowedHosts: '',
    session: { idleMinutes: 15 },
    admin: { name: 'Администратор', pin: '' },
  }
}

let installed = false

/** Installs Nitro's auto-imports as globals. Server modules must be imported after this. */
export async function installNitroGlobals() {
  if (installed) return
  installed = true
  for (const name of H3_GLOBALS) vi.stubGlobal(name, h3[name])
  vi.stubGlobal('useRuntimeConfig', () => current.config)
  vi.stubGlobal('defineNitroPlugin', (plugin: unknown) => plugin)
  vi.stubGlobal('useHomebox', () => current.homebox)
  vi.stubGlobal('useTransferService', () => current.transfers)
  vi.stubGlobal('useAuthService', () => current.auth)

  const modules = await Promise.all([
    import('../utils/errors'),
    import('../utils/transfer-schema'),
    import('../utils/lookup'),
    import('../utils/item-index'),
    import('../utils/homebox-version'),
    import('../utils/homebox-link'),
    import('../utils/auth'),
  ])
  for (const mod of modules) {
    for (const [name, value] of Object.entries(mod)) {
      // The service factories stay injectable: tests decide which instances the handlers see.
      if (name !== 'useAuthService') vi.stubGlobal(name, value)
    }
  }
}

const ROUTES: [method: 'get' | 'post' | 'patch', path: string, file: () => Promise<{ default: h3.EventHandler }>][] = [
  ['get', '/api/health', () => import('../api/health.get')],
  ['get', '/api/items', () => import('../api/items/index.get')],
  ['get', '/api/items/all', () => import('../api/items/all.get')],
  ['get', '/api/items/lookup', () => import('../api/items/lookup.get')],
  ['get', '/api/items/:id', () => import('../api/items/[id]/index.get')],
  ['get', '/api/items/:id/image', () => import('../api/items/[id]/image.get')],
  ['get', '/api/locations/tree', () => import('../api/locations/tree.get')],
  ['get', '/api/locations/:id', () => import('../api/locations/[id]/index.get')],
  ['post', '/api/transfers/preview', () => import('../api/transfers/preview.post')],
  ['post', '/api/transfers', () => import('../api/transfers/index.post')],
  ['get', '/api/transfers/:opId', () => import('../api/transfers/[opId].get')],
  ['get', '/api/auth/users', () => import('../api/auth/users.get')],
  ['post', '/api/auth/login', () => import('../api/auth/login.post')],
  ['post', '/api/auth/logout', () => import('../api/auth/logout.post')],
  ['get', '/api/auth/me', () => import('../api/auth/me.get')],
  ['get', '/api/admin/users', () => import('../api/admin/users/index.get')],
  ['post', '/api/admin/users', () => import('../api/admin/users/index.post')],
  ['patch', '/api/admin/users/:id', () => import('../api/admin/users/[id].patch')],
  ['get', '/api/admin/journal', () => import('../api/admin/journal.get')],
]

export interface RequestOptions {
  body?: unknown
  /** Raw body with its own content type (for the CSRF checks). */
  raw?: { body: string, type: string }
  headers?: Record<string, string>
  /** Session cookie from `signIn`; omit for an anonymous request. */
  cookie?: string
  query?: Record<string, string>
}

/** Response bodies are inspected ad hoc in tests, like `res.body.items[0].name`. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any

export interface TestResponse<T = Json> {
  status: number
  headers: Headers
  body: T
  /** `data.code` of a terminal error. */
  code: string | undefined
  /** `data.message` of a terminal error. */
  message: string | undefined
}

export const HOST = 'terminal.test'

/**
 * A fresh terminal over a fresh fake Homebox: Склад 1 / Полка 01 and Склад 2 / Полка 01,
 * a quantity-tracked switch (3 pcs) and a single router.
 */
export async function createTestServer(config: Partial<TestConfig> = {}) {
  await installNitroGlobals()
  let now = new Date('2026-10-15T09:00:00Z')
  const hb = createFakeHomebox()
  hb.addLocation('11111111-1111-4111-8111-111111111111', 'Склад 1')
  hb.addLocation('22222222-2222-4222-8222-222222222222', 'Полка 01', '11111111-1111-4111-8111-111111111111')
  hb.addLocation('33333333-3333-4333-8333-333333333333', 'Склад 2')
  hb.addLocation('44444444-4444-4444-8444-444444444444', 'Полка 01', '33333333-3333-4333-8333-333333333333')
  hb.addItem('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'D-Link DGS-1005C', '22222222-2222-4222-8222-222222222222', {
    quantity: 3, manufacturer: 'D-Link', modelNumber: 'DGS-1005C',
  })
  hb.addItem('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Крокодилы', '22222222-2222-4222-8222-222222222222', { quantity: 1 })

  const journal = createSqliteJournal(':memory:')
  const auth = createAuthService({ path: ':memory:', now: () => now, idleMinutes: config.session?.idleMinutes ?? 15 })
  const transfers = createTransferService({ homebox: hb.port, journal, now: () => now })
  current.config = { ...defaultConfig(), ...config }
  current.homebox = hb.client
  current.transfers = transfers
  current.auth = auth
  const { invalidateItemIndex } = await import('../utils/item-index')
  invalidateItemIndex()
  const { resetHomeboxVersion } = await import('../utils/homebox-version')
  resetHomeboxVersion()
  const { resetHomeboxLink } = await import('../utils/homebox-link')
  resetHomeboxLink()

  const app = h3.createApp()
  app.use((await import('../middleware/01.security')).default)
  app.use((await import('../middleware/02.auth')).default)
  const router = h3.createRouter()
  for (const [method, path, load] of ROUTES) router[method](path, (await load()).default)
  app.use(router)
  const handle = h3.toWebHandler(app)

  async function request<T = Json>(method: string, path: string, options: RequestOptions = {}): Promise<TestResponse<T>> {
    const url = new URL(path, `http://${HOST}`)
    for (const [key, value] of Object.entries(options.query ?? {})) url.searchParams.set(key, value)
    const headers: Record<string, string> = { host: HOST, ...options.headers }
    let body: string | undefined
    if (options.raw) {
      body = options.raw.body
      headers['content-type'] = options.raw.type
    }
    else if (options.body !== undefined) {
      body = JSON.stringify(options.body)
      headers['content-type'] ??= 'application/json'
    }
    if (options.cookie) headers.cookie = options.cookie
    const response = await handle(new Request(url, { method, headers, body }))
    const text = await response.text()
    let parsed: Json = text
    try {
      parsed = JSON.parse(text)
    }
    catch {
      // Binary or empty body.
    }
    return {
      status: response.status,
      headers: response.headers,
      body: parsed,
      code: parsed?.data?.code,
      message: parsed?.data?.message,
    }
  }

  /** Signs in through the API and returns the session cookie. */
  async function signIn(name: string, pin: string) {
    const user = auth.listUsers().find(u => u.name === name)
    if (!user) throw new Error(`No employee «${name}»`)
    const response = await handle(new Request(`http://${HOST}/api/auth/login`, {
      method: 'POST',
      headers: { 'host': HOST, 'content-type': 'application/json' },
      body: JSON.stringify({ userId: user.id, pin }),
    }))
    if (response.status !== 200) throw new Error(`Sign-in failed: ${response.status} ${await response.text()}`)
    const cookie = response.headers.get('set-cookie')?.split(';')[0]
    if (!cookie) throw new Error('No session cookie')
    return cookie
  }

  /** An admin and a staff member, signed in. */
  async function withPeople() {
    await auth.createUser({ name: 'Админ', pin: '604918', role: 'admin' })
    await auth.createUser({ name: 'Иван', pin: '4826', role: 'staff' })
    return { admin: await signIn('Админ', '604918'), staff: await signIn('Иван', '4826') }
  }

  return {
    hb,
    auth,
    transfers,
    journal,
    config: current.config,
    request,
    signIn,
    withPeople,
    setNow(value: Date) {
      now = value
    },
    ids: {
      warehouse1: '11111111-1111-4111-8111-111111111111',
      shelf1: '22222222-2222-4222-8222-222222222222',
      warehouse2: '33333333-3333-4333-8333-333333333333',
      shelf2: '44444444-4444-4444-8444-444444444444',
      switches: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      clips: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    },
    close() {
      journal.close()
      auth.close()
    },
  }
}

export type TestServer = Awaited<ReturnType<typeof createTestServer>>
