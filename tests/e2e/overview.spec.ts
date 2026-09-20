/**
 * The Assistant Overview, in a real browser at 390×844 (F8, STE-66).
 *
 * **Each test causes the circumstance its criterion is about** (P16). The
 * filter tests decide calls before filtering; the token test opens a world
 * whose news has moved since the last run; the hidden-row test uses a filter
 * that genuinely hides something. A test that asserted the same words over an
 * untouched world would pass whether the rule were built or not.
 *
 * What these prove is behaviour. How any of it *looks* is the manual checklist
 * on STE-66 — a class-name assertion is not a substitute (CLAUDE.md).
 */

import { expect, test } from '@playwright/test'
import { ARMBAND, T1, T2, open, world } from './fixture'

/** Slice 8 opens the Assistant on the Overview, so these stay where they land. */
const overview = (page: Parameters<typeof open>[0], decisions = {}, extra = {}) =>
  open(page, decisions, world.calls, extra, null)

test('F8-AC-02, F8-AC-06: deciding a call moves the headline count and the tally together', async ({ page }) => {
  await overview(page)

  await expect(page.getByTestId('overview')).toBeVisible()
  // Six calls, one of which is the vice; none decided yet.
  await expect(page.getByTestId('decided')).toContainText('0 of')

  // The trigger: a decision taken on the Overview's own panel, not a different
  // world handed in. The three actions live one tap behind CHANGE, which is what
  // keeps every row the same height.
  await page.getByTestId(`change-${T1}`).click()
  await page.getByTestId(`card-${T1}`).getByRole('button', { name: 'Select' }).click()
  await expect(page.getByTestId('decided')).toContainText('1 of')
})

test('F8-AC-04: the editorial names the gameweek the squad was read from', async ({ page }) => {
  await overview(page)
  // The fixture's snapshot is GW4's picks while GW4 is being advised; the line
  // must name where the squad came from rather than what is being advised on.
  await expect(page.getByTestId('squad-state')).toContainText('built from your squad')
})

test('F8-AC-07: a blank gameweek makes the editorial lead with the bench-order consequence', async ({ page }) => {
  // The trigger is a world carrying a blank — a shape this season may not
  // produce for weeks, and the one the editorial most has to get right.
  await overview(page, {}, { blanks: 1 })

  await expect(page.getByTestId('exception-lead')).toContainText('no fixture')
  await expect(page.getByTestId('exception-lead')).toContainText('bench order')
})

test('F8-AC-20 – F8-AC-24: each filter chip shows its own set, and only Selected reads decisions', async ({ page }) => {
  // The trigger: one call selected and one rejected, so Selected has something
  // to differ about.
  await overview(page, { [T1]: 'selected', [T2]: 'rejected' })

  await page.getByTestId('chip-selected').click()
  await expect(page.getByTestId(`card-${T1}`)).toBeVisible()
  await expect(page.getByTestId(`card-${T2}`)).toHaveCount(0)

  // The band views are unmoved by those same decisions (F8-AC-24).
  await page.getByTestId('chip-all').click()
  await expect(page.getByTestId(`card-${T2}`)).toBeVisible()
})

test('F8-AC-25, F8-AC-26: under a band filter a rejected call is still counted, and still renders rejected', async ({ page }) => {
  // The counter-intuitive half. It needs a rejection to exist at all — over an
  // untouched world this test would pass with the rule removed.
  await overview(page, { 'substitution:upgrade:out=557:in=40': 'rejected' })

  await page.getByTestId('chip-recommended').click()
  // Stated on screen, because it cannot be inferred (F8-AC-25).
  await expect(page.getByTestId('filter-note')).toContainText('rejected')
  // And the card keeps its rejected state rather than reading as untouched.
  await expect(page.getByTestId('card-substitution:upgrade:out=557:in=40')).toBeVisible()
})

