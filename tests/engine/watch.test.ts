/**
 * The price half of WATCH (STE-117), ruled 2026-09-11: set at FPL's strongest
 * likelihood for tonight, ±5, on either player in a transfer; never when FPL has
 * locked the price; the reason one tap away and free of probability words.
 */

import { describe, expect, it } from 'vitest'
import { WATCH_LIKELIHOOD, priceWatch } from '../../packages/engine/src/index.js'

const quiet = (name: string) => ({ name, likelihoodTonight: 0, locked: false })
const signal = (name: string, likelihoodTonight: number | null, locked = false) => ({ name, likelihoodTonight, locked })

describe('F3-AC-17 · WATCH on a price expected to move tonight', () => {
  it('F3-AC-17: set when the incoming player is at FPL\'s strongest likelihood to rise', () => {
    expect(priceWatch(quiet('Gvardiol'), signal('Konsa', 5))).toBe(
      "FPL expects Konsa's price to rise tonight — buying today avoids paying £0.1m more.",
    )
  })

  it('F3-AC-17: set when the outgoing player is at the strongest likelihood to fall', () => {
    expect(priceWatch(signal('Eze', -5), quiet('Groß'))).toBe(
      "FPL expects Eze's price to fall tonight — selling today avoids losing £0.1m.",
    )
  })

  it('F3-AC-17: covers the two waiting cases too — a buy about to fall, a sale about to rise', () => {
    expect(priceWatch(quiet('A'), signal('B', -5))).toMatch(/^FPL expects B's price to fall tonight — buying tomorrow/)
    expect(priceWatch(signal('C', 5), quiet('D'))).toMatch(/^FPL expects C's price to rise tonight — selling tomorrow/)
  })

  it('F3-AC-17: the incoming player is read first when both are moving', () => {
    expect(priceWatch(signal('Out', -5), signal('In', 5))).toMatch(/^FPL expects In's/)
  })

  it('F3-AC-17: nothing below the strongest level, nothing when locked, nothing without a forecast', () => {
    expect(WATCH_LIKELIHOOD).toBe(5)
    expect(priceWatch(signal('A', 4), signal('B', -4))).toBeNull()
    expect(priceWatch(quiet('A'), signal('B', 5, true))).toBeNull()
    expect(priceWatch(signal('A', null), signal('B', null))).toBeNull()
  })

  it('ENGINE-AC-05: the reason never uses probability words beside the strength figure', () => {
    const reasons = [
      priceWatch(quiet('A'), signal('B', 5)),
      priceWatch(quiet('A'), signal('B', -5)),
      priceWatch(signal('A', 5), quiet('B')),
      priceWatch(signal('A', -5), quiet('B')),
    ]
    for (const r of reasons) expect(r).not.toMatch(/likel|probab|chance|confiden|odds/i)
  })
})
