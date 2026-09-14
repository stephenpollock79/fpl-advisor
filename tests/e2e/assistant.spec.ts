/**
 * STE-63 — the Assistant's flows, in a real browser at 390×844.
 *
 * `/api/*` is intercepted with a fixture world built around GW4's shapes, so no
 * server, database or model is involved. What these prove is the interaction —
 * advancing, clearing, reopening, recomputing. What they cannot prove is how any
 * of it looks; that is the manual checklist in the slice 5 spec.
 */

import { type Page, type Route, expect, test } from '@playwright/test'

type Player = Record<string, unknown>

const player = (id: number, surname: string, position: string, projection: number, extra: Player = {}): Player => ({
  playerId: id,
  surname,
  shirtNumber: id % 30,
  clubId: id,
  clubShortName: 'C' + String(id % 20),
  position,
  isStarter: true,
  benchOrder: null,
  isCaptain: false,
  isVice: false,
  status: 'a',
  chanceOfPlayingNextRound: null,
  nowCostTenths: 50,
  form: 3,
  selectedByPercent: 10,
  seasonPoints: 20,
  transfersIn: 1000,
  transfersOut: 1000,
  projectedPoints: projection,
  projections: [projection, projection, projection],
  fixtures: [{ opponentClubId: 99, opponentShortName: 'BUR', isHome: true, difficulty: 2 }],
  nextThree: [2, 3, 2],
  purchasePriceTenths: 50,
  sellingPriceTenths: 50,
  ...extra,
})

const bench = (order: number) => ({ isStarter: false, benchOrder: order })

const squad = [
  player(1, 'Keeper', 'GKP', 3.5),
  player(423, 'Shaw', 'DEF', 1.7, { status: 'd', chanceOfPlayingNextRound: 75 }),
  player(3, 'DefA', 'DEF', 4.0),
  player(4, 'DefB', 'DEF', 3.9),
  player(557, 'Tzolis', 'MID', 2.4, { nowCostTenths: 64, purchasePriceTenths: 65, sellingPriceTenths: 64 }),
  player(6, 'MidA', 'MID', 5.5),
  player(7, 'MidB', 'MID', 5.0),
  player(8, 'Semenyo', 'MID', 6.2, { isCaptain: true }),
  player(9, 'FwdA', 'FWD', 6.0),
  player(10, 'FwdB', 'FWD', 5.0),
  player(411, 'Haaland', 'FWD', 8.0, { isVice: true }),
  player(12, 'SubKeeper', 'GKP', 2.0, bench(0)),
  player(40, 'Rogers', 'MID', 7.0, bench(1)),
  player(112, 'VanHecke', 'DEF', 4.7, bench(2)),
  player(15, 'SubDef', 'DEF', 1.0, bench(3)),
]

const candidates = [
  player(124, 'Groß', 'MID', 6.0, { isStarter: false, nowCostTenths: 56, purchasePriceTenths: null, sellingPriceTenths: null }),
  player(200, 'Winger', 'MID', 5.8, { isStarter: false, nowCostTenths: 55, purchasePriceTenths: null, sellingPriceTenths: null }),
  player(300, 'Striker', 'FWD', 6.2, { isStarter: false, nowCostTenths: 60, purchasePriceTenths: null, sellingPriceTenths: null }),
]

const breakdown = (outId: number, inId: number, net: number, k: number) => ({
  weights: k === 2 ? [1, 0.6, 0.35] : [1],
  out: { playerId: outId, projections: [0], gate: { eligible: true }, total: 0 },
  in: { playerId: inId, projections: [0], gate: { eligible: true }, total: net },
  net,
  pointsHit: 0,
  k,
  kLabel: k === 2 ? 'transfer' : 'captain/vice',
  byCeiling: false,
})

const call = (position: number, key: string, category: string, shape: string, outPlayerId: number, inPlayerId: number, net: number, conviction: number, band: string, costTenths: number, reasoning: string, alternatives: unknown = null) => ({
  key,
  category,
  shape,
  outPlayerId,
  inPlayerId,
  net,
  conviction,
  band,
  k: category === 'transfer' ? 2 : 0.5,
  pointsHit: 0,
  costTenths,
  isForced: false,
  isReading: false,
  readingReason: null,
  watch: false,
  reasoning,
  reasoningSource: 'template',
  breakdown: breakdown(outPlayerId, inPlayerId, net, category === 'transfer' ? 2 : 0.5),
  alternatives,
  position,
  diffTag: null,
  previousConviction: null,
})

/** A keep reading: the armband is already right, so there is no decision in it. */
const keep = (position: number, key: string, shape: string, outPlayerId: number, inPlayerId: number, reasoning: string) => ({
  ...call(position, key, 'captaincy', shape, outPlayerId, inPlayerId, -1.8, 5, 'thin', 0, reasoning),
  isReading: true,
  readingReason: 'incumbent_wins',
  conviction: null,
  band: null,
})

const CAPTAIN = 'captaincy:captain:from=8:to=411'
const VICE = 'captaincy:vice:from=411:to=8'

const T1 = 'transfer:out=7:in=124'
const T2 = 'transfer:out=10:in=300'

