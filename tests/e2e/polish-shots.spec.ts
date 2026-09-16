/**
 * Captures every screen at 390×844, for the polish review (STE-79).
 *
 * **Skipped unless `POLISH=1`.** It asserts nothing — it is a camera, not a test
 * — and it lives here for the same reason `shots.spec.ts` does: it needs the
 * intercepted fixture world every flow already uses, and a second copy of that
 * world is a second thing to keep legal.
 *
 *     POLISH=1 SHOT_DIR=/some/path corepack pnpm exec playwright test tests/e2e/polish-shots.spec.ts
 *
 * **Three of these states have never rendered in the real app.** `docs/coverage-gaps.md`
 * records that the injury and doubt markers have never been seen — every player
 * in the squad has been fit on every read — and that the blank and double
 * gameweek displays have only ever existed in code. A visual fault in any of them
 * could not have been found yet, and would first appear the week a squad member
 * picks up a knock. That is the argument for a fixture over the live app here:
 * it can be asked for states the world has not yet produced.
 */

import { test } from '@playwright/test'
import { CAPTAIN, T1, bench, open, player, squad, world } from './fixture'

const OUT = process.env['SHOT_DIR'] ?? 'polish-shots'
const shot = async (page: import('@playwright/test').Page, name: string) => {
  await page.waitForTimeout(450)
  await page.screenshot({ path: `${OUT}/${name}.png` })
}

test.skip(process.env['POLISH'] !== '1', 'set POLISH=1 to capture the polish shots')

test('landing — what he does', async ({ page }) => {
  await page.route('**/api/me', (r) => r.fulfill({ status: 401, json: { error: 'not_signed_in' } }))
  await page.goto('/')
  await shot(page, '01-landing-about')
})

test('landing — log in, and the code step', async ({ page }) => {
  await page.route('**/api/me', (r) => r.fulfill({ status: 401, json: { error: 'not_signed_in' } }))
  await page.route('**/api/auth/request-code', (r) => r.fulfill({ json: { status: 'code_requested' } }))
  await page.goto('/')
  await page.getByRole('tab', { name: /log in/i }).click()
  await shot(page, '02-landing-login')

  await page.getByLabel(/email/i).fill('someone@example.com')
  await page.getByTestId('send-code').click()
  await shot(page, '03-landing-code')
})

test('overview — the week in one read', async ({ page }) => {
  await open(page, {}, world.calls, {}, null)
  await shot(page, '04-overview')
})

test('overview — a week with nothing worth changing', async ({ page }) => {
  await open(page, {}, [], {}, null)
  await shot(page, '05-overview-quiet')
})

test('squad — the pitch', async ({ page }) => {
  await open(page, {}, world.calls, {}, null)
  await page.getByRole('tab', { name: 'Squad' }).click()
  await shot(page, '06-squad-pitch')
})

test('squad — the stat table', async ({ page }) => {
  await open(page, {}, world.calls, {}, null)
  await page.getByRole('tab', { name: 'Squad' }).click()
  await page.getByRole('tab', { name: 'Stat', exact: true }).click()
  await shot(page, '07-squad-stats')
})

test('head to head — a transfer', async ({ page }) => {
  await open(page)
  await shot(page, '08-head-to-head')
})

test('head to head — how this was calculated', async ({ page }) => {
  await open(page)
  await page.getByRole('button', { name: /how this was calculated/i }).click()
  await shot(page, '09-head-to-head-explained')
})

test('head to head — the captaincy card', async ({ page }) => {
  await open(page, {}, world.calls, {}, 'captaincy')
  await shot(page, '10-captaincy')
})

test('category cleared', async ({ page }) => {
  await open(page)
  await page.getByRole('button', { name: /Select/ }).click()
  await page.getByRole('button', { name: /Reject/ }).click()
  await shot(page, '11-category-cleared')
})

test('the refresh confirmation', async ({ page }) => {
  await open(page)
  await page.getByTestId('refresh').click()
  await shot(page, '12-refresh-confirm')
})

test('the account sheet', async ({ page }) => {
  await open(page, {}, world.calls, {}, null)
  await page.getByRole('button', { name: /account/i }).first().click()
  await shot(page, '13-account-sheet')
})

/**
 * **Never seen in the real app.** Every player has been fully fit on every read
 * since the first, so the red injury marker and the amber doubt percentage have
 * rendered only in code. A wrong colour, a clipped badge or a marker in the
 * wrong corner would have passed every check made so far.
 */
test('unseen — an injured player and a doubtful one', async ({ page }) => {
  const hurt = squad.map((p) =>
    p.playerId === 6
      ? { ...p, status: 'i', chanceOfPlayingNextRound: 0 }
      : p.playerId === 9
        ? { ...p, status: 'd', chanceOfPlayingNextRound: 25 }
        : p,
  )
  await open(page, {}, world.calls, { players: hurt }, null)
  await page.getByRole('tab', { name: 'Squad' }).click()
  await shot(page, '14-unseen-injury-pitch')

  await page.getByRole('tab', { name: 'Stat', exact: true }).click()
  await shot(page, '15-unseen-injury-stats')
})

/**
 * **Also never seen.** Gameweek 4 had no blanks and no doubles, and the
 * ingestion log said so by staying silent. The NO GAME pill on its dashed
 * border and the empty difficulty track have only ever existed in code.
 */
test('unseen — a blank gameweek', async ({ page }) => {
  const blanked = squad.map((p) =>
    p.playerId === 8 || p.playerId === 411 ? { ...p, fixtures: [], projectedPoints: 0, projections: [0, 0, 0] } : p,
  )
  await open(page, {}, world.calls, { players: blanked }, null)
  await page.getByRole('tab', { name: 'Squad' }).click()
  await shot(page, '16-unseen-blank-pitch')

  await page.getByRole('tab', { name: 'Stat', exact: true }).click()
  await shot(page, '17-unseen-blank-stats')
})

/** A double: two fixtures in one gameweek, never summed (a data rule). */
test('unseen — a double gameweek', async ({ page }) => {
  const doubled = squad.map((p) =>
    p.playerId === 411
      ? {
          ...p,
          fixtures: [
            { opponentClubId: 99, opponentShortName: 'BUR', isHome: true, difficulty: 2 },
            { opponentClubId: 98, opponentShortName: 'LEE', isHome: false, difficulty: 4 },
          ],
        }
      : p,
  )
  await open(page, {}, world.calls, { players: doubled }, null)
  await page.getByRole('tab', { name: 'Squad' }).click()
  await shot(page, '18-unseen-double-pitch')
})

/** Every conviction band on one screen — the app's signature figure. */
test('the four conviction bands', async ({ page }) => {
  await open(page)
  await shot(page, '19-band-first')
  for (const n of [1, 2]) {
    await page.getByRole('button', { name: 'Next undecided call' }).click()
    await shot(page, `20-band-${String(n)}`)
  }
})
