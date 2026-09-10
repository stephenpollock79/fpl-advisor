/**
 * ENGINE-AC-01 — effective points is the bought-in feed's projection, taken whole.
 *
 * The load-bearing property here is an absence: nothing scales the projection.
 * These tests are therefore written as identities rather than as fixtures, so
 * that a coefficient reintroduced anywhere on this path fails them whatever its
 * value — including one close enough to 1.0 that a fixture would still pass.
 */
import { describe, expect, it } from 'vitest'

import {
  effectivePoints,
  horizonTotal,
  horizonWeightsFor,
} from '../../packages/engine/src/effective.js'

describe('ENGINE-AC-01 · effective points is the projection, unmodified', () => {
  it('ENGINE-AC-01: returns the projection it was given, unchanged', () => {
    for (const projection of [0, 0.4, 0.7, 1.2, 2.6, 4.22, 6.9, 12.5]) {
      expect(effectivePoints(projection)).toBe(projection)
    }
  })

  it('ENGINE-AC-01: applies no coefficient of any size, across the whole range the feed publishes', () => {
    for (let step = 0; step <= 1000; step++) {
      const projection = step / 40
      expect(effectivePoints(projection)).toBe(projection)
    }
  })

  it('ENGINE-AC-01: a zero projection stays zero rather than being floored or nudged', () => {
    expect(effectivePoints(0)).toBe(0)
  })
})

describe('ENGINE-AC-01 · the weighted horizon is the only arithmetic over a projection', () => {
  it('ENGINE-AC-01: a transfer is scored over three gameweeks at 1.0 / 0.6 / 0.35', () => {
    expect(horizonWeightsFor('transfer')).toEqual([1, 0.6, 0.35])
  })

  it('ENGINE-AC-01: every other call type is scored over this gameweek alone', () => {
    for (const type of ['substitution', 'bench_order', 'captain', 'vice'] as const) {
      expect(horizonWeightsFor(type)).toEqual([1])
    }
  })

  it('ENGINE-AC-01: a one-gameweek total is the projection itself, with no weighting applied', () => {
    expect(horizonTotal([4.2], horizonWeightsFor('captain'))).toBe(4.2)
  })

  it('ENGINE-AC-01: the worked example`s two horizon totals, to the penny', () => {
    expect(horizonTotal([2.6, 2.9, 2.4], horizonWeightsFor('transfer'))).toBe(5.18)
    expect(horizonTotal([4.8, 5.1, 4.4], horizonWeightsFor('transfer'))).toBe(9.4)
  })

  it('ENGINE-AC-01: a club with no fixture contributes zero rather than being skipped', () => {
    // The caller supplies 0 for a blank; the engine never consults a projection
    // for a fixture count and never drops a gameweek from the horizon.
    expect(horizonTotal([4.8, 0, 4.4], horizonWeightsFor('transfer'))).toBe(6.34)
  })

  it('ENGINE-AC-01: scoring a transfer over the wrong number of gameweeks is a defect, not a shrug', () => {
    expect(() => horizonTotal([2.6, 2.9], horizonWeightsFor('transfer'))).toThrow()
    expect(() => horizonTotal([2.6, 2.9, 2.4], horizonWeightsFor('captain'))).toThrow()
  })
})