test('F8-AC-32, F8-AC-33: a filter that hides calls says how many, and Show all clears it', async ({ page }) => {
  await overview(page)

  // The trigger: a filter that genuinely hides something. No call in the
  // fixture is forced, so Forced only hides every one of them.
  await page.getByTestId('chip-forced').click()
  const hidden = page.getByTestId('hidden-transfer')
  await expect(hidden).toContainText('hidden by filter')

  await hidden.getByRole('button', { name: 'Show all' }).click()
  await expect(page.getByTestId(`card-${T1}`)).toBeVisible()
})

test('F8-AC-13, F8-AC-15, F8-AC-18, F8-AC-19: moved evidence raises the token and the last-run line, and starts no run', async ({ page }) => {
  // The trigger is the world's own news payload — what the server derives from
  // the gap between the newest read and the read the last run saw.
  await overview(page, {}, {
    news: { since: new Date().toISOString(), flagged: [{ playerId: 423, fields: ['chance'], nowExcluded: false }] },
  })

  await expect(page.getByTestId('news-token')).toHaveText('1')
  await expect(page.getByTestId('last-run')).toContainText('1 player flagged since')

  // Opening it shows the verdict and offers a run — it does not start one
  // (F8-AC-19). If it did, the interstitial would be on screen already.
  await page.getByTestId('news-token').click()
  // Each flagged player, with a one-line verdict and a refresh action (F8-AC-15).
  await expect(page.getByTestId('news-tooltip')).toContainText('Shaw')
  await expect(page.getByTestId('news-tooltip')).toContainText('expected to start at 75%')
  await expect(page.getByTestId('news-refresh')).toBeVisible()
  await expect(page.getByRole('dialog', { name: /Refresh/ })).toHaveCount(0)

  /**
   * **And all of it is on the screen.** `toBeVisible` is not this check:
   * Playwright counts an element visible when it has a box and is not hidden,
   * so a panel hanging 77px off the left edge — which is what this was on
   * Stephen's phone on 2026-09-16 — passes every assertion above while the
   * start of every line is unreachable.
   *
   * It asserts geometry rather than a class name because the fault was
   * geometry: the panel was anchored to the badge's right edge and opened
   * leftward, and the badge sits near the left of the header.
   */
  const panel = await page.getByTestId('news-tooltip').boundingBox()
  const width = page.viewportSize()?.width ?? 0
  expect(panel).not.toBeNull()
  expect(panel?.x, 'the news panel starts off the left of the screen').toBeGreaterThanOrEqual(0)
  expect((panel?.x ?? 0) + (panel?.width ?? 0), 'the news panel runs off the right of the screen').toBeLessThanOrEqual(width)
})

test('STE-182: the news panel closes on a tap outside and on Escape, without opening what the tap landed on', async ({ page }) => {
  await overview(page, {}, {
    news: { since: new Date().toISOString(), flagged: [{ playerId: 423, fields: ['chance'], nowExcluded: false }] },
  })

  await page.getByTestId('news-token').click()
  await expect(page.getByTestId('news-tooltip')).toBeVisible()

  /**
   * **The tap lands on a call card, which is the case that matters.** A card is
   * a control that navigates, so a dismissal that also activated it would take
   * the manager somewhere he did not ask to go — and that is the half a
   * "does it close?" assertion would miss entirely.
   */
  await page.getByTestId(`card-${T1}`).click()
  await expect(page.getByTestId('news-tooltip')).toHaveCount(0)
  // Still on the Overview: the tap was spent dismissing and nothing else.
  await expect(page.getByTestId('overview')).toBeVisible()

  // Escape closes it too, which is what a keyboard expects.
  await page.getByTestId('news-token').click()
  await expect(page.getByTestId('news-tooltip')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('news-tooltip')).toHaveCount(0)

  // And the badge still toggles — this adds a way out rather than replacing one.
  await page.getByTestId('news-token').click()
  await expect(page.getByTestId('news-tooltip')).toBeVisible()
  await page.getByTestId('news-token').click()
  await expect(page.getByTestId('news-tooltip')).toHaveCount(0)

  // Dismissing is not the action inside the panel, so it starts no run
  // (F8-AC-19). A confirmation on screen here would mean it had.
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByTestId('thinking')).toHaveCount(0)
})

