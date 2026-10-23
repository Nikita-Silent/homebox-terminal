import { ADMIN } from './env'
import { expect, label, scan, signIn, test } from './fixtures'

test('the cart moves several items to one shelf in one go and the journal shows each move', async ({ page, hb, uniq }) => {
  const from = await hb.location(uniq('Полка А'))
  const to = await hb.location(uniq('Полка Б'))
  const switchUnit = await hb.item(uniq('Коммутатор'), from.id, 1)
  const name = uniq('Крокодилы')
  const clips = await hb.item(name, from.id, 30)
  const there = await hb.item(name, to.id, 5)

  await signIn(page, undefined, '/cart')
  await expect(page.getByText('Корзина пуста')).toBeVisible()
  await scan(page, switchUnit.assetId)
  await scan(page, label.item(clips.id))
  await scan(page, switchUnit.assetId)
  await expect(page.getByText(`«${switchUnit.name}» уже в корзине`)).toBeVisible()
  await expect(page.getByRole('link', { name: 'Корзина: 2' })).toBeVisible()

  await page.getByRole('button', { name: new RegExp(`^Количество «${name}»`) }).click()
  await page.locator('article', { hasText: name }).getByRole('button', { name: 'Больше' }).click()
  await scan(page, label.location(to.id))
  await expect(page.getByText('Запись переедет целиком')).toBeVisible()
  await expect(page.getByText(`Добавится к записи UID ${there.assetId}: 5 → 7 шт.`)).toBeVisible()
  await expect(page.getByText('2 поз. · 3 шт.')).toBeVisible()

  await page.getByRole('button', { name: 'Переместить всё' }).click()
  await expect(page.getByText('Перемещено: 2')).toBeVisible()
  // Empty again: the rail keeps the cart, without a count.
  await expect(page.getByRole('link', { name: 'Корзина', exact: true })).toBeVisible()

  expect((await hb.get(switchUnit.id)).parent?.id).toBe(to.id)
  expect((await hb.get(clips.id)).quantity).toBe(28)
  expect((await hb.get(there.id)).quantity).toBe(7)

  // The report names the employee for both operations.
  await page.getByRole('button', { name: /Выйти/ }).click()
  await signIn(page, ADMIN, '/admin/journal?period=today')
  await page.getByPlaceholder('Оборудование, UID или место').fill(to.name)
  const rows = page.locator('a[href^="/result/"]')
  await expect(rows).toHaveCount(2)
  await expect(rows.filter({ hasText: 'Иван Петров' })).toHaveCount(2)
  await expect(page.getByText('Перемещено').locator('..')).toContainText('3')
})
