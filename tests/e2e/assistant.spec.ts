/**
 * STE-63 — the Assistant's flows, in a real browser at 390×844.
 *
 * `/api/*` is intercepted with a fixture world built around GW4's shapes, so no
 * server, database or model is involved. What these prove is the interaction —
 * advancing, clearing, reopening, recomputing. What they cannot prove is how any
 * of it looks; that is the manual checklist in the slice 5 spec.
 */

import { type Route, expect, test } from '@playwright/test'
import { CAPTAIN, T1, T2, VICE, call, keep, open, player, squad, world } from './fixture'

test('F3-AC-12: deciding a call advances to the next undecided one; when none are left the tab reads Done and Category cleared shows', async ({ page }) => {
  await open(page)

  await expect(page.getByTestId('in-name')).toHaveText('Groß')
  await page.getByRole('button', { name: /Select/ }).click()
  await expect(page.getByTestId('in-name')).toHaveText('Striker')

  await page.getByRole('button', { name: /Reject/ }).click()
  await expect(page.getByText('Transfers decided')).toBeVisible()
  await expect(page.getByRole('tab', { name: /Transfer/ })).toContainText('Done')
})

test('F3-AC-13: head to head shows only undecided calls — a decided one cannot be browsed back to', async ({ page }) => {
  await open(page)

  await page.getByRole('button', { name: /Select/ }).click()
  await expect(page.getByTestId('in-name')).toHaveText('Striker')
  await page.getByRole('button', { name: 'Previous undecided call' }).click()
  await expect(page.getByTestId('in-name')).toHaveText('Striker')
  await page.getByRole('button', { name: 'Next undecided call' }).click()
  await expect(page.getByTestId('in-name')).toHaveText('Striker')
})

test('F3-AC-14, F3-AC-15: on Category cleared a row reopens and restores, and the line reports the live state', async ({ page }) => {
  const { posted } = await open(page)

  await page.getByRole('button', { name: /Select/ }).click()
  await page.getByRole('button', { name: /Reject/ }).click()
  await expect(page.getByTestId('cleared-line')).toHaveText('tap a decision to change it')

  await page.getByRole('button', { name: /MidB → Groß/ }).click()
  await expect(page.getByTestId('cleared-line')).toHaveText('1 call reopened · tap again to put it back')

  await page.getByRole('button', { name: /MidB → Groß/ }).click()
  await expect(page.getByTestId('cleared-line')).toHaveText('tap a decision to change it')

  expect(posted.filter((p) => p.callKey === T1).map((p) => p.state)).toEqual(['selected', 'pending', 'selected'])
})

test('F3-AC-24: choosing a different candidate recomputes net, strength, cost and the reasoning line', async ({ page }) => {
  await open(page)

  await expect(page.getByTestId('net')).toHaveText('+1.95')
  await page.getByRole('button', { name: 'Change in' }).click()
  await page.getByRole('button', { name: /Winger/ }).click()

  // 0.8 a week over 1.0 / 0.6 / 0.35 is 1.56; 100 × 1.56 ÷ 3.56 is 43.8 → 44, thin.
  await expect(page.getByTestId('in-name')).toHaveText('Winger')
  await expect(page.getByTestId('net')).toHaveText('+1.56')
  await expect(page.getByTestId('strength')).toHaveText('44 · thin')
  await expect(page.getByTestId('cost')).toHaveText('−£0.5m')
  await expect(page.getByTestId('reasoning')).toHaveText(/^Winger over MidB/)
})

test('F3-AC-28: a substitution costs £0.00 and carries no picker', async ({ page }) => {
  await open(page)

  await page.getByRole('tab', { name: /Sub/ }).click()
  await expect(page.getByTestId('in-name')).toHaveText('Rogers')
  await expect(page.getByTestId('cost')).toHaveText('£0.00')
  await expect(page.getByRole('button', { name: /Change/ })).toHaveCount(0)
})

test('F3-AC-24, F3-AC-27: a decision on a swapped candidate survives a reload, and NBal counts it once', async ({ page }) => {
  // MidB → Winger was chosen on the picker and selected before this reload.
  await open(page, { 'transfer:out=7:in=200': 'selected' })

  // So the first transfer card is decided, and the Striker call is next.
  await expect(page.getByTestId('in-name')).toHaveText('Striker')
  await expect(page.getByTestId('shortlist')).toHaveText('1')
  // Balance £1.0m, less Winger's £5.5m against MidB's £5.0m selling price.
  await expect(page.getByTestId('nbal')).toHaveText('£0.5m')
})

