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
import { T1, T2, bench, open, player, squad, world } from './fixture'

const OUT = process.env['SHOT_DIR'] ?? 'polish-shots'

/**
 * **844 is the whole phone, and no browser ever gives you that.**
 *
 * The suite's viewport is 390×844 — the device, not the visible page. In Chrome
 * on iOS the address bar and toolbar take roughly 180px of it, and `SquadScreen`
 * already carries a comment about this exact trap: *"on a real handset the
 * visible viewport falls far short of 844 … a fixed cap plus everything else
 * then overflowed and clipped the forwards."*
 *
 * It clipped the forwards again on 2026-09-16, on Stephen's phone, from work
 * verified at 844. So these run at the height a real browser leaves unless told
 * otherwise, and 844 is the exception you ask for rather than the default you
 * get.
 */
const HEIGHT = Number(process.env['SHOT_H'] ?? 660)
test.use({ viewport: { width: 390, height: HEIGHT } })
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

/**
 * **Five across a line is the widest a formation gets**, and the card was sized
 * from it rather than from the four-man case it is usually seen in. A 5-4-1 and
 * a 3-5-2 put five in defence and five in midfield respectively.
 */
test('widest — five at the back (5-3-3)', async ({ page }) => {
  // Two midfielders drop into defence: 5 DEF, 3 MID, 3 FWD.
  const five = squad.map((p) => (p.playerId === 557 || p.playerId === 6 ? { ...p, position: 'DEF' } : p))
  await open(page, {}, world.calls, { players: five }, null)
  await page.getByRole('tab', { name: 'Squad' }).click()
  await shot(page, '21-widest-five-def')
})

test('widest — five in midfield (3-5-2)', async ({ page }) => {
  // One forward moves into midfield: 3 DEF, 5 MID, 2 FWD.
  const five = squad.map((p) => (p.playerId === 9 ? { ...p, position: 'MID' } : p))
  await open(page, {}, world.calls, { players: five }, null)
  await page.getByRole('tab', { name: 'Squad' }).click()
  await shot(page, '22-widest-five-mid')
})

/** The Overview's call rows, with one of each decision state on screen (STE-168). */
test('overview — call rows, selected and rejected', async ({ page }) => {
  await open(page, { [T1]: 'selected', [T2]: 'rejected' }, world.calls, {}, null)
  await page.getByLabel('Transfers').evaluate((el) => { el.scrollIntoView({ block: 'start' }) })
  await shot(page, '23-overview-call-rows')
})

/**
 * **The screen every open starts on** (STE-170), and the one it stops on when
 * the world cannot be read. Held open by a request that never answers, so the
 * capture is of the real state rather than a component rendered on its own.
 */
test('boot — opening, and stopped', async ({ page }) => {
  await page.route('**/api/me', () => {
    /* never fulfilled: the app sits in its opening state */
  })
  await page.goto('/')
  await shot(page, '24-boot-opening')

  await page.unrouteAll()
  await page.route('**/api/me', (r) =>
    r.fulfill({ json: { manager: { user_id: 'u', fpl_team_id: 6131656, team_name: 'Noggingham Forest', manager_name: 'S', overall_rank: 1 }, needsTeamLink: false } }),
  )
  await page.route('**/api/world', (r) => r.fulfill({ status: 502, json: { error: 'fpl_unreachable' } }))
  await page.goto('/')
  await shot(page, '25-boot-stopped')
})
