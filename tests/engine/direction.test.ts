/**
 * Which way the recommendation points.
 *
 * Code compares the incumbent against the best alternative and the winning side
 * *is* the recommendation, so the conviction figure is always confidence in the
 * call being made — never in a change the app is not proposing. That is also
 * what keeps a negative net away from the formula (ENGINE-AC-03): the sign is
 * resolved by choosing a side, not by computing one.
 */
import { describe, expect, it } from 'vitest'

import { evaluateCall } from '../../packages/engine/src/call.js'
import type { CallInput } from '../../packages/engine/src/types.js'

const substitution = (out: number[], inn: number[]): CallInput => ({
  identity: { type: 'substitution', variant: 'doubt', outPlayerId: 11, inPlayerId: 22 },
  incumbent: { playerId: 11, projections: out, availability: { eligible: true } },
  challenger: { playerId: 22, projections: inn, availability: { eligible: true } },
})

describe('ENGINE-AC-03 · the winning side is the recommendation', () => {
  it('ENGINE-AC-03: when the challenger wins, the call recommends the challenger', () => {
    const outcome = evaluateCall(substitution([1.7], [4.7]))

    expect(outcome.reading).toBe('call')
    if (outcome.reading !== 'call') return
    expect(outcome.recommendsPlayerId).toBe(22)
    expect(outcome.net).toBe(3)
  })

  it('ENGINE-AC-03: when the incumbent wins, nothing is recommended and no figure is produced', () => {
    const outcome = evaluateCall(substitution([4.7], [1.7]))

    expect(outcome.reading).toBe('no_change')
    if (outcome.reading !== 'no_change') return
    expect(outcome.reason).toBe('incumbent_wins')
    expect(outcome).not.toHaveProperty('conviction')
  })

  it('ENGINE-AC-03: a dead heat keeps what is there rather than proposing a coin flip', () => {
    const outcome = evaluateCall(substitution([4.7], [4.7]))

    expect(outcome.reading).toBe('no_change')
    if (outcome.reading !== 'no_change') return
    expect(outcome.reason).toBe('incumbent_wins')
  })

  it('ENGINE-AC-03: the formula is never handed a negative net, however far behind the challenger is', () => {
    // The guard in convictionOf is the second line. This is the first: a losing
    // challenger is resolved by direction, before any arithmetic runs.
    expect(() => evaluateCall(substitution([9.9], [0.1]))).not.toThrow()
  })

  it('ENGINE-AC-02: a challenger who fails the availability gate cannot be recommended at all', () => {
    expect(() =>
      evaluateCall({
        ...substitution([1.7], [4.7]),
        challenger: {
          playerId: 22,
          projections: [4.7],
          availability: { eligible: false, reason: 'injured' },
        },
      }),
    ).toThrow()
  })
})

describe('F3-AC-17, F4-AC-07, F4-AC-08 · forced is a property of the call, not of the figure', () => {
  it('F4-AC-07: a call is forced when, and only when, the incumbent fails the gate', () => {
    const forced = evaluateCall({
      ...substitution([1.7], [4.7]),
      incumbent: {
        playerId: 11,
        projections: [1.7],
        availability: { eligible: false, reason: 'injured' },
      },
    })

    expect(forced.reading).toBe('call')
    if (forced.reading !== 'call') return
    expect(forced.isForced).toBe(true)
  })

  it('F4-AC-08: however high the conviction, a call is never forced while the incumbent can play', () => {
    const outcome = evaluateCall(substitution([0.2], [9.8]))

    expect(outcome.reading).toBe('call')
    if (outcome.reading !== 'call') return
    expect(outcome.conviction).toBeGreaterThan(90)
    expect(outcome.isForced).toBe(false)
  })

  it('F4-AC-07: a forced call is still produced when the replacement is no better on paper', () => {
    // The incumbent cannot play, so the change has to happen. The figure says how
    // much better the replacement is, which may be not at all — the red Forced
    // flag carries the obligation, and F3-AC-18 forbids deriving one from the other.
    const outcome = evaluateCall({
      ...substitution([6.0], [1.2]),
      incumbent: {
        playerId: 11,
        projections: [6.0],
        availability: { eligible: false, reason: 'injured' },
      },
    })

    expect(outcome.reading).toBe('call')
    if (outcome.reading !== 'call') return
    expect(outcome.isForced).toBe(true)
    expect(outcome.net).toBe(0)
    expect(outcome.recommendsPlayerId).toBe(22)
  })
})