test('F3-AC-09: there is no remove or delete action — rejecting is the removal mechanism', async ({ page }) => {
  await open(page)

  await expect(page.getByRole('button', { name: /Reject/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /remove|delete/i })).toHaveCount(0)
})

test('F3-AC-33: a substitution card carries the same fixtures row as a transfer', async ({ page }) => {
  await open(page)

  await expect(page.getByText('this gameweek', { exact: true })).toBeVisible()
  await page.getByRole('tab', { name: /Sub/ }).click()
  await expect(page.getByText('this gameweek', { exact: true })).toBeVisible()
})

test('F3-UP-06: rejecting every call is a legitimate answer — each category reads Done', async ({ page }) => {
  await open(page)

  await page.getByRole('button', { name: /Reject/ }).click()
  await page.getByRole('button', { name: /Reject/ }).click()
  await page.getByRole('tab', { name: /Sub/ }).click()
  await page.getByRole('button', { name: /Reject/ }).click()
  await page.getByRole('button', { name: /Reject/ }).click()

  await expect(page.getByRole('tab', { name: /Transfer/ })).toContainText('Done')
  await expect(page.getByRole('tab', { name: /Sub/ })).toContainText('Done')
  await expect(page.getByText('Substitutions decided')).toBeVisible()
})

test('F3-AC-18: the flag reads WATCH with no qualifier, its reason is one tap away, and FORCED outranks it', async ({ page }) => {
  const [t1, t2, ...rest] = world.calls
  const reason = "FPL expects Groß's price to rise tonight — buying today avoids paying £0.1m more."
  await open(page, {}, [{ ...t1, watch: true, watchReason: reason }, { ...t2, watch: true, watchReason: reason, isForced: true }, ...rest])

  await expect(page.getByText('WATCH', { exact: true })).toBeVisible()
  await expect(page.getByTestId('watch-reason')).toHaveCount(0)
  await page.getByRole('button', { name: 'WATCH' }).click()
  await expect(page.getByTestId('watch-reason')).toHaveText(reason)
  await page.getByRole('button', { name: /Later/ }).click()
  // **The flag is a disc reading F, and its accessible name is the whole word.**
  // The pill wrapped to its own line at 390 and took the strip's height with it
  // (2026-09-16). Asserted by accessible name rather than by the letter, because
  // "F" on its own is what a screen reader must never be left with.
  await expect(page.getByLabel('Forced')).toBeVisible()
  await expect(page.getByLabel('Forced')).toHaveText('F')
  await expect(page.getByText('WATCH', { exact: true })).toHaveCount(0)
})

test('F3-AC-07: Later on the last undecided transfer leaves it pending and goes to the Overview', async ({ page }) => {
  /**
   * **The last card has nowhere to advance to** — head to head shows only
   * undecided calls (F3-AC-13) — so before STE-122 it simply stayed put, which
   * read as a control that did not work. Stephen found that running slice 5's
   * checklist; the answer waited on the Overview existing.
   *
   * It goes to the Overview rather than to the next category on purpose: the
   * call is still pending, and the Overview is where a pending call is visible
   * beside everything else. Hopping to the next tab was the stopgap and answered
   * a different question, leaving the deferred call out of sight.
   */
  await open(page)

  await page.getByRole('button', { name: /Select/ }).click()
  await expect(page.getByTestId('in-name')).toHaveText('Striker')
  await page.getByRole('button', { name: /Later/ }).click()

  await expect(page.getByRole('tab', { name: /Overview/i })).toHaveAttribute('aria-selected', 'true')
  // By test id rather than by role: the Overview carries its own role="status"
  // for squad-rule breaches, so landing there makes the generic selector
  // ambiguous. A knock-on of going to the Overview at all, not a defect.
  await expect(page.getByTestId('notice')).toHaveText('Transfers left for later — it is on the overview.')
  // Still pending, and still counted by the tab it came from.
  await expect(page.getByRole('tab', { name: /Transfer/ })).toContainText('1')
})

