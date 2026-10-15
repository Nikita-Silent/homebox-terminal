import { expect, PNG, signIn, test } from './fixtures'

test('photos from Homebox show in lists and on the card; an SVG «photo» never does', async ({ page, hb, uniq }) => {
  const shelf = await hb.location(uniq('Полка'))
  const withPhoto = await hb.item(uniq('Коммутатор'), shelf.id, 1)
  const withSvg = await hb.item(uniq('Подозрительное'), shelf.id, 1)
  await hb.photo(withPhoto.id, { name: 'switch.png', type: 'image/png', body: PNG })
  await hb.photo(withSvg.id, { name: 'x.svg', type: 'image/svg+xml', body: new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>') })

  await signIn(page, undefined, `/browse/${shelf.id}`)
  const thumb = page.locator(`a[href="/item/${withPhoto.id}"] img`)
  await expect(thumb).toBeVisible()
  // Loaded and decoded, not just present.
  await expect.poll(() => thumb.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBeGreaterThan(0)
  await expect(page.locator(`a[href="/item/${withSvg.id}"] img`)).toHaveCount(0)

  await page.goto(`/item/${withPhoto.id}`)
  await page.getByRole('button', { name: 'Открыть фото во весь экран' }).click()
  await expect(page.getByRole('dialog', { name: /Фото/ })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)

  const svg = await page.request.get(`/api/items/${withSvg.id}/image`)
  expect(svg.status()).toBe(404)
})
