import { ADMIN } from './env'
import { expect, signIn, test } from './fixtures'

// A touch monitor with no keyboard: the terminal brings its own.
test.use({ hasTouch: true })

test('on a touch screen the search field opens the on-screen keyboard and searches with it', async ({ page, hb, uniq }) => {
  const shelf = await hb.location(uniq('Полка'))
  const thing = await hb.item(uniq('Гирлянда'), shelf.id, 1)
  await signIn(page)

  const keyboard = page.getByRole('group', { name: 'Экранная клавиатура' })
  await expect(keyboard).toBeHidden()
  await page.getByPlaceholder('Название, модель, серийный номер или UID').tap()
  await expect(keyboard).toBeVisible()
  await page.screenshot({ path: '.cache/e2e/keyboard-ru.png' })

  for (const key of 'ирлянд') await keyboard.getByRole('button', { name: key, exact: true }).tap()
  await expect(page.getByPlaceholder('Название, модель, серийный номер или UID')).toHaveValue('ирлянд')
  await keyboard.getByRole('button', { name: 'Найти' }).tap()
  await expect(keyboard).toBeHidden()
  // The only match opens its card straight away.
  await expect(page).toHaveURL(new RegExp(`/item/${thing.id}$`))
})

test('a real keyboard or the scanner hides the on-screen one', async ({ page }) => {
  await signIn(page)
  const keyboard = page.getByRole('group', { name: 'Экранная клавиатура' })
  const field = page.getByPlaceholder('Название, модель, серийный номер или UID')
  await field.tap()
  await expect(keyboard).toBeVisible()
  await page.keyboard.type('000-001')
  await expect(keyboard).toBeHidden()
  await expect(field).toHaveValue('000-001')
})

test('the PIN field of a new employee gets the digit pad', async ({ page }) => {
  await signIn(page, ADMIN, '/admin/users')
  const keyboard = page.getByRole('group', { name: 'Экранная клавиатура' })
  await page.getByRole('button', { name: 'Новый сотрудник' }).tap()
  await page.getByPlaceholder('4–8 цифр').tap()
  await expect(keyboard).toBeVisible()
  await expect(keyboard.getByRole('button', { name: 'Пробел' })).toHaveCount(0)
  await page.screenshot({ path: '.cache/e2e/keyboard-digits.png' })
  for (const key of '2468') await keyboard.getByRole('button', { name: key, exact: true }).tap()
  await expect(page.getByPlaceholder('4–8 цифр')).toHaveValue('2468')
  await keyboard.getByRole('button', { name: 'Скрыть клавиатуру' }).tap()
  await expect(keyboard).toBeHidden()
})