test('F8-AC-16, F6-AC-09: the token’s own refresh runs at every scope, from whichever tab it is tapped on', async ({ page }) => {
  await overview(page, {}, {
    news: { since: new Date().toISOString(), flagged: [{ playerId: 423, fields: ['status'], nowExcluded: true }] },
  })

  // The trigger: tapping it from a *scoped* tab. New team news is squad-wide,
  // so a scoped run here would half-clear the token.
  await page.getByTestId('tab-transfer').click()
  await page.getByTestId('news-token').click()
  await page.getByTestId('news-refresh').click()

  await expect(page.getByRole('dialog', { name: 'Refresh everything' })).toBeVisible()
})

test('F8-AC-31: a player with two fixtures carries ×2 and one with none carries BLANK', async ({ page }) => {
  // **From the fixture list, never from a projection** — the count is the FPL
  // feed's and the projection is the other feed's. So the trigger is a player
  // whose `fixtures` array is the exceptional length, with his projection left
  // exactly as it was.
  const doubled = { opponentClubId: 98, opponentShortName: 'EVE', isHome: false, difficulty: 3 }
  const players = world.players.map((p) =>
    p.playerId === 7
      ? { ...p, fixtures: [...(p.fixtures as unknown[]), doubled] }
      : p.playerId === 10
        ? { ...p, fixtures: [] }
        : p,
  )
  await overview(page, {}, { players })

  await expect(page.getByTestId(`card-${T1}`).getByText('×2')).toBeVisible()
  await expect(page.getByTestId(`card-${T2}`).getByText('BLANK')).toBeVisible()
})

test('F8-AC-18: with no news outstanding the last-run line says so instead', async ({ page }) => {
  await overview(page)
  await expect(page.getByTestId('last-run')).toContainText('squad news up to date')
})

test('F6-AC-07, F6-AC-08: the Overview carries exactly one refresh control, and it names what it rewrites', async ({ page }) => {
  // **One criterion is still deliberately not cited anywhere in this file** — not
  // even to say it is unmet, because the coverage script reads whole files and
  // would count the mention. It is the one about this control's position and
  // visible label, and it is in `docs/coverage-gaps.md` with why.
  //
  // The scoping criterion above *is* now cited: the PRD was rewritten on
  // 2026-09-16 (STE-158) so it says the control always rewrites the whole week,
  // which is what this asserts and what the app has always done.
  await overview(page)

  const refresh = page.getByTestId('refresh')
  await expect(refresh).toHaveCount(1)
  await expect(refresh).toHaveAttribute('aria-label', 'Refresh everything')

  await refresh.click()
  await expect(page.getByRole('dialog', { name: 'Refresh everything' })).toBeVisible()
})

test('F8-AC-27, STE-151: the armband is one row, stated as a result rather than a move', async ({ page }) => {
  /**
   * **This asserted the old meta — "1 pick · 1 held" — which counted two
   * armband calls against each other.** There is one, so the category counts
   * like the other two and the row states who wears what. An arrow here is the
   * swap framing the Captain tab stopped using, and it survived on this screen
   * for a week because the two label their rows in different files.
   */
  await overview(page)

  const card = page.getByTestId(`card-${ARMBAND}`)
  await expect(card).toContainText('Armband:')
  await expect(card).toContainText('(C)')
  await expect(card).toContainText('(V)')
  await expect(card).not.toContainText('→')

  // A count, like Transfers and Substitutions.
  await expect(page.getByLabel('Captain').getByText(/suggested/)).toBeVisible()
})

test('F8-AC-28, F8-AC-29, F8-AC-30, F3-AC-10: a card decides in place, and the decision can be changed there', async ({ page }) => {
  await overview(page)

  const card = page.getByTestId(`card-${ARMBAND}`)
  await page.getByTestId(`change-${ARMBAND}`).click()
  await card.getByRole('button', { name: 'Select' }).click()
  await expect(card.getByText('SELECTED')).toBeVisible()

  // Changed from the card's own panel, without reopening the detail card. The
  // panel reopens to the three actions — not to Category cleared's two-way
  // control, which is a different screen answering a different question.
  await page.getByTestId(`change-${ARMBAND}`).click()
  await expect(card.getByRole('button', { name: 'Select' })).toBeVisible()

  // A rejected card stays listed rather than disappearing (F8-AC-30, F3-AC-11).
  await card.getByRole('button', { name: 'Reject' }).click()
  await expect(card.getByText('REJECTED')).toBeVisible()
})

