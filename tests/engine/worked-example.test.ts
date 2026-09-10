/**
 * ENGINE-AC-04 — one function produces net, conviction and band.
 *
 * The worked example from PRD 3.2, end to end. Every figure in it is either
 * published or arithmetic performed on published figures — there is no row a
 * model supplies, which is what makes it checkable by hand rather than merely
 * illustrative. If this test needs editing without an input having moved, that
 * is a defect rather than a judgement that changed.
 */
import { describe, expect, it } from 'vitest'

import { evaluateCall } from '../../packages/engine/src/call.js'
import { bandOf } from '../../packages/engine/src/conviction.js'
import { NOISE_FLOOR } from '../../packages/engine/src/constants.js'
import type { CallInput } from '../../packages/engine/src/types.js'

// Wood out, Ekitiké in. Prices are illustrative; the projections and the
// arithmetic over them are the specification's own.
const workedExample: CallInput = {
  identity: { type: 'transfer', outPlayerId: 401, inPlayerId: 517 },
  incumbent: {
    playerId: 401,
    projections: [2.6, 2.9, 2.4],
    availability: { eligible: true },
  },
  challenger: {
    playerId: 517,
    projections: [4.8, 5.1, 4.4],
    availability: { eligible: true },
  },
  money: { incomingPriceTenths: 85, outgoingSellingPriceTenths: 70 },
}

describe('ENGINE-AC-04 · the worked example, end to end', () => {
  it('ENGINE-AC-04: weighted horizon totals of 5.18 and 9.40, net +4.22, conviction 68 · lean', () => {
    const outcome = evaluateCall(workedExample)

    expect(outcome.reading).toBe('call')
    if (outcome.reading !== 'call') return

    expect(outcome.incumbentTotal).toBe(5.18)
    expect(outcome.challengerTotal).toBe(9.4)
    expect(outcome.net).toBe(4.22)
    expect(outcome.conviction).toBe(68)
    expect(outcome.band).toBe('lean')
  })

  it('ENGINE-AC-04: it clears the noise floor, so it renders as a call', () => {
    const outcome = evaluateCall(workedExample)
    if (outcome.reading !== 'call') throw new Error('expected a call')
    expect(outcome.conviction).toBeGreaterThan(NOISE_FLOOR)
  })

  it('ENGINE-AC-04: it sits below strong, so it is not Recommended and does not enter that filter', () => {
    const outcome = evaluateCall(workedExample)
    if (outcome.reading !== 'call') throw new Error('expected a call')
    expect(outcome.conviction).toBeLessThan(80)
    expect(outcome.band).not.toBe('strong')
    expect(outcome.band).not.toBe('certain')
  })

  it('ENGINE-AC-04: net, conviction and band all come out of the one call, and agree with each other', () => {
    const outcome = evaluateCall(workedExample)
    if (outcome.reading !== 'call') throw new Error('expected a call')

    // The single-source-of-truth rule is a claim about consumers, which cannot be
    // proved before consumers exist. What can be proved here is that the three
    // figures are produced together and are internally consistent — a surface
    // that recomputed the band would have to disagree with this to be wrong.
    expect(bandOf(outcome.conviction)).toBe(outcome.band)
    expect(outcome.k).toBe(2.0)
  })

  it('ENGINE-AC-04: the same inputs produce the same figure on every run', () => {
    const first = evaluateCall(workedExample)
    const second = evaluateCall(workedExample)
    expect(second).toEqual(first)
  })
})

describe('F3-AC-25, F3-AC-28 · what the call costs', () => {
  it('F3-AC-25: a transfer costs the incoming price less the outgoing selling price', () => {
    const outcome = evaluateCall(workedExample)
    if (outcome.reading !== 'call') throw new Error('expected a call')
    expect(outcome.costTenths).toBe(15)
  })

  it('F3-AC-28: a substitution costs nothing, and never a difference between two owned prices', () => {
    const outcome = evaluateCall({
      identity: { type: 'substitution', variant: 'doubt', outPlayerId: 11, inPlayerId: 22 },
      incumbent: { playerId: 11, projections: [1.7], availability: { eligible: true } },
      challenger: { playerId: 22, projections: [4.7], availability: { eligible: true } },
    })

    if (outcome.reading !== 'call') throw new Error('expected a call')
    expect(outcome.costTenths).toBe(0)
  })

  it('F3-AC-28: a captaincy call costs nothing', () => {
    const outcome = evaluateCall({
      identity: { type: 'captain', fromPlayerId: 11, toPlayerId: 22 },
      incumbent: { playerId: 11, projections: [5.0], availability: { eligible: true } },
      challenger: { playerId: 22, projections: [7.7], availability: { eligible: true } },
    })

    if (outcome.reading !== 'call') throw new Error('expected a call')
    expect(outcome.costTenths).toBe(0)
  })

  it('F3-AC-25: a transfer built without prices is a defect rather than a free one', () => {
    const { money: _money, ...withoutPrices } = workedExample
    expect(() => evaluateCall(withoutPrices as CallInput)).toThrow()
  })
})

describe('the two rules that only apply to their own call type', () => {
  it('a points hit subtracts directly from net, on the call that incurs it', () => {
    const big: CallInput = {
      ...workedExample,
      incumbent: { playerId: 401, projections: [1, 1, 1], availability: { eligible: true } },
      challenger: { playerId: 517, projections: [9, 9, 9], availability: { eligible: true } },
    }

    const free = evaluateCall(big)
    const hit = evaluateCall({ ...big, pointsHit: 4 })

    if (free.reading !== 'call' || hit.reading !== 'call') throw new Error('expected calls')
    expect(free.net).toBe(15.6)
    expect(hit.net).toBe(11.6)
    expect(hit.pointsHit).toBe(4)
    expect(hit.conviction).toBeLessThan(free.conviction)
  })

  it('a four-point hit is enough to sink the worked example below the floor', () => {
    // Worth an assertion of its own: +4.22 over three gameweeks is a real gain
    // and a single hit wipes it out. The transfer does not become a weak call, it
    // stops being a call.
    const outcome = evaluateCall({ ...workedExample, pointsHit: 4 })

    expect(outcome.reading).toBe('no_change')
    if (outcome.reading !== 'no_change') return
    expect(outcome.reason).toBe('below_floor')
    expect(outcome.net).toBe(0.22)
  })

  it('a hit larger than the gain turns the call into nothing to do, rather than a negative figure', () => {
    const outcome = evaluateCall({ ...workedExample, pointsHit: 8 })

    expect(outcome.reading).toBe('no_change')
    if (outcome.reading !== 'no_change') return
    expect(outcome.reason).toBe('incumbent_wins')
  })

  it('the Triple Captain chip moves two extra copies, so the net doubles', () => {
    const base: CallInput = {
      identity: { type: 'captain', fromPlayerId: 11, toPlayerId: 22 },
      incumbent: { playerId: 11, projections: [5.0], availability: { eligible: true } },
      challenger: { playerId: 22, projections: [7.7], availability: { eligible: true } },
    }

    const plain = evaluateCall(base)
    const tripled = evaluateCall({ ...base, tripleCaptain: true })

    if (plain.reading !== 'call' || tripled.reading !== 'call') throw new Error('expected calls')
    expect(plain.net).toBe(2.7)
    expect(tripled.net).toBe(5.4)
  })
})
