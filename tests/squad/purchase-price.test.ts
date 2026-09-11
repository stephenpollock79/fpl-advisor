/**
 * Where a purchase price comes from (STE-87, ruled 2026-09-10).
 *
 * `entry/{id}/transfers/` is public and carries `element_in_cost` — the price
 * actually paid — for every transfer, with its gameweek. A player held since
 * gameweek 1 has no transfer, and his gameweek-1 price is `now_cost −
 * cost_change_start`, straight off `bootstrap-static`.
 *
 * The transfers payload shape is FPL's; values are invented. **The real team has
 * made no transfers yet**, so on live data today only the fallback runs — which is
 * exactly why the first branch has to be proved here rather than observed.
 */

import { describe, expect, it } from 'vitest'
import { purchasePrices } from '../../apps/server/src/squad/snapshot.js'

const transfer = (event: number, element_in: number, element_in_cost: number, element_out = 999) => ({
  element_in,
  element_in_cost,
  element_out,
  element_out_cost: 50,
  entry: 1,
  event,
  time: '2026-09-01T00:00:00Z',
})

/** now_cost and cost_change_start, as bootstrap-static states them. */
const prices = new Map([
  [10, { nowCostTenths: 64, costChangeStartTenths: -1 }],
  [20, { nowCostTenths: 76, costChangeStartTenths: 1 }],
  [30, { nowCostTenths: 56, costChangeStartTenths: 1 }],
])

describe('F3-AC-25, F3-AC-26 · purchase prices, stored per player', () => {
  it('F3-AC-25, F3-AC-26: a player bought by transfer carries the price actually paid', () => {
    const result = purchasePrices([10, 20], [transfer(2, 20, 74)], [], prices)
    expect(result.get(20)).toBe(74)
  })

  it('F3-AC-25, F3-AC-26: a player held since gameweek 1 carries now_cost minus cost_change_start', () => {
    // Tzolis on the real squad: 6.4 now, down 0.1 since the start, so bought at 6.5.
    const result = purchasePrices([10], [], [], prices)
    expect(result.get(10)).toBe(65)
  })

  it('F3-AC-25, F3-AC-26: the latest purchase wins when a player was sold and bought back', () => {
    const result = purchasePrices([20], [transfer(2, 20, 74), transfer(3, 999, 50, 20), transfer(4, 20, 77)], [], prices)
    expect(result.get(20)).toBe(77)
  })

  it('F3-AC-25, F3-AC-26: transfers made in a Free Hit gameweek are skipped, because the squad reverted', () => {
    // Bought at 5.8 in GW3 on a Free Hit, which reverts — so that price describes a
    // player the manager never really owned at that cost. The real holding is from GW1.
    const chips = [{ name: 'freehit', event: 3 }]
    const result = purchasePrices([30], [transfer(3, 30, 58)], chips, prices)
    expect(result.get(30)).toBe(55)
  })

  it('F3-AC-25, F3-AC-26: Wildcard transfers are real and permanent, so they count', () => {
    const chips = [{ name: 'wildcard', event: 3 }]
    const result = purchasePrices([30], [transfer(3, 30, 58)], chips, prices)
    expect(result.get(30)).toBe(58)
  })

  it('F3-AC-25, F3-AC-26: a player the feed does not price is left unknown rather than guessed', () => {
    const result = purchasePrices([40], [], [], prices)
    expect(result.get(40)).toBeNull()
  })
})