const world = {
  gameweek: { id: 4, name: 'Gameweek 4', deadlineTime: '2026-09-12T12:30:00Z' },
  lastScoredGameweek: 3,
  snapshot: { id: 's1', source: 'fpl_deadline', capturedAt: '2026-09-11T10:00:00Z', bankTenths: 10, freeTransfers: 3, chipsRemaining: { wildcard: 'available', freehit: 'available', bboost: 'available', '3xc': 'spent' } },
  players: squad,
  candidates,
  calls: [
    call(0, T1, 'transfer', 'transfer', 7, 124, 1.95, 49, 'thin', 6, 'Groß over MidB: 6.0 projected points this gameweek against 5.0.', { out: [6], in: [200] }),
    call(1, T2, 'transfer', 'transfer', 10, 300, 2.34, 54, 'thin', 10, 'Striker over FwdB: 6.2 projected points this gameweek against 5.0.', { out: [9], in: [] }),
    call(2, 'substitution:upgrade:out=557:in=40', 'substitution', 'upgrade_swap', 557, 40, 4.6, 90, 'certain', 0, 'Rogers over Tzolis: 7.0 projected points this gameweek against 2.4.'),
    call(3, 'substitution:doubt:out=423:in=112', 'substitution', 'doubt_swap', 423, 112, 3, 86, 'strong', 0, 'VanHecke over Shaw: 4.7 projected points this gameweek against 1.7.'),
    call(4, CAPTAIN, 'captaincy', 'captain', 8, 411, 1.8, 78, 'lean', 0, 'Haaland over Semenyo: 8.0 projected points this gameweek against 6.2.'),
    call(5, VICE, 'captaincy', 'vice', 411, 8, 0, 5, 'thin', 0, 'Semenyo over Haaland: the vice armband has to move.'),
  ],
  decisions: {},
  // Relative to the clock, not fixed: WATCH hides a forecast from before FPL's
  // last overnight update, so a fixed date would fail this suite the next day.
  lastRunAt: new Date().toISOString(),
  priceForecastReadAt: new Date(Date.now() - 60_000).toISOString(),
  blanks: 0,
  doubles: 0,
  attribution: { name: 'Fantasy Football IQ', href: 'https://fantasyfootballiq.app' },
}

async function open(
  page: Page,
  decisions: Record<string, string> = {},
  calls: unknown[] = world.calls,
  extra: Record<string, unknown> = {},
): Promise<{ posted: { callKey: string; state: string }[] }> {
  const posted: { callKey: string; state: string }[] = []
  await page.route('**/api/me', (route: Route) =>
    route.fulfill({ json: { manager: { user_id: 'u', fpl_team_id: 6131656, team_name: 'Noggingham Forest', manager_name: 'S', overall_rank: 1 }, needsTeamLink: false } }),
  )
  await page.route('**/api/world', (route: Route) => route.fulfill({ json: { ...world, decisions, calls, ...extra } }))
  await page.route('**/api/decisions', async (route: Route) => {
    posted.push(JSON.parse(route.request().postData() ?? '{}') as { callKey: string; state: string })
    await route.fulfill({ json: { ok: true } })
  })
  await page.goto('/')
  await page.getByRole('tab', { name: 'Assistant' }).click()
  return { posted }
}

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
  await expect(page.getByText('FORCED', { exact: true })).toBeVisible()
  await expect(page.getByText('WATCH', { exact: true })).toHaveCount(0)
})

test('F3-AC-07: Later on the last undecided transfer leaves it pending and moves to the other tab', async ({ page }) => {
  // Until the Overview exists, the last card's Later has to go somewhere (STE-122).
  await open(page)

  await page.getByRole('button', { name: /Select/ }).click()
  await expect(page.getByTestId('in-name')).toHaveText('Striker')
  await page.getByRole('button', { name: /Later/ }).click()

  await expect(page.getByRole('tab', { name: /Sub/ })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByTestId('in-name')).toHaveText('Rogers')
  await expect(page.getByRole('status')).toHaveText('Transfers left for later — substitutions next.')
  // Still pending: the Transfer tab still counts it.
  await expect(page.getByRole('tab', { name: /Transfer/ })).toContainText('1')
})

test('F3-AC-07: Later on the only undecided call left anywhere says so, and leaves it pending', async ({ page }) => {
  await open(page, {}, world.calls.filter((c) => c.key === 'substitution:upgrade:out=557:in=40'))

  await page.getByRole('tab', { name: /Sub/ }).click()
  await page.getByRole('button', { name: /Later/ }).click()

  await expect(page.getByRole('status')).toHaveText('Left for later — it will be here when you come back.')
  await expect(page.getByTestId('in-name')).toHaveText('Rogers')
  await expect(page.getByRole('tab', { name: /Sub/ })).toContainText('1')
})

test('F3-UP-05: a category with nothing worth changing says so, rather than showing an empty list', async ({ page }) => {
  await open(page, {}, world.calls.filter((c) => c.category === 'substitution'))

  await expect(page.getByText('Transfers · clear')).toBeVisible()
  await expect(page.getByText(/No transfer is worth making this week/)).toBeVisible()
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

  await expect(page.getByTestId('keep-card')).toContainText('nothing to do')
  await expect(page.getByRole('button', { name: 'Select' })).toHaveCount(0)
})

test('F6-AC-07, F6-AC-10: the refresh control names its own scope, and asks before it runs', async ({ page }) => {
  await open(page)

  // One control, scoped to the screen it is on and saying so on itself — never a
  // bare icon whose blast radius the manager has to infer from where it sits.
  await expect(page.getByTestId('refresh')).toContainText('Transfer')
  await page.getByRole('tab', { name: 'Sub' }).click()
  await expect(page.getByTestId('refresh')).toContainText('Sub')

  await page.getByTestId('refresh').click()

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
  await expect(page.getByTestId('refresh')).toContainText('OFF')
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
  await page.getByRole('button', { name: /^Refresh/ }).click()

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
