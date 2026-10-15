import { expect, label, scan, signIn, test } from './fixtures'

test.describe('moving equipment', () => {
  test('scan a unit, scan the shelf, confirm: the whole record moves', async ({ page, hb, uniq }) => {
    const from = await hb.location(uniq('Полка А'))
    const to = await hb.location(uniq('Полка Б'))
    const router = await hb.item(uniq('Роутер'), from.id, 1)

    await signIn(page)
    await scan(page, router.assetId)
    await expect(page).toHaveURL(new RegExp(`/item/${router.id}$`))
    await expect(page.getByText('Поштучный учёт')).toBeVisible()

    await scan(page, label.location(to.id))
    await expect(page).toHaveURL(new RegExp(`/item/${router.id}/move\\?to=${to.id}$`))
    await expect(page.getByText('Запись переедет целиком.')).toBeVisible()
    await page.getByRole('button', { name: 'Подтвердить' }).click()

    await expect(page.getByRole('status').first()).toContainText('Перемещено')
    await expect(page.getByText('Сотрудник: Иван Петров')).toBeVisible()
    expect((await hb.get(router.id)).parent?.id).toBe(to.id)
  })

  test('part of a quantity becomes a new record with its own UID', async ({ page, hb, uniq }) => {
    const from = await hb.location(uniq('Полка А'))
    const to = await hb.location(uniq('Полка Б'))
    const ties = await hb.item(uniq('Стяжки'), from.id, 10)

    await signIn(page, undefined, `/item/${ties.id}/move?to=${to.id}`)
    await page.getByRole('button', { name: 'Больше' }).click()
    await page.getByRole('button', { name: 'Больше' }).click()
    await expect(page.getByText('Появится новая запись.')).toBeVisible()
    await page.getByRole('button', { name: 'Подтвердить' }).click()
    await expect(page.getByText('осталось 7 шт.')).toBeVisible()

    expect((await hb.get(ties.id)).quantity).toBe(7)
    const arrived = await hb.itemsIn(to.id)
    expect(arrived.map(i => [i.name, i.quantity])).toEqual([[ties.name, 3]])
    expect(arrived[0]!.assetId).not.toBe(ties.assetId)
  })

  test('quantity is added to the same product already on the shelf', async ({ page, hb, uniq }) => {
    const from = await hb.location(uniq('Полка А'))
    const to = await hb.location(uniq('Полка Б'))
    const name = uniq('Крокодилы')
    const clips = await hb.item(name, from.id, 50)
    const there = await hb.item(name, to.id, 35)

    await signIn(page, undefined, `/item/${clips.id}/move?to=${to.id}`)
    await page.getByLabel('Количество, из 50').fill('20')
    await expect(page.getByText(`Добавится к «${name}»`)).toBeVisible()
    await expect(page.getByText('На полке станет 35 → 55 шт.', { exact: false })).toBeVisible()
    await page.getByRole('button', { name: 'Подтвердить' }).click()
    await expect(page).toHaveURL(/\/result\//)
    await expect(page.getByRole('status').first()).toContainText('Перемещено')
    await expect(page.getByText(`UID ${there.assetId}`)).toBeVisible()

    expect((await hb.get(clips.id)).quantity).toBe(30)
    expect((await hb.get(there.id)).quantity).toBe(55)
  })

  test('a card that changed in Homebox meanwhile is refused with the new number', async ({ page, hb, uniq }) => {
    const from = await hb.location(uniq('Полка А'))
    const to = await hb.location(uniq('Полка Б'))
    const cable = await hb.item(uniq('Кабель'), from.id, 10)

    await signIn(page, undefined, `/item/${cable.id}/move?to=${to.id}`)
    await expect(page.getByText('Появится новая запись.')).toBeVisible()
    await hb.request('PATCH', `/entities/${cable.id}`, { id: cable.id, quantity: 4 })
    await page.getByRole('button', { name: 'Подтвердить' }).click()
    await expect(page.getByRole('alert')).toContainText('в Homebox сейчас 4 шт.')
    expect(await hb.itemsIn(to.id)).toEqual([])
  })
})
