/**
 * Generates the Landing screen's device shots from the app's own screens.
 *
 * **Skipped unless `SHOTS=1`**, so it never runs in an ordinary suite. It is not
 * a test — it asserts nothing — but it lives here because it needs the same
 * intercepted fixture world every flow uses, and a second copy of that world is
 * a second thing to keep legal.
 *
 * Regenerate with:
 *
 *     SHOTS=1 corepack pnpm exec playwright test tests/e2e/shots.spec.ts
 *
 * The images are real screenshots of real screens, which is the point: a drawn
 * mock-up of a product screen drifts from the product silently, and this is the
 * one screen a stranger sees.
 */

import { test } from '@playwright/test'
import { open, world } from './fixture'

const OUT = 'apps/client/src/assets'

test.skip(process.env['SHOTS'] !== '1', 'set SHOTS=1 to regenerate the Landing shots')

test('shot: the squad', async ({ page }) => {
  await open(page, {}, world.calls, {}, null)
  await page.getByRole('tab', { name: 'Squad' }).click()
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${OUT}/shot-pitch.png` })
})

test('shot: the week in one read', async ({ page }) => {
  await open(page, {}, world.calls, {}, null)
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${OUT}/shot-overview.png` })
})

test('shot: head to head', async ({ page }) => {
  await open(page)
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${OUT}/shot-transfer.png` })
})

test('shot: team news', async ({ page }) => {
  await open(page, {}, world.calls, {
    news: {
      since: new Date().toISOString(),
      flagged: [
        { playerId: 423, fields: ['chance'], nowExcluded: false },
        { playerId: 557, fields: ['status'], nowExcluded: true },
      ],
    },
  }, null)
  await page.getByTestId('news-token').click()
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${OUT}/shot-news.png` })
})

test('shot: the run', async ({ page }) => {
  await page.route('**/api/runs/stream', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 6000))
    await route.fulfill({ headers: { 'content-type': 'text/event-stream' }, body: '' })
  })
  await open(page, {}, world.calls, {}, null)
  await page.getByTestId('refresh').click()
  await page.getByRole('dialog', { name: /Refresh/ }).getByRole('button', { name: /^Refresh/ }).click()
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${OUT}/shot-thinking.png` })
})
