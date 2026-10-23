import { expect, signIn, test } from './fixtures'

test('without knowing the name: warehouse → shelf → item, and the full list', async ({ page, hb, uniq }) => {
  const warehouse = await hb.location(uniq('Склад'))
  const shelf = await hb.location(uniq('Полка'), warehouse.id)
  const thing = await hb.item(uniq('Паяльник'), shelf.id, 2)

  await signIn(page)
  await page.getByRole('link', { name: 'Не знаю названия — выбрать из списка' }).click()
  await page.getByRole('link', { name: warehouse.name }).click()
  await expect(page.getByRole('link', { name: shelf.name })).toBeVisible()
  await page.getByRole('link', { name: shelf.name }).click()
  await page.getByRole('link', { name: new RegExp(thing.name) }).click()
  await expect(page).toHaveURL(new RegExp(`/item/${thing.id}$`))

  await page.goto('/browse/all')
  await page.getByLabel('Отфильтровать список').fill(thing.name.toLowerCase())
  await expect(page.locator('a[href^="/item/"]')).toHaveCount(1)
})

test('search finds Cyrillic names by part of the name in any case', async ({ page, hb, uniq }) => {
  const shelf = await hb.location(uniq('Полка'))
  const thing = await hb.item(uniq('Удлинитель'), shelf.id, 3)
  await signIn(page)
  const field = page.getByPlaceholder('Название, модель, серийный номер или UID')
  // Homebox searches itself, so a record created a moment ago is found at once.
  await field.fill(thing.name.slice(0, 8).toLowerCase())
  // Nothing happens until the search is asked for.
  await expect(page.getByRole('link', { name: new RegExp(thing.name) })).toHaveCount(0)
  await page.getByRole('button', { name: 'Найти' }).click()
  // The only match opens its card.
  await expect(page).toHaveURL(new RegExp(`/item/${thing.id}$`))
})
