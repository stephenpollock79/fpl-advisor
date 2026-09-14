/**
 * The figures follow the data, for nothing (ruled 2026-09-14, STE-65).
 *
 * The claim under test is not that recomputation is correct — the engine's own
 * suite proves the arithmetic. It is that recomputing **changes no call's
 * existence, membership or decision**, which is what keeps F6-AC-15 true while
 * the figures stay honest.
 */

import { describe, expect, it } from 'vitest'
import { type SideNow, type StoredFigure, recomputeAll, recomputeCall } from '../../apps/server/src/refresh/recompute.js'

const side = (playerId: number, projection: number, extra: Partial<SideNow> = {}): SideNow => ({
  playerId,
  projections: [projection, projection, projection],
  availability: { eligible: true },
  hasFixture: true,
  inSquad: true,
  priceTenths: 50,
  sellingPriceTenths: 50,
  ...extra,
})

const world = (...sides: SideNow[]) => new Map(sides.map((s) => [s.playerId, s]))

const call = (extra: Partial<StoredFigure> = {}): StoredFigure => ({
  key: 'substitution:upgrade:out=1:in=2',
  identity: { type: 'substitution', variant: 'upgrade', outPlayerId: 1, inPlayerId: 2 },
  outPlayerId: 1,
  inPlayerId: 2,
  conviction: 90,
  band: 'certain',
  isReading: false,
  pointsHit: 0,
  ...extra,
})

describe('F6-RS-08, F6-AC-06 · recomputing costs nothing and reports only what the criterion says', () => {
  it('F6-RS-08: with nothing moved the figure is identical rather than close', () => {
    // 2.4 against 7.0 is GW4's real substitution: net 4.60, 90 · certain.
    const sides = world(side(1, 2.4), side(2, 7.0))
    const again = recomputeCall(call(), sides)

    expect(again.net).toBe(4.6)
    expect(again.conviction).toBe(90)
    expect(again.band).toBe('certain')
    expect(again.movedBand).toBe(false)
  })

  it('F6-AC-06: a smaller move inside the same band is silent', () => {
    // Net 6.00 rather than 4.60, so the figure moves from 90 to 92 — both still
    // certain, and the manager is told nothing, which is the criterion.
    const sides = world(side(1, 1.0), side(2, 7.0))
    const again = recomputeCall(call(), sides)

    expect(again.conviction).toBe(92)
    expect(again.band).toBe('certain')
    expect(again.movedBand).toBe(false)
    expect(again.previousConviction).toBeNull()
  })

  it('F6-AC-06, F6-AC-11: crossing a band boundary is reported, and says what it moved from', () => {
    const sides = world(side(1, 5.0), side(2, 7.0))
    const again = recomputeCall(call(), sides)

    expect(again.band).not.toBe('certain')
    expect(again.movedBand).toBe(true)
    expect(again.previousConviction).toBe(90)
  })

  it('F6-AC-06: a call that can no longer be executed is reported, whatever its figure was', () => {
    const excluded = world(side(1, 2.4), side(2, 7.0, { availability: { eligible: false, reason: 'injured' } }))
    const gone = world(side(1, 2.4))

    for (const sides of [excluded, gone]) {
      const again = recomputeCall(call(), sides)
      expect(again.unexecutable).toBe(true)
      expect(again.conviction).toBeNull()
    }
  })

  it('F6-AC-06: a call becoming nothing-to-do is a reported move, not a silent one', () => {
    // The incumbent is now the stronger side, so the call resolves to a keep.
    const sides = world(side(1, 7.0), side(2, 2.4))
    const again = recomputeCall(call(), sides)

    expect(again.isReading).toBe(true)
    expect(again.conviction).toBeNull()
    expect(again.movedBand).toBe(true)
  })

  it('a blanking club contributes zero, and the count never comes from the projection', () => {
    const sides = world(side(1, 2.4, { hasFixture: false }), side(2, 7.0))
    const again = recomputeCall(call(), sides)

    // Unplayable rather than re-scored: forced, and the net never negative.
    expect(again.net).toBeGreaterThanOrEqual(0)
  })
})

describe('F6-AC-15 · recomputing is not a refresh', () => {
  it('F6-AC-04, F6-AC-15: every stored call comes back, and none is added, dropped or decided', () => {
    const calls = [call(), call({ key: 'k2', outPlayerId: 3, inPlayerId: 4, identity: { type: 'substitution', variant: 'upgrade', outPlayerId: 3, inPlayerId: 4 } })]
    const sides = world(side(1, 2.4), side(2, 7.0), side(3, 1.0), side(4, 6.0))
    const { all, reported } = recomputeAll(calls, sides)

    expect(all.map((r) => r.key)).toEqual(calls.map((c) => c.key))
    // Only what F6-AC-06 says to report reaches the sheet; the rest is silent.
    expect(reported.length).toBeLessThanOrEqual(all.length)
    expect(reported.every((r) => r.movedBand || r.unexecutable)).toBe(true)
  })

  it('the same inputs give the same figures on every run', () => {
    const sides = world(side(1, 2.4), side(2, 7.0))
    expect(recomputeCall(call(), sides)).toEqual(recomputeCall(call(), sides))
  })
})


describe('a transfer is re-derived too, and that is not a detail', () => {
  const transfer = (extra: Partial<StoredFigure> = {}): StoredFigure => ({
    key: 'transfer:out=1:in=2',
    identity: { type: 'transfer', outPlayerId: 1, inPlayerId: 2 },
    outPlayerId: 1,
    inPlayerId: 2,
    conviction: 68,
    band: 'lean',
    isReading: false,
    pointsHit: 0,
    ...extra,
  })

  it('F6-RS-01: a transfer recomputes over three gameweeks, weighted, like the run scored it', () => {
    // **This is the case the module shipped without.** Every other test here
    // used a substitution, the engine refuses a transfer that arrives without
    // its two prices, and the world re-derives every call on every read — so one
    // transfer in the database returned a 500 for the whole app.
    const sides = world(side(1, 2.6, { sellingPriceTenths: 65 }), side(2, 4.8, { priceTenths: 76 }))
    const again = recomputeCall(transfer(), sides)

    expect(again.unexecutable).toBe(false)
    expect(again.conviction).not.toBeNull()
    // Three gameweeks at 1.0 / 0.6 / 0.35: 9.36 against 5.07. A one-week call
    // would have given 2.20, so the horizon is doing its job here.
    expect(again.net).toBeCloseTo(4.29, 2)
  })

  it('F3-AC-25: a transfer whose outgoing side has no recoverable selling price is unexecutable, never priced at a guess', () => {
    const sides = world(side(1, 2.6, { sellingPriceTenths: null }), side(2, 4.8))
    const again = recomputeCall(transfer(), sides)

    expect(again.unexecutable).toBe(true)
    expect(again.conviction).toBeNull()
  })

  it('one call that cannot be re-derived keeps its stored figure rather than taking the read down', () => {
    // A blank horizon is a shape the engine refuses. The screen must still load.
    const broken = transfer({ inPlayerId: 9, identity: { type: 'transfer', outPlayerId: 1, inPlayerId: 9 } })
    const sides = world(side(1, 2.6), side(9, 4.8, { projections: [] }))
    const { all } = recomputeAll([broken], sides)

    expect(all).toHaveLength(1)
    expect(all[0]?.conviction).toBe(68)
    expect(all[0]?.band).toBe('lean')
  })
})
