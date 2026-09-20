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
import { identityOf } from '../../apps/server/src/calls/identity.js'

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
  isForced: false,
  cannotHoldRole: false,
  ...extra,
})

describe('F6-RS-09, F6-AC-06 · recomputing costs nothing and reports only what the criterion says', () => {
  it('F6-RS-09: with nothing moved the figure is identical rather than close', () => {
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
    isForced: false,
    cannotHoldRole: false,
    ...extra,
  })

  it('F6-RS-01: a transfer recomputes over three gameweeks, weighted, like the run scored it', () => {
    // **This is the case the module shipped without.** Every other test here
    // used a substitution, the engine refuses a transfer that arrives without
    // its two prices, and the world re-derives every call on every read — so one
    // transfer in the database returned a 500 for the whole app.
    const sides = world(side(1, 2.6, { sellingPriceTenths: 65 }), side(2, 4.8, { priceTenths: 76, inSquad: false }))
    const again = recomputeCall(transfer(), sides)

    expect(again.unexecutable).toBe(false)
    expect(again.conviction).not.toBeNull()
    // Three gameweeks at 1.0 / 0.6 / 0.35: 9.36 against 5.07. A one-week call
    // would have given 2.20, so the horizon is doing its job here.
    expect(again.net).toBeCloseTo(4.29, 2)
  })

  it('a transfer bringing in a player the squad already holds is unexecutable, because you cannot buy who you own', () => {
    /**
     * **The live defect, 2026-09-16** (STE-141). A stored transfer keeps naming
     * the same two players and the squad beneath it moves. An upload brought the
     * incoming side into the fifteen, and the Assistant went on offering
     * *Calafiori → De Cuyper* with De Cuyper already on the bench — drawing an
     * After squad that held him twice and four players from one club.
     *
     * **The trigger is the incoming side being in the squad**, which is the only
     * circumstance this rule is about. `inSquad` was computed and handed to this
     * function all along; nothing read it, and the shared fixture above set it
     * true for every player — including the incoming side of a transfer, which
     * by definition is not there. A fixture that cannot express the bug is how
     * it survived.
     */
    const sides = world(side(1, 2.6, { sellingPriceTenths: 65 }), side(2, 4.8, { priceTenths: 76, inSquad: true }))
    const again = recomputeCall(transfer(), sides)

    expect(again.unexecutable).toBe(true)
    expect(again.conviction).toBeNull()
  })

  it('a substitution names two players who are both in the squad, and is not refused for it', () => {
    // The guard above is transfers only. Applying it to a substitution would
    // report every one of them unexecutable, because both sides are owned.
    const swap: StoredFigure = {
      key: 'substitution:out=1:in=2',
      identity: { type: 'substitution', variant: 'upgrade', outPlayerId: 1, inPlayerId: 2 },
      outPlayerId: 1,
      inPlayerId: 2,
      conviction: 68,
      band: 'lean',
      isReading: false,
      pointsHit: 0,
      isForced: false,
      cannotHoldRole: false,
    }
    const sides = world(side(1, 2.4, { inSquad: true }), side(2, 7.0, { inSquad: true }))

    expect(recomputeCall(swap, sides).unexecutable).toBe(false)
  })

  it('F3-AC-25: a transfer whose outgoing side has no recoverable selling price is unexecutable, never priced at a guess', () => {
    const sides = world(side(1, 2.6, { sellingPriceTenths: null }), side(2, 4.8, { inSquad: false }))
    const again = recomputeCall(transfer(), sides)

    expect(again.unexecutable).toBe(true)
    expect(again.conviction).toBeNull()
  })

  it('one call that cannot be re-derived keeps its stored figure rather than taking the read down', () => {
    // A blank horizon is a shape the engine refuses. The screen must still load.
    const broken = transfer({ inPlayerId: 9, identity: { type: 'transfer', outPlayerId: 1, inPlayerId: 9 } })
    const sides = world(side(1, 2.6), side(9, 4.8, { projections: [], inSquad: false }))
    const { all } = recomputeAll([broken], sides)

    expect(all).toHaveLength(1)
    expect(all[0]?.conviction).toBe(68)
    expect(all[0]?.band).toBe('lean')
  })
})

describe('A call the run forced stays forced when it is re-derived (STE-143)', () => {
  /**
   * **The live defect, 2026-09-16.** The captain call proposed moving the
   * armband onto the current vice, so the plan forced the vice call — a player
   * cannot wear both. The world read re-derived it knowing only the fixture,
   * found nobody projecting higher than the holder, and demoted it to *he keeps
   * the vice armband*.
   *
   * The screen then advised promoting him to captain **and** keeping him as
   * vice, which cannot be done, and the reasoning paragraph still argued for
   * the change the card had stopped proposing.
   *
   * **The trigger is a forced call whose holder outprojects the challenger** —
   * the only circumstance where the two paths can disagree, and the one the
   * re-derivation had no way to see.
   */
  const viceCall = (isForced: boolean): StoredFigure => ({
    key: 'captaincy:vice:from=1:to=2',
    identity: { type: 'vice', fromPlayerId: 1, toPlayerId: 2 },
    outPlayerId: 1,
    inPlayerId: 2,
    conviction: 5,
    band: 'thin',
    isReading: false,
    pointsHit: 0,
    isForced,
    cannotHoldRole: false,
  })

  // The holder projects far better than the challenger, so on the arithmetic
  // alone this is plainly a keep. The plan forced it anyway, and the reason is
  // not in these numbers.
  const sides = () => world(side(1, 7.9), side(2, 5.0))

  it('the holder outprojecting the challenger no longer overrules the reason the call exists', () => {
    expect(recomputeCall(viceCall(true), sides()).isReading).toBe(false)
  })

  it('and an unforced call in the same shape is still read as a keep, so nothing is forced through', () => {
    // The guard must not make every call survive re-derivation — only the ones
    // the run had a reason for.
    expect(recomputeCall(viceCall(false), sides()).isReading).toBe(true)
  })
})

describe('STE-151 · an armband call re-derives as a captaincy, never as a substitution', () => {
  /**
   * **The defect this was written after.** `identityOf` ended in a `default:`
   * arm, so the day `armband` joined the shape union every stored armband call
   * quietly rebuilt as a *substitution* — wrong bar, wrong label, and no error
   * anywhere to say so. A catch-all absorbing a case nobody thought about is the
   * same failure as a test naming a criterion and exercising the other half of
   * it (P16).
   */
  it('STE-151: the shape maps to the captaincy bar, and every shape is named rather than defaulted', () => {
    expect(identityOf({ shape: 'armband', outPlayerId: 7, inPlayerId: 9 })).toEqual({
      type: 'captain',
      fromPlayerId: 7,
      toPlayerId: 9,
    })
    // The arms the default used to cover, still covered — now by name.
    expect(identityOf({ shape: 'upgrade_swap', outPlayerId: 1, inPlayerId: 2 })).toEqual({
      type: 'substitution',
      variant: 'upgrade',
      outPlayerId: 1,
      inPlayerId: 2,
    })
    expect(identityOf({ shape: 'forced_swap', outPlayerId: 1, inPlayerId: 2 })).toMatchObject({ variant: 'forced' })
    expect(identityOf({ shape: 'doubt_swap', outPlayerId: 1, inPlayerId: 2 })).toMatchObject({ variant: 'doubt' })
  })
})