test('F3-AC-07: Later on the only undecided call left anywhere goes to the Overview, and leaves it pending', async ({ page }) => {
  // The case that used to have nowhere at all to go — one call, in one category,
  // and no other tab holding work. It said "it will be here when you come back"
  // and left the manager looking at the same card. The Overview is now where
  // "here" is, and it shows him the call he just deferred (STE-122).
  await open(page, {}, world.calls.filter((c) => c.key === 'substitution:upgrade:out=557:in=40'))

  await page.getByRole('tab', { name: /Sub/ }).click()
  await page.getByRole('button', { name: /Later/ }).click()

  await expect(page.getByRole('tab', { name: /Overview/i })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByTestId('notice')).toHaveText('Substitutions left for later — it is on the overview.')
  await expect(page.getByRole('tab', { name: /Sub/ })).toContainText('1')
})

test('F3-UP-05: a category with nothing worth changing says so, rather than showing an empty list', async ({ page }) => {
  await open(page, {}, world.calls.filter((c) => c.category === 'substitution'))

  // Said by the Gaffer, in the editorial's own clothes — "nothing worth
  // changing" is a designed answer, not an absence, and a greyed panel reads as
  // something failing to load.
  const verdict = page.getByTestId('verdict')
  await expect(verdict).toContainText('NO CHANGE')
  await expect(verdict).toContainText(/No transfer is worth making this week/)
  await expect(page.getByRole('tab', { name: /Transfer/ })).toContainText('Clear')
})

test('F4-AC-01, F4-AC-06: the Captain tab carries two calls and neither offers a candidate picker', async ({ page }) => {
  await open(page)
  await page.getByRole('tab', { name: 'Captain' }).click()

  await expect(page.getByTestId('reasoning')).toContainText('Haaland')
  // The pair is fixed by the squad — there is nothing to choose between.
  await expect(page.getByRole('button', { name: /Change/ })).toHaveCount(0)
  await expect(page.getByTestId('cost')).toHaveText('£0.00')

  await page.getByRole('button', { name: 'Next undecided call' }).click()
  // The premise is code's, not the model's, and sits on its own line so it
  // cannot be pushed off the bottom of the card by a long model sentence.
  await expect(page.getByTestId('armband-note')).toContainText('vice armband only pays if the captain does not play')
  await expect(page.getByTestId('armband-note')).toBeVisible()
  await expect(page.getByRole('button', { name: /Change/ })).toHaveCount(0)
})

