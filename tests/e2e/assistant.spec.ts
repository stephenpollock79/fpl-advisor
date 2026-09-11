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
  watch: false,
  reasoning,
  reasoningSource: 'template',
  breakdown: breakdown(outPlayerId, inPlayerId, net, category === 'transfer' ? 2 : 0.5),
  alternatives,
  position,
})

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
  ],
  decisions: {},
  lastRunAt: '2026-09-11T15:00:00Z',
  blanks: 0,
  doubles: 0,
  attribution: { name: 'Fantasy Football IQ', href: 'https://fantasyfootballiq.app' },
}

async function open(
  page: Page,
  decisions: Record<string, string> = {},
  calls: unknown[] = world.calls,
): Promise<{ posted: { callKey: string; state: string }[] }> {
  const posted: { callKey: string; state: string }[] = []
  await page.route('**/api/me', (route: Route) =>
    route.fulfill({ json: { manager: { user_id: 'u', fpl_team_id: 6131656, team_name: 'Noggingham Forest', manager_name: 'S', overall_rank: 1 }, needsTeamLink: false } }),
  )
  await page.route('**/api/world', (route: Route) => route.fulfill({ json: { ...world, decisions, calls } }))
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
