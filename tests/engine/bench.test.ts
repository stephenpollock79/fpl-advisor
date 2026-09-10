/**
 * F3-AC-04 — the bench.
 *
 * Ruled 2026-09-10: the outfield bench is ordered by projected points, highest
 * first, and a bench-order call's net is the plain gap between the two players
 * swapping. The probability an auto-substitution fires for the slot they cover
 * was going to supply the multiplier, and there is no such figure — for the same
 * reason there is none for the vice armband.
 */
import { describe, expect, it } from 'vitest'

import { benchOrder } from '../../packages/engine/src/bench.js'
import type { BenchCandidate } from '../../packages/engine/src/types.js'

const sub = (playerId: number, projection: number, eligible = true): BenchCandidate => ({
  playerId,
  projection,
  availability: eligible ? { eligible: true } : { eligible: false, reason: 'injured' },
})

describe('F3-AC-04 · bench order follows the projection', () => {
  it('F3-AC-04: the highest projection is first in line', () => {
    expect(benchOrder([sub(1, 1.5), sub(2, 7.0), sub(3, 4.7)]).map((p) => p.playerId)).toEqual([
      2, 3, 1,
    ])
  })

  it('F3-AC-04: an order that is already right is left alone', () => {
    expect(benchOrder([sub(2, 7.0), sub(3, 4.7), sub(1, 1.5)]).map((p) => p.playerId)).toEqual([
      2, 3, 1,
    ])
  })

  it('F3-AC-04: a player who cannot play covers nothing, so he goes last', () => {
    expect(
      benchOrder([sub(1, 1.5), sub(2, 9.9, false), sub(3, 4.7)]).map((p) => p.playerId),
    ).toEqual([3, 1, 2])
  })

  it('F3-AC-04: two players on the same projection resolve the same way on every run', () => {
    const bench = [sub(9, 4.0), sub(4, 4.0), sub(6, 1.0)]
    expect(benchOrder(bench).map((p) => p.playerId)).toEqual(
      benchOrder([...bench].reverse()).map((p) => p.playerId),
    )
  })

  it('F3-AC-04: ordering returns a new list and does not reorder the one it was given', () => {
    const bench = [sub(1, 1.5), sub(2, 7.0)]
    benchOrder(bench)
    expect(bench.map((p) => p.playerId)).toEqual([1, 2])
  })
})