test('F4-AC-02, F4-AC-03: a keep reading offers no decision tile and enters no tally', async ({ page }) => {
  const readings = [
    keep(0, CAPTAIN, 'captain', 411, 8, 'Haaland keeps it: 8.0 projected points this gameweek against Semenyo 6.2.'),
    keep(1, VICE, 'vice', 8, 411, 'Semenyo keeps it: 6.2 projected points this gameweek against FwdA 6.0.'),
  ]
  // The transfers stay in, so the control swipe below has a decidable card to
  // land on — otherwise "nothing was posted" would prove nothing.
  const { posted } = await open(page, {}, [...world.calls.slice(0, 2), ...readings])
  await page.getByRole('tab', { name: 'Captain' }).click()

  // **Not a comparison** (F4 happy path, amended 2026-09-14): one player, his
  // figure and why. A versus with a decision panel underneath reads as a choice
  // the manager is expected to resolve, and there is not one.
  // Not named `keep` — that is the fixture factory this test calls above, and
  // shadowing it here reaches the const before it exists.
  const card = page.getByTestId('keep-card')
  await expect(card).toContainText('nothing to do')
  // Here the figures produced the keep, so that is what it says.
  await expect(card).toContainText('Nobody in your eleven projects higher')
  await expect(page.getByTestId('keep-points')).toContainText('xPts this gameweek')
  await expect(page.getByText('VS', { exact: true })).toHaveCount(0)
  await expect(page.getByTestId('in-name')).toHaveCount(0)
  // Neither route into a decision exists: no tiles, and the swipe does nothing.
  await expect(page.getByRole('button', { name: 'Select' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Reject' })).toHaveCount(0)

  // Tapping the card files nothing. The *swipe* is still not asserted here:
  // Playwright's synthetic pointer stream does not reach these handlers, and the
  // same gesture on a decidable card files nothing either — so an empty `posted`
  // would be evidence about the harness. It is item 2 of the slice 6 checklist,
  // recorded in `docs/coverage-gaps.md`.
  await card.click()
  expect(posted).toHaveLength(0)

  // Nothing was ever outstanding here, so the tab says Clear rather than Done.
  await expect(page.getByRole('tab', { name: /Captain/ })).toContainText('Clear')
})

test('F4-UP-02: rejecting the captain change holds the vice call rather than leaving the pair inconsistent', async ({ page }) => {
  await open(page, { [CAPTAIN]: 'rejected' })
  await page.getByRole('tab', { name: 'Captain' }).click()

  const held = page.getByTestId('keep-card')
  await expect(held).toContainText('nothing to do')
  // **The verdict has to be true of this keep.** The armband is staying because
  // the captain change was turned down, not because nobody projects higher —
  // claiming the latter asserts something the app has not concluded.
  await expect(held).toContainText('You kept your captain')
  await expect(held).not.toContainText('projects higher')
  await expect(page.getByRole('button', { name: 'Select' })).toHaveCount(0)
})

/**
 * **The criterion this names was rewritten on 2026-09-16, and this test is why
 * it is now true** (STE-158).
 *
 * It used to assert the control named *transfers* on the Transfer tab and
 * *substitutions* on the Sub tab — which it did, and which was untrue of the run
 * behind it: every run rewrites everything and `run.scope` has never been set by
 * anything. So the test passed while the criterion was false, which is the
 * failure shape this repo keeps finding.
 *
 * Stephen ruled the run keeps doing everything and the wording changes to match.
 * The PRD now says the control **always rewrites the whole week, whichever
 * screen it was tapped from** — so the assertion below is the criterion rather
 * than a description of the build, and walking two tabs is what makes
 * *whichever screen* a trigger this test causes rather than assumes.
 */
test('F6-AC-07, F6-AC-10: the refresh control rewrites the whole week from any tab, and asks first', async ({ page }) => {
  await open(page)

  // A fixed square symbol, so its width cannot change with the tab and take the
  // header's height with it. **The same wording on every tab**, because the run
  // is the same on every tab.
  await expect(page.getByTestId('refresh')).toHaveAttribute('aria-label', /everything/i)
  await page.getByRole('tab', { name: 'Sub' }).click()
  await expect(page.getByTestId('refresh')).toHaveAttribute('aria-label', /everything/i)

  await page.getByTestId('refresh').click()
  await expect(page.getByRole('dialog')).toContainText('Refresh everything')

  // The confirmation explains the outcome rather than asking "are you sure?".
  const sheet = page.getByRole('dialog')
  await expect(sheet).toContainText('kept')
  await expect(sheet).toContainText('rewritten from scratch')
  await expect(sheet).toContainText('stay out')
  await expect(sheet).toContainText('unavailable')

  // And declining runs nothing at all.
  await page.getByRole('button', { name: 'Not now' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByTestId('thinking')).toHaveCount(0)
})

test('F6-AC-13: a call the last run touched carries its tag, and an untouched one carries none', async ({ page }) => {
  const moved = {
    ...call(0, T1, 'transfer', 'transfer', 7, 124, 1.95, 49, 'thin', 6, 'Groß over MidB.', { out: [6], in: [200] }),
    diffTag: 'band_move',
    previousConviction: 84,
  }
  await open(page, {}, [moved, world.calls[1], world.calls[2]])

  await expect(page.getByTestId('diff-tag')).toHaveText('WAS 84')

  await page.getByRole('tab', { name: 'Sub' }).click()
  await expect(page.getByTestId('diff-tag')).toHaveCount(0)
})

test('F6-AC-02: a selected call reads selected · locked, so it is clear why it did not change', async ({ page }) => {
  await open(page, { [T1]: 'selected', [T2]: 'rejected' })

  await expect(page.getByText('Transfers decided')).toBeVisible()
  await expect(page.getByText('SELECTED · LOCKED', { exact: false })).toBeVisible()
})

test('F6-UP-02: when FPL is not answering the screen says how old it is, and refresh reads off rather than failing on tap', async ({ page }) => {
  await open(page, {}, world.calls, { feedsReachable: false, dataReadAt: new Date(Date.now() - 39 * 60 * 1000).toISOString() })

  const frozen = page.getByTestId('frozen')
  await expect(frozen).toContainText('39 minutes old')
  // What is frozen, what is not, and the risk named rather than implied.
  await expect(frozen).toContainText('Not frozen')
  await expect(frozen).toContainText('team news')

  // Off, not broken: it does not fail on tap, and navigation is untouched.
  await expect(page.getByTestId('refresh')).toBeDisabled()
  await page.getByRole('tab', { name: 'Sub' }).click()
  await expect(page.getByTestId('strength')).toBeVisible()
})

test('F6-AC-19, F6-AC-16: the Thinking state states how long it takes and can be cancelled the whole way through', async ({ page }) => {
  await open(page)

  // A request that stays open, so the working state is caught mid-run rather
  // than raced against its own finish. What the steps *say* is asserted on the
  // server, which is where the labels come from.
  await page.route('**/api/runs/stream', async (route: Route) => {
    await new Promise((resolve) => setTimeout(resolve, 4000))
    await route.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream' }, body: '' })
  })

  await page.getByTestId('refresh').click()
  await page.getByRole('dialog').getByRole('button', { name: /^Refresh/ }).click()

  const thinking = page.getByTestId('thinking')
  await expect(thinking).toBeVisible()
  // Built to the handoff's own anatomy: the strip, the pipeline label and the
  // rolling status line, which the first version of this screen did not have.
  await expect(thinking).toContainText('PIPELINE')
  await expect(page.getByTestId('thinking-now')).toBeVisible()
  // The expected duration is stated rather than left to be guessed at, and how
  // to stop it is stated in the same breath — the handoff's own footer line.
  const footer = thinking.getByRole('button', { name: /usually under a minute/i })
  await expect(footer).toContainText(/tap anywhere to cancel/i)
  // Cancellable for the whole of it, not only at a convenient moment.
  await expect(footer).toBeEnabled()

  await footer.click()
  await expect(page.getByTestId('thinking')).toHaveCount(0)
  await expect(page.getByText('Nothing changed', { exact: false })).toBeVisible()
})

test('F6-AC-16: the first run of a gameweek streams like any other, with a pipeline and a way out', async ({ page }) => {
  // **The path Friday morning takes**, when the gameweek rolls over and there is
  // no advice at all. It used to be the one run with no progress and no cancel —
  // and it is the longest run of the week, so it is the one that needs both most.
  await open(page, {}, [], { lastRunAt: null })

  await page.route('**/api/runs/stream', async (route: Route) => {
    await new Promise((resolve) => setTimeout(resolve, 4000))
    await route.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream' }, body: '' })
  })

  // No confirmation first: a first run keeps, rewrites and suppresses nothing.
  await page.getByRole('button', { name: "Get this week's calls" }).click()

  const thinking = page.getByTestId('thinking')
  await expect(thinking).toBeVisible()
  await expect(thinking).toContainText('PIPELINE')
  await expect(thinking.getByRole('button', { name: /usually under a minute/i })).toBeEnabled()
})

test('F3-AC-12: a cleared category offers what is left elsewhere, and a way back to the overview', async ({ page }) => {
  /**
   * **The screen used to stop after the decided rows**, leaving about 55% of the
   * phone blank — which on a phone reads as a page that failed to load rather
   * than a job finished (STE-165). It is also the screen reached by *succeeding*
   * at the thing the app is for, which is a poor moment to look broken.
   *
   * The counts come from the same list the tab strip counts, so the two cannot
   * disagree about how much is left.
   */
  await open(page)

  await page.getByRole('button', { name: /Select/ }).click()
  await page.getByRole('button', { name: /Reject/ }).click()
  await expect(page.getByText('Transfers decided')).toBeVisible()

  await expect(page.getByText('Still to decide')).toBeVisible()
  const subs = page.getByRole('button', { name: /Substitutions/ })
  await expect(subs).toContainText('2 calls')

  // Each one is a route, not a label.
  await subs.click()
  await expect(page.getByRole('tab', { name: /Sub/ })).toHaveAttribute('aria-selected', 'true')
})

test('F3-AC-12: with every call decided, the cleared screen says so rather than listing nothing', async ({ page }) => {
  // The empty-outstanding branch: all six decided, so there is no next category
  // to offer and the screen must not show an empty heading (STE-165).
  await open(page, {
    [T1]: 'selected',
    [T2]: 'rejected',
    'substitution:upgrade:out=557:in=40': 'selected',
    'substitution:doubt:out=423:in=112': 'rejected',
    [CAPTAIN]: 'selected',
    [VICE]: 'rejected',
  })

  await expect(page.getByTestId('all-decided')).toHaveText('Every call this week is decided.')
  await expect(page.getByText('Still to decide')).toHaveCount(0)
})
