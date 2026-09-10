/**
 * F4-AC-01, F4-AC-07, F4-AC-10 — who wears the armband.
 *
 * Ruled 2026-09-10: the captain is the eligible player with the highest
 * projection for the gameweek and the vice is the second-highest. There is no
 * probability multiplier anywhere — the figure that was going to be read off the
 * availability multiplier does not exist, and the substitute everyone reaches
 * for (FPL's chance-of-playing percentage) re-creates the double-count that
 * removed the multiplier in the first place.
 *
 * The one thing that does not come off the projection is a near-tie, where the
 * means have already been declared indistinguishable. There the ceiling
 * tie-break decides, on two published signals in order: penalties, then position.
 */
import { describe, expect, it } from 'vitest'

import { chooseArmband } from '../../packages/engine/src/armband.js'
import { noiseFloorNet } from '../../packages/engine/src/conviction.js'
import { kFor } from '../../packages/engine/src/conviction.js'
import type { ArmbandCandidate } from '../../packages/engine/src/types.js'

const player = (
  playerId: number,
  projection: number,
  extra: Partial<ArmbandCandidate> = {},
): ArmbandCandidate => ({
  playerId,
  projection,
  availability: { eligible: true },
  takesPenalties: false,
  position: 'MID',
  ...extra,
})

describe('F4-AC-01 · captain and vice come off the projection', () => {
  it('F4-AC-01: the captain is the highest projection and the vice is the second-highest', () => {
    const armband = chooseArmband([player(1, 6.4), player(2, 7.7), player(3, 7.0)])

    expect(armband.captainId).toBe(2)
    expect(armband.viceId).toBe(3)
  })

  it('F4-AC-01: no probability is applied to either — the ordering is the projection itself', () => {
    const armband = chooseArmband([
      player(1, 7.7, { position: 'FWD' }),
      player(2, 7.0, { takesPenalties: true }),
    ])

    // The penalty taker would win a tie-break. He is not in one, so the plain
    // projection decides and he is the vice.
    expect(armband.captainId).toBe(1)
    expect(armband.viceId).toBe(2)
  })

  it('F4-AC-01: captain and vice are never the same player', () => {
    const armband = chooseArmband([player(1, 7.7), player(2, 7.7)])
    expect(armband.captainId).not.toBe(armband.viceId)
  })
})

describe('ENGINE-AC-02, F4-AC-07 · an excluded player wears neither armband', () => {
  it('ENGINE-AC-02: the highest projection in the squad is skipped when he fails the gate', () => {
    const armband = chooseArmband([
      player(1, 9.9, { availability: { eligible: false, reason: 'injured' } }),
      player(2, 7.7),
      player(3, 7.0),
    ])

    expect(armband.captainId).toBe(2)
    expect(armband.viceId).toBe(3)
  })

  it('F4-AC-07: with fewer than two eligible players there is no legal pair, and that is a defect rather than a guess', () => {
    expect(() =>
      chooseArmband([
        player(1, 7.7),
        player(2, 7.0, { availability: { eligible: false, reason: 'suspended' } }),
      ]),
    ).toThrow()
  })
})

describe('F4-AC-12 · the ceiling tie-break, and only inside the noise floor', () => {
  it('F4-AC-12: inside the floor the greater ceiling wins, and the outcome says the tie-break decided it', () => {
    const window = noiseFloorNet(kFor('captain'))
    const armband = chooseArmband([
      player(1, 7.2, { position: 'DEF' }),
      player(2, 7.2 - window, { position: 'FWD' }),
      player(3, 4.0),
    ])

    expect(armband.captainId).toBe(2)
    expect(armband.captainByCeiling).toBe(true)
  })

  it('F4-AC-12: outside the floor the higher projection wins and the tie-break never runs', () => {
    const outside = noiseFloorNet(kFor('captain')) * 2
    const armband = chooseArmband([
      player(1, 7.2, { position: 'DEF' }),
      player(2, 7.2 - outside, { position: 'FWD' }),
      player(3, 4.0),
    ])

    expect(armband.captainId).toBe(1)
    expect(armband.captainByCeiling).toBe(false)
  })

  it('F4-AC-12: penalties are read before position, because they are the stronger published signal', () => {
    const armband = chooseArmband([
      player(1, 7.2, { position: 'FWD' }),
      player(2, 7.15, { position: 'MID', takesPenalties: true }),
      player(3, 4.0),
    ])

    expect(armband.captainId).toBe(2)
  })

  it('F4-AC-12: position ranks forward, midfielder, defender, goalkeeper', () => {
    const order = ['FWD', 'MID', 'DEF', 'GKP'] as const

    for (let i = 0; i < order.length - 1; i++) {
      const better = order[i]!
      const worse = order[i + 1]!
      const armband = chooseArmband([
        player(1, 7.2, { position: worse }),
        player(2, 7.15, { position: better }),
        player(3, 4.0),
      ])
      expect(armband.captainId).toBe(2)
    }
  })

  it('F4-AC-12: two players alike on every published signal resolve the same way on every run', () => {
    const candidates = [player(9, 7.2), player(4, 7.2), player(3, 4.0)]
    expect(chooseArmband(candidates).captainId).toBe(chooseArmband([...candidates].reverse()).captainId)
  })

  it('F4-AC-12: the vice is chosen the same way, over whoever is left', () => {
    const armband = chooseArmband([
      player(1, 9.0),
      player(2, 7.2, { position: 'DEF' }),
      player(3, 7.15, { position: 'FWD' }),
    ])

    expect(armband.captainId).toBe(1)
    expect(armband.viceId).toBe(3)
    expect(armband.viceByCeiling).toBe(true)
  })
})
