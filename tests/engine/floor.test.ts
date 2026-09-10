/**
 * The noise floor of 20, and its consequence.
 *
 * A challenger can win by so little that the two options are indistinguishable
 * given the inputs. That resolves to keeping what is there, and renders as the
 * non-decidable "no change · nothing to do" reading — excluded from every tally,
 * and never shown as a low-percentage change. The floor is a conviction figure,
 * so the net it corresponds to moves whenever k does.
 */
import { describe, expect, it } from 'vitest'

import { NOISE_FLOOR } from '../../packages/engine/src/constants.js'
import { evaluateCall } from '../../packages/engine/src/call.js'
import { kFor, noiseFloorNet } from '../../packages/engine/src/conviction.js'
import type { CallInput } from '../../packages/engine/src/types.js'

const captaincy = (incumbent: number, challenger: number): CallInput => ({
  identity: { type: 'captain', fromPlayerId: 11, toPlayerId: 22 },
  incumbent: { playerId: 11, projections: [incumbent], availability: { eligible: true } },
  challenger: { playerId: 22, projections: [challenger], availability: { eligible: true } },
})

describe('F4-AC-02, F4-AC-03 · below the floor is a reading, not a weak call', () => {
  it('F4-AC-02: a win too small to distinguish reads "no change · nothing to do"', () => {
    const outcome = evaluateCall(captaincy(7.0, 7.02))

    expect(outcome.reading).toBe('no_change')
    if (outcome.reading !== 'no_change') return
    expect(outcome.reason).toBe('below_floor')
  })

  it('F4-AC-03: a sub-floor result carries no percentage at all, so it cannot be rendered as a weak change', () => {
    const outcome = evaluateCall(captaincy(7.0, 7.02))
    expect(outcome).not.toHaveProperty('conviction')
    expect(outcome).not.toHaveProperty('band')
  })

  it('F4-AC-02: a win just above the floor is a call, with a figure', () => {
    const justOver = noiseFloorNet(kFor('captain')) + 0.05
    const outcome = evaluateCall(captaincy(7.0, 7.0 + justOver))

    expect(outcome.reading).toBe('call')
    if (outcome.reading !== 'call') return
    expect(outcome.conviction).toBeGreaterThanOrEqual(NOISE_FLOOR)
  })
})

describe('the floor moves with k', () => {
  it('the same net reads as a call on one call type and as nothing to do on another', () => {
    // Net of +0.3. Against the armband's k of 0.5 that is 38 and a call; against
    // a transfer's k of 2.0 it is 13 and below the floor. Same points, different
    // cost of acting — which is the entire job k does.
    const armband = evaluateCall(captaincy(7.0, 7.3))

    const transfer = evaluateCall({
      identity: { type: 'transfer', outPlayerId: 11, inPlayerId: 22 },
      incumbent: { playerId: 11, projections: [7.0, 0, 0], availability: { eligible: true } },
      challenger: { playerId: 22, projections: [7.3, 0, 0], availability: { eligible: true } },
      money: { incomingPriceTenths: 70, outgoingSellingPriceTenths: 70 },
    })

    expect(armband.reading).toBe('call')
    expect(transfer.reading).toBe('no_change')
    if (transfer.reading !== 'no_change') return
    expect(transfer.reason).toBe('below_floor')
  })

  it('F6-AC-05: a forced call is never suppressed by the floor', () => {
    const outcome = evaluateCall({
      ...captaincy(7.0, 7.02),
      incumbent: {
        playerId: 11,
        projections: [7.0],
        availability: { eligible: false, reason: 'injured' },
      },
    })

    expect(outcome.reading).toBe('call')
    if (outcome.reading !== 'call') return
    expect(outcome.isForced).toBe(true)
    expect(outcome.conviction).toBeLessThan(NOISE_FLOOR)
  })
})
