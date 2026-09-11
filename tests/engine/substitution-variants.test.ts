/**
 * Two engine changes slice 5 needed, both as parameters rather than second
 * implementations (CLAUDE.md, *One engine, two consumers*).
 *
 * 1. A fit-for-fit substitution is its own variant, `upgrade` — ruled
 *    2026-09-11 (STE-116), because GW4's biggest sub, Tzolis → Rogers, is
 *    neither forced nor doubt.
 * 2. A starter whose club has no fixture is unplayable, so his swap is forced.
 *    The availability gate cannot say so — it is FPL's verdict on fitness, and a
 *    blank is a fixture fact — so the caller states it, from the fixture table.
 */

import { describe, expect, it } from 'vitest'
import { callKey, evaluateCall } from '../../packages/engine/src/index.js'

const fit = { eligible: true } as const

describe('F3-AC-03 · substitution variants in the engine', () => {
  it('F3-AC-03: an upgrade swap has its own call key, distinct from a doubt swap on the same pair', () => {
    const upgrade = callKey({ type: 'substitution', variant: 'upgrade', outPlayerId: 557, inPlayerId: 40 })
    const doubt = callKey({ type: 'substitution', variant: 'doubt', outPlayerId: 557, inPlayerId: 40 })

    expect(upgrade).toBe('substitution:upgrade:out=557:in=40')
    expect(upgrade).not.toBe(doubt)
  })

  it('F3-AC-03: Tzolis → Rogers is an ordinary upgrade call at +4.60, not forced', () => {
    const outcome = evaluateCall({
      identity: { type: 'substitution', variant: 'upgrade', outPlayerId: 557, inPlayerId: 40 },
      incumbent: { playerId: 557, projections: [2.4], availability: fit },
      challenger: { playerId: 40, projections: [7.0], availability: fit },
    })

    expect(outcome.reading).toBe('call')
    if (outcome.reading !== 'call') return
    expect(outcome.net).toBe(4.6)
    // 100 × 4.6 ÷ 5.1 = 90.2 → 90, certain — the pencil check's own figure.
    expect(outcome.conviction).toBe(90)
    expect(outcome.isForced).toBe(false)
  })

  it('F3-AC-03: a fit starter whose club blanks is forced, and the figure never goes negative', () => {
    const outcome = evaluateCall({
      identity: { type: 'substitution', variant: 'forced', outPlayerId: 1, inPlayerId: 2 },
      incumbent: { playerId: 1, projections: [0], availability: fit },
      challenger: { playerId: 2, projections: [0], availability: fit },
      incumbentUnplayable: true,
    })

    expect(outcome.reading).toBe('call')
    if (outcome.reading !== 'call') return
    expect(outcome.isForced).toBe(true)
    // Forced with no better replacement: the bottom of the scale, never a
    // negative (slice 4 review, third section).
    expect(outcome.net).toBe(0)
    expect(outcome.conviction).toBe(5)
  })

  it('F3-AC-03: without the flag, the same blank-week inputs resolve to keeping what is there', () => {
    const outcome = evaluateCall({
      identity: { type: 'substitution', variant: 'forced', outPlayerId: 1, inPlayerId: 2 },
      incumbent: { playerId: 1, projections: [0], availability: fit },
      challenger: { playerId: 2, projections: [0], availability: fit },
    })

    expect(outcome.reading).toBe('no_change')
  })
})
