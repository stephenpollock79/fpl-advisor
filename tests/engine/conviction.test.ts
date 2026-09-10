/**
 * ENGINE-AC-03 — a negative net is rejected rather than computed.
 *
 * Decision Log #59 is the standing proof that this arithmetic can be
 * confidently wrong. `100 × net ÷ (net + k)` is undefined at `net = −k` and
 * inverts below it: a net of −5 against k = 2.0 returns +166.7, which clamps to
 * 95 and renders a bad call as *certain*. That was found with a pencil, which is
 * the whole argument for putting the arithmetic somewhere it can be checked.
 */
import { describe, expect, it } from 'vitest'

import { BAND_EDGES, CLAMP, K, NOISE_FLOOR } from '../../packages/engine/src/constants.js'
import {
  bandOf,
  convictionOf,
  kFor,
  noiseFloorNet,
} from '../../packages/engine/src/conviction.js'

describe('ENGINE-AC-03 · a negative net is refused, not computed', () => {
  it('ENGINE-AC-03: any net below zero throws', () => {
    for (const net of [-0.01, -0.5, -1, -1.9, -3, -20]) {
      expect(() => convictionOf(net, 2.0)).toThrow()
    }
  })

  it('ENGINE-AC-03: at net = −k, where the curve is undefined, it throws rather than dividing by zero', () => {
    expect(() => convictionOf(-2.0, 2.0)).toThrow()
    expect(() => convictionOf(-0.5, 0.5)).toThrow()
  })

  it('ENGINE-AC-03: below net = −k, where the curve inverts to a large positive, it throws', () => {
    // Without the guard this returns +166.7 and clamps to 95 — a bad call
    // rendering as the strongest reading the app has.
    expect(() => convictionOf(-5, 2.0)).toThrow()
    expect(100 * -5 / (-5 + 2.0)).toBeGreaterThan(100)
  })

  it('ENGINE-AC-03: a net of exactly zero is legal and produces the floor of the clamp', () => {
    expect(convictionOf(0, 2.0)).toBe(CLAMP.min)
  })
})

describe('ENGINE-AC-03 · the curve, the clamp and the bands', () => {
  it('ENGINE-AC-03: conviction is 100 × net ÷ (net + k), rounded to a whole number', () => {
    expect(convictionOf(4.22, 2.0)).toBe(68)
    expect(convictionOf(2.8, 0.5)).toBe(85)
    expect(convictionOf(3.0, 0.5)).toBe(86)
  })

  it('ENGINE-AC-03: the figure is clamped to 5 and 95 at both ends', () => {
    expect(convictionOf(0.0001, 2.0)).toBe(CLAMP.min)
    expect(convictionOf(10_000, 2.0)).toBe(CLAMP.max)
  })

  it('ENGINE-AC-03: the band edges are exactly where they are written', () => {
    expect(BAND_EDGES).toEqual({ certain: 90, strong: 80, lean: 60 })
    expect(bandOf(90)).toBe('certain')
    expect(bandOf(89)).toBe('strong')
    expect(bandOf(80)).toBe('strong')
    expect(bandOf(79)).toBe('lean')
    expect(bandOf(60)).toBe('lean')
    expect(bandOf(59)).toBe('thin')
  })

  it('ENGINE-AC-03: the bands partition the whole range — every figure gets one, and the order never goes backwards', () => {
    const rank = { thin: 0, lean: 1, strong: 2, certain: 3 } as const
    const seen = new Set<string>()
    let previous = -1

    for (let conviction = CLAMP.min; conviction <= CLAMP.max; conviction++) {
      const band = bandOf(conviction)
      seen.add(band)
      expect(rank[band]).toBeGreaterThanOrEqual(previous)
      previous = rank[band]
    }

    expect(seen).toEqual(new Set(['thin', 'lean', 'strong', 'certain']))
  })
})

describe('ENGINE-AC-03 · k, per call type, and the floor that moves with it', () => {
  it('ENGINE-AC-03: a transfer costs a scarce resource and carries the higher bar', () => {
    expect(kFor('transfer')).toBe(2.0)
  })

  it('ENGINE-AC-03: substitutions, bench order, captain and vice are all free and reversible, and share one bar', () => {
    // Ruled 2026-09-10. The armband's higher k was justified by the variance an
    // armband exposes, and that job moved to the ceiling tie-break — leaving a
    // captaincy call graded on a different scale from a substitution of the same
    // size, in the same gameweek, in the same units.
    for (const type of ['substitution', 'bench_order', 'captain', 'vice'] as const) {
      expect(kFor(type)).toBe(0.5)
    }
  })

  it('ENGINE-AC-03: the k table holds only the two values, so a third cannot appear unnoticed', () => {
    expect(new Set(Object.values(K))).toEqual(new Set([2.0, 0.5]))
  })

  it('ENGINE-AC-03: the noise floor is a conviction figure, so the net it corresponds to moves with k', () => {
    expect(NOISE_FLOOR).toBe(20)
    expect(noiseFloorNet(2.0)).toBeCloseTo(0.5, 10)
    expect(noiseFloorNet(0.5)).toBeCloseTo(0.125, 10)
  })

  it('ENGINE-AC-03: a net at the floor reads 20, and a net below it reads under 20', () => {
    expect(convictionOf(noiseFloorNet(2.0), 2.0)).toBe(NOISE_FLOOR)
    expect(convictionOf(noiseFloorNet(0.5), 0.5)).toBe(NOISE_FLOOR)
    expect(convictionOf(noiseFloorNet(2.0) * 0.5, 2.0)).toBeLessThan(NOISE_FLOOR)
  })
})