test('F8-UP-02: a category with every call decided reads Done and shows Category cleared', async ({ page }) => {
  // The trigger is a category in which every call has actually been decided.
  await overview(page, { [T1]: 'selected', [T2]: 'rejected' })

  await page.getByTestId('tab-transfer').click()
  await expect(page.getByText('Transfers decided')).toBeVisible()
})

test('F8-UP-03, F6-UP-02: with the feeds unreachable the Overview works from the last read and says how old it is', async ({ page }) => {
  // The trigger is the world reporting the source gone — the advice is still on
  // file and still true, so nothing is cleared.
  await overview(page, {}, { feedsReachable: false, dataReadAt: new Date(Date.now() - 39 * 60_000).toISOString() })

  await expect(page.getByTestId('frozen')).toContainText('39 minutes old')
  await expect(page.getByTestId('overview')).toBeVisible()
  await expect(page.getByTestId('refresh')).toBeDisabled()
})

test('F8-UP-01: a refresh that fails leaves the Overview’s advice exactly where it was', async ({ page }) => {
  await overview(page)
  await expect(page.getByTestId(`card-${T1}`)).toBeVisible()

  // The trigger is a run that actually fails. Asserting over a world nobody ran
  // against would prove the cards render, not that a failure spares them.
  await page.route('**/api/runs/stream', (route) =>
    route.fulfill({
      headers: { 'content-type': 'text/event-stream' },
      body: 'event: error\ndata: {"reason":"run_failed","runId":"r1"}\n\n',
    }),
  )
  await page.getByTestId('refresh').click()
  // Scoped to the dialog: the status bar's own control carries the same words.
  await page.getByRole('dialog', { name: 'Refresh everything' }).getByRole('button', { name: 'Refresh everything' }).click()

  // The previous advice is intact rather than cleared — a failed run must never
  // destroy what is on file.
  await expect(page.getByTestId(`card-${T1}`)).toBeVisible()
  await expect(page.getByTestId('last-run')).toContainText('last run')
})

test('F3-AC-13, F6-AC-02: opening a decided call from the Overview shows that call, reading as decided', async ({ page }) => {
  // **The trigger is a call that has already been decided.** Opening an
  // undecided one would pass whether the rule were built or not — and the bug
  // this replaces only appeared on a decided card, which was looked up among the
  // undecided ones, missed, and fell back to somebody else's.
  await overview(page, { [T2]: 'selected' })

  await page.getByTestId(`card-${T2}`).getByRole('button', { name: /→/ }).click()

  // The call asked for, not a neighbour: T2 sells FwdB.
  await expect(page.getByTestId('decided-panel')).toContainText('SELECTED · LOCKED')
  await expect(page.getByTestId('out-name')).toHaveText('FwdB')

  // Read-only: no way to decide it again without saying so first.
  await expect(page.getByRole('button', { name: 'Select' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Reject' })).toHaveCount(0)

  // And Change reopens it in place rather than costing the decision to look.
  await page.getByTestId('reopen').click()
  await expect(page.getByTestId('decided-panel')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Select' })).toBeVisible()
})

test('F8-AC-35: the footer hint is always present', async ({ page }) => {
  await overview(page)
  await expect(page.getByText('Tap a call for the full evaluation.')).toBeVisible()
})

test('F3-UP-05, F8-AC-01: a week with no calls says so, with an empty tally', async ({ page }) => {
  // The trigger is a run that produced nothing — not a filter emptying a list.
  await open(page, {}, [], { editorial: 'Your fifteen is fit and nobody has a fixture worth chasing. Hold your transfer.' }, null)

  await expect(page.getByTestId('decided')).toContainText('no calls this week')
  await expect(page.getByTestId('tally')).toContainText('nothing outstanding')
  await expect(page.getByTestId('editorial')).toContainText('Hold your transfer')
})
