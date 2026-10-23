import { expect, signIn, test } from './fixtures'

test('the rail shows that Homebox is connected, before and after sign-in', async ({ page }) => {
  await page.goto('/login')
  await expect(page.getByRole('status').filter({ hasText: 'Homebox на связи' })).toBeAttached()
  await signIn(page)
  const marker = page.getByRole('button', { name: /^Homebox на связи\./ })
  await expect(marker).toBeVisible()
  await marker.click()
  await expect(page.getByText(/^Версия 0\.27\.\d+$/)).toBeVisible()
  await marker.click()
  await expect(marker).toHaveAttribute('aria-expanded', 'false')
  await page.screenshot({ path: '.cache/e2e/rail.png', clip: { x: 0, y: 0, width: 1280, height: 72 } })
})
