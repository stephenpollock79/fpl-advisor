/**
 * The fixture world the browser flows run against, and the helper that opens it.
 *
 * **Not a `.spec.ts`, so Playwright never collects it as a suite.** It was lifted
 * out of `assistant.spec.ts` on 2026-09-15, when slice 8 added two more specs
 * that need the same legal fifteen — a second copy of a squad is a second thing
 * to keep legal, and an illegal one would fail the Overview's squad-rule checks
 * for reasons that have nothing to do with the test.
 *
 * `/api/*` is intercepted, so no server, database or model is involved and
 * nothing here can spend.
 */

import type { Page, Route } from '@playwright/test'

export type Player = Record<string, unknown>

const CLUBS = ['ARS', 'AVL', 'BOU', 'BRE', 'BHA', 'CHE', 'CRY', 'EVE', 'FUL', 'LIV', 'MCI', 'MUN', 'NEW', 'NFO', 'TOT', 'WHU', 'WOL', 'LEE', 'BUR', 'SUN']

export const player = (id: number, surname: string, position: string, projection: number, extra: Player = {}): Player => ({
  playerId: id,
  surname,
  shirtNumber: id % 30,
  clubId: id,
  // Real codes: `kitFor` keys off them, and the Landing shots are taken from
  // this world — grey squares and 'C7 → C4' would be a picture of the fixture
  // rather than of the product.
  clubShortName: CLUBS[id % CLUBS.length] ?? 'NFO',
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

export const bench = (order: number) => ({ isStarter: false, benchOrder: order })

export const squad = [
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

export const candidates = [
  player(124, 'Groß', 'MID', 6.0, { isStarter: false, nowCostTenths: 56, purchasePriceTenths: null, sellingPriceTenths: null }),
  player(200, 'Winger', 'MID', 5.8, { isStarter: false, nowCostTenths: 55, purchasePriceTenths: null, sellingPriceTenths: null }),
  player(300, 'Striker', 'FWD', 6.2, { isStarter: false, nowCostTenths: 60, purchasePriceTenths: null, sellingPriceTenths: null }),
]

export const breakdown = (outId: number, inId: number, net: number, k: number) => ({
  weights: k === 2 ? [1, 0.6, 0.35] : [1],
  out: { playerId: outId, projections: [0], gate: { eligible: true }, total: 0 },
  in: { playerId: inId, projections: [0], gate: { eligible: true }, total: net },
  net,
  pointsHit: 0,
  k,
  kLabel: k === 2 ? 'transfer' : 'captain/vice',
  byCeiling: false,
})

export const call = (position: number, key: string, category: string, shape: string, outPlayerId: number, inPlayerId: number, net: number, conviction: number, band: string, costTenths: number, reasoning: string, alternatives: unknown = null) => ({
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
export const keep = (position: number, key: string, shape: string, outPlayerId: number, inPlayerId: number, reasoning: string) => ({
  ...call(position, key, 'captaincy', shape, outPlayerId, inPlayerId, -1.8, 5, 'thin', 0, reasoning),
  isReading: true,
  readingReason: 'incumbent_wins',
  conviction: null,
  band: null,
})

export const CAPTAIN = 'captaincy:captain:from=8:to=411'
export const VICE = 'captaincy:vice:from=411:to=8'

export const T1 = 'transfer:out=7:in=124'
export const T2 = 'transfer:out=10:in=300'

export const world = {
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

/**
 * Opens the Assistant and lands on a decision tab.
 *
 * **From slice 8 the Assistant opens on the Overview**, which is the entry
 * screen for the week (F8's happy path). Every spec below is about a decision
 * tab or a card, so the helper navigates to one rather than each spec repeating
 * the click — and `tab: null` stays on the Overview for the specs that are
 * about it.
 */
/**
 * Opens the Assistant and lands on a decision tab.
 *
 * **From slice 8 the Assistant opens on the Overview**, which is the entry
 * screen for the week (F8's happy path). Every spec below is about a decision
 * tab or a card, so the helper navigates to one rather than each spec repeating
 * the click — and `tab: null` stays on the Overview for the specs that are
 * about it.
 */
export async function open(
  page: Page,
  decisions: Record<string, string> = {},
  calls: unknown[] = world.calls,
  extra: Record<string, unknown> = {},
  tab: 'transfer' | 'substitution' | 'captaincy' | null = 'transfer',
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
  // By test id, not by name: a tab's accessible name carries its meta count as
  // well as its label, so "Transfer" is really "Transfer 2" and changes as the
  // week is decided.
  if (tab !== null) await page.getByTestId(`tab-${tab}`).click()
  return { posted }
}

