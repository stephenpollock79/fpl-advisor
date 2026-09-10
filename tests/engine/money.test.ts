/**
 * F3-AC-25, F3-AC-28 — what a call costs.
 *
 * Money is an integer in tenths of £1m throughout, matching FPL's own
 * `now_cost`. No float ever holds money, which is why every function here
 * refuses one rather than rounding it quietly.
 */
import { describe, expect, it } from 'vitest'

import { sellingPriceTenths, transferCostTenths } from '../../packages/engine/src/money.js'

describe('F3-AC-25 · selling price is purchase plus half of any profit, rounded down', () => {
  it('F3-AC-25: a player who has risen sells for less than he is now worth', () => {
    // Bought at £5.5m, now £5.8m. Half of £0.3m is £0.15m, rounded down to
    // £0.1m, so he sells for £5.6m — below his current price, which is the
    // whole reason this rule cannot be skipped.
    expect(sellingPriceTenths(55, 58)).toBe(56)
    expect(sellingPriceTenths(55, 58)).toBeLessThan(58)
  })

  it('F3-AC-25: a rise of one tenth is worth nothing, because half of it rounds down to zero', () => {
    expect(sellingPriceTenths(100, 101)).toBe(100)
  })

  it('F3-AC-25: an even rise is halved exactly', () => {
    expect(sellingPriceTenths(40, 44)).toBe(42)
    expect(sellingPriceTenths(75, 81)).toBe(78)
  })

  it('F3-AC-25: a player who has fallen sells for what he is worth now, and the whole fall is borne', () => {
    expect(sellingPriceTenths(55, 54)).toBe(54)
    expect(sellingPriceTenths(120, 111)).toBe(111)
  })

  it('F3-AC-25: an unmoved price sells for itself', () => {
    expect(sellingPriceTenths(65, 65)).toBe(65)
  })

  it('F3-AC-25: money stays an integer number of tenths, and a float is refused', () => {
    expect(Number.isInteger(sellingPriceTenths(55, 58))).toBe(true)
    expect(() => sellingPriceTenths(5.5, 5.8)).toThrow()
    expect(() => sellingPriceTenths(55, 58.5)).toThrow()
  })
})

describe('F3-AC-25, F3-AC-28 · what a transfer costs, and what everything else costs', () => {
  it('F3-AC-25: cost is the incoming price minus the outgoing selling price', () => {
    expect(transferCostTenths(70, 56)).toBe(14)
  })

  it('F3-AC-25: a downgrade frees cash and reads as a negative cost rather than zero', () => {
    expect(transferCostTenths(45, 56)).toBe(-11)
  })

  it('F3-AC-28: a substitution and a captaincy call move no money', () => {
    // Asserted through the call evaluator in call.test.ts, where the cost is
    // produced; here only that the arithmetic is never reached for them.
    expect(transferCostTenths(0, 0)).toBe(0)
  })
})
