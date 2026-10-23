import { expect, signIn, test } from './fixtures'

test('the rail shows that Homebox is connected, before and after sign-in', async ({ page }) => {
  await page.goto('/login')
  await expect(page.getByRole('status').filter({ hasText: 'Homebox на связи' })).toBeAttached()
  await signIn(page)
  const pill = page.getByRole('button', { name: 'Homebox на связи. Проверить ещё раз' })
  await expect(pill).toBeVisible()
  await expect(pill).toHaveAttribute('title', /^Homebox 0\.27\.\d+$/)
  await page.screenshot({ path: '.cache/e2e/rail.png', clip: { x: 0, y: 0, width: 1280, height: 72 } })
})
