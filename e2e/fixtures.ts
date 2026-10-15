import { expect, test as base } from '@playwright/test'
import type { APIRequestContext, Page } from '@playwright/test'
import { ADMIN, state } from './env'
import { Homebox, HOMEBOX_URL } from './homebox'

export const STAFF = { name: 'Иван Петров', pin: '4826' }

/** A 2×2 PNG, small but a real raster image Homebox can thumbnail. */
export const PNG = Uint8Array.from(Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDK+mmyAAAAABJRU5ErkJggg==',
  'base64',
))

/** Signs in through the terminal API (not the UI) — for setup steps. */
export async function apiSignIn(request: APIRequestContext, who: { name: string, pin: string }) {
  const users = await (await request.get('/api/auth/users')).json() as { id: string, name: string }[]
  const user = users.find(u => u.name === who.name)
  if (!user) throw new Error(`No employee «${who.name}»`)
  const response = await request.post('/api/auth/login', { data: { userId: user.id, pin: who.pin } })
  expect(response.ok(), await response.text()).toBe(true)
}

/** Makes sure the staff member used by the tests exists (created by the admin through the API). */
async function ensureStaff(request: APIRequestContext) {
  const users = await (await request.get('/api/auth/users')).json() as { name: string }[]
  if (users.some(u => u.name === STAFF.name)) return
  await apiSignIn(request, ADMIN)
  const created = await request.post('/api/admin/users', { data: { name: STAFF.name, pin: STAFF.pin, role: 'staff' } })
  expect(created.ok(), await created.text()).toBe(true)
  await request.post('/api/auth/logout', { data: {} })
}

/** Signs in through the sign-in screen: tap your name, type the PIN on the keypad. */
export async function signIn(page: Page, who: { name: string, pin: string } = STAFF, path = '/') {
  await page.goto(path)
  await expect(page.getByRole('heading', { name: 'Кто работает?' })).toBeVisible()
  await page.getByRole('button', { name: who.name, exact: true }).click()
  const keypad = page.getByRole('group', { name: 'Клавиатура PIN' })
  for (const digit of who.pin) await keypad.getByRole('button', { name: digit, exact: true }).click()
  await keypad.getByRole('button', { name: 'Войти' }).click()
  await expect(page.getByRole('button', { name: `Выйти (${who.name})` })).toBeVisible()
  // The page itself (and its scanner listener) is mounted once its heading shows.
  await expect(page).not.toHaveURL(/\/login/)
  await expect(page.locator('main h1').first()).toBeVisible()
}

/** A USB barcode scanner: the code as fast keystrokes, then Enter. */
export async function scan(page: Page, code: string) {
  // Outside any text field, so the terminal's scanner listener gets the keys.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  await page.keyboard.type(code)
  await page.keyboard.press('Enter')
}

/** What a Homebox label encodes. */
export const label = {
  item: (id: string) => `${HOMEBOX_URL}/item/${id}`,
  location: (id: string) => `${HOMEBOX_URL}/location/${id}`,
}

let seq = 0

export const test = base.extend<{ hb: Homebox, uniq: (name: string) => string }, { staffReady: boolean }>({
  staffReady: [async ({ playwright }, use) => {
    const request = await playwright.request.newContext({ baseURL: 'http://127.0.0.1:3200' })
    await ensureStaff(request)
    await request.dispose()
    await use(true)
  }, { scope: 'worker', auto: true }],

  // eslint-disable-next-line no-empty-pattern
  hb: async ({}, use) => {
    await use(new Homebox(state().token))
  },

  // Every test works on its own places and items, so tests never see each other's data.
  // eslint-disable-next-line no-empty-pattern
  uniq: async ({}, use, info) => {
    const tag = `${info.workerIndex}${++seq}`
    await use(name => `${name} ${tag}`)
  },
})

export { expect }
