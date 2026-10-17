/**
 * F6-UP-02 on the Squad screen — the one the app opens on.
 *
 * The amber strip was on the Assistant only. Since STE-198 a failed read at the
 * gameweek turnover answers with last week's squad marked unreachable, and the
 * app opens on the Squad screen — so without the strip here, the manager would
 * see an out-of-date squad with nothing saying so. F6-UP-02 asks for the strip
 * to timestamp "the whole screen", and this is the screen he sees first.
 */

import { type Route, expect, test } from '@playwright/test'
import { world } from './fixture'

const openSquad = async (page: import('@playwright/test').Page, extra: Record<string, unknown>) => {
  await page.route('**/api/me', (route: Route) =>
    route.fulfill({ json: { manager: { user_id: 'u', fpl_team_id: 6131656, team_name: 'Noggingham Forest', manager_name: 'S', overall_rank: 1 }, needsTeamLink: false } }),
  )
  await page.route('**/api/world', (route: Route) => route.fulfill({ json: { ...world, ...extra } }))
  await page.goto('/')
}

test('F6-UP-02: the Squad screen says FPL is not answering, and how old the data is', async ({ page }) => {
  await openSquad(page, { feedsReachable: false, dataReadAt: new Date(Date.now() - 39 * 60_000).toISOString() })

  const frozen = page.getByTestId('frozen')
  await expect(frozen).toBeVisible()
  await expect(frozen).toContainText('39 minutes old')
  await expect(frozen).toContainText('FPL is not answering')
})

test('F6-UP-02: with the feeds answering, the Squad screen carries no strip', async ({ page }) => {
  await openSquad(page, { feedsReachable: true })

  await expect(page.getByRole('tab', { name: 'Pitch' })).toBeVisible()
  await expect(page.getByTestId('frozen')).toHaveCount(0)
})
