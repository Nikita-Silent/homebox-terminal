import { ADMIN } from './env'
import { expect, signIn, STAFF, test } from './fixtures'

test.describe('sign-in', () => {
  test('a visitor signs in with the PIN and lands where they were going', async ({ page }) => {
    await page.goto('/browse')
    await expect(page).toHaveURL(/\/login\?next=\/browse$/)
    await page.getByRole('button', { name: STAFF.name, exact: true }).click()
    const keypad = page.getByRole('group', { name: 'Клавиатура PIN' })
    for (const digit of '1111') await keypad.getByRole('button', { name: digit, exact: true }).click()
    await keypad.getByRole('button', { name: 'Войти' }).click()
    await expect(page.getByRole('alert')).toContainText('Неверный PIN. Осталось попыток: 4')

    for (const digit of STAFF.pin) await page.keyboard.press(digit)
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/browse$/)
    await expect(page.getByText(STAFF.name)).toBeVisible()
  })

  test('staff see no admin sections and cannot open them', async ({ page }) => {
    await signIn(page)
    await expect(page.getByRole('link', { name: 'Журнал' })).toHaveCount(0)
    await page.goto('/admin/users')
    await expect(page).toHaveURL(/\/$/)
    const api = await page.request.get('/api/admin/journal?from=2026-01-01T00:00:00Z&to=2027-01-01T00:00:00Z')
    expect(api.status()).toBe(403)
  })

  test('signing out returns to the sign-in screen and ends the session', async ({ page }) => {
    await signIn(page)
    await page.getByRole('button', { name: `Выйти (${STAFF.name})` }).click()
    await expect(page.getByRole('heading', { name: 'Кто работает?' })).toBeVisible()
    expect((await page.request.get('/api/auth/me')).status()).toBe(401)
  })

  test('the terminal signs out after 15 idle minutes and comes back to the same screen', async ({ page }) => {
    await page.clock.install()
    await signIn(page, STAFF, '/browse')
    await page.clock.fastForward('16:00')
    await expect(page).toHaveURL(/\/login\?reason=idle&next=\/browse$/)
    await expect(page.getByText('Терминал закрылся после бездействия')).toBeVisible()
    await signIn(page, STAFF, page.url())
    await expect(page).toHaveURL(/\/browse$/)
  })

  test('an admin adds an employee who can sign in, and disabling ends their session', async ({ page, browser, uniq }) => {
    const name = uniq('Мария')
    await signIn(page, ADMIN)
    await page.getByRole('link', { name: 'Сотрудники' }).click()
    await page.getByPlaceholder('Как в журнале').fill(name)
    await page.getByPlaceholder('4–8 цифр').fill('5093')
    await page.getByRole('button', { name: 'Добавить' }).click()
    await expect(page.getByText(`«${name}» — в списке`)).toBeVisible()

    const other = await browser.newPage()
    await signIn(other, { name, pin: '5093' })

    await page.locator('article', { hasText: name }).getByRole('button', { name: 'Отключить' }).click()
    await expect(page.locator('article', { hasText: name })).toContainText('отключён')

    await other.goto('/browse')
    await expect(other).toHaveURL(/\/login/)
    await expect(other.getByRole('button', { name, exact: true })).toHaveCount(0)
    await other.close()
  })
})
