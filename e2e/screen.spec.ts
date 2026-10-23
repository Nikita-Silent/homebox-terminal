import type { Locator, Page } from '@playwright/test'
import { ADMIN } from './env'
import { expect, signIn, test } from './fixtures'

// The two terminals on the floor: the 1024×768 touch monitor and the 1280 one. No browser chrome.
const SCREENS = [
  { width: 1024, height: 768 },
  { width: 1280, height: 900 },
]

/** On screen without scrolling and not hidden under the confirmation bar or the keyboard. */
async function expectInReach(target: Locator) {
  await expect(target).toBeVisible()
  const reach = await target.evaluate((el) => {
    const r = el.getBoundingClientRect()
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    return {
      inside: r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight && r.right <= innerWidth,
      uncovered: !!hit && (el === hit || el.contains(hit)),
    }
  })
  expect(reach).toEqual({ inside: true, uncovered: true })
}

/** Nothing sticks out sideways: no page scroll, nothing in the rail cut off at the edge. */
async function expectFitsWidth(page: Page) {
  const overflow = await page.evaluate(() => ({
    page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    rail: Math.max(...[...document.querySelectorAll('[data-app-rail] *')].map(el => el.getBoundingClientRect().right)) - innerWidth,
  }))
  expect(overflow.page).toBeLessThanOrEqual(0)
  expect(overflow.rail).toBeLessThanOrEqual(0)
}

for (const screen of SCREENS) {
  test.describe(`${screen.width}×${screen.height}`, () => {
    test.use({ viewport: screen, hasTouch: true })

    test('the rail holds every section and a lost Homebox, names stay inside their buttons', async ({ page, hb, uniq }) => {
      const shelf = await hb.location(uniq('Полка'))
      const thing = await hb.item(uniq('Кабель'), shelf.id, 1)
      await page.route('**/api/health', route => route.fulfill({
        json: { ok: true, homebox: 'unreachable', homeboxConfigured: true, homeboxVersion: null, homeboxTested: false },
      }))

      await page.goto('/login')
      const person = page.getByRole('button', { name: ADMIN.name, exact: true })
      const spill = await person.evaluate(el => el.scrollWidth - el.clientWidth)
      expect(spill).toBeLessThanOrEqual(0)

      await signIn(page, ADMIN, `/item/${thing.id}`)
      await page.getByRole('button', { name: 'В корзину' }).click()
      await expect(page.getByRole('link', { name: 'Корзина: 1' })).toBeVisible()
      await expect(page.getByRole('button', { name: /Homebox недоступен/ })).toBeVisible()
      await expectFitsWidth(page)
      await expectInReach(page.getByRole('button', { name: `Выйти (${ADMIN.name})` }))
    })

    test('the card, the move and the result keep their next action in reach', async ({ page, hb, uniq }) => {
      const from = await hb.location(uniq('Помещение 2 — стеллажи у ворот'))
      const to = await hb.location(uniq('Полка'), from.id)
      const name = uniq('Кабель силовой ВВГнг-LS 3×2,5 мм² в бухтах по 100 метров')
      const cable = await hb.item(name, from.id, 40)
      await hb.item(name, to.id, 5)

      await signIn(page, undefined, `/item/${cable.id}`)
      await expectFitsWidth(page)
      await expectInReach(page.getByRole('link', { name: 'Переместить' }))

      await page.goto(`/item/${cable.id}/move?to=${to.id}`)
      await expect(page.getByText(`Добавится к «${name}»`)).toBeVisible()
      await expectFitsWidth(page)
      await expectInReach(page.getByRole('button', { name: 'Подтвердить' }))
      await expectInReach(page.getByRole('heading', { name: 'Сколько' }))
      await expectInReach(page.getByRole('button', { name: 'Больше' }))

      // Typing a filter: the field and the first match stay above the keyboard.
      const filter = page.getByPlaceholder('Найти склад, помещение или полку')
      await filter.tap()
      const keyboard = page.getByRole('group', { name: 'Экранная клавиатура' })
      for (const key of 'полка') await keyboard.getByRole('button', { name: key, exact: true }).tap()
      await expect(filter).toHaveValue('полка')
      await expectInReach(filter)
      await expectInReach(page.getByRole('tree', { name: 'Локации' }).getByRole('treeitem').first())
      await keyboard.getByRole('button', { name: 'Скрыть клавиатуру' }).tap()

      await page.getByRole('button', { name: 'Подтвердить' }).click()
      await expect(page).toHaveURL(/\/result\//)
      await expectFitsWidth(page)
      await expectInReach(page.getByRole('link', { name: 'Следующее оборудование' }))
    })

    test('search: the field stays above the keyboard while typing', async ({ page, hb, uniq }) => {
      const shelf = await hb.location(uniq('Полка'))
      await hb.item(uniq('Гирлянда'), shelf.id, 1)
      await signIn(page)

      const field = page.getByPlaceholder('Название, модель, серийный номер или UID')
      await field.tap()
      const keyboard = page.getByRole('group', { name: 'Экранная клавиатура' })
      for (const key of 'гирлянда') await keyboard.getByRole('button', { name: key, exact: true }).tap()
      // Live search rewrites the address; the keyboard stays up.
      await expect(page).toHaveURL(/\?q=/)
      await expect(keyboard).toBeVisible()
      await expect(field).toHaveValue('гирлянда')
      await expectInReach(field)
    })
  })
}
