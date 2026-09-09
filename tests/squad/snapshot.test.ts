/**
 * The fifteen, as at the last completed deadline (STE-102).
 *
 * Payload shapes taken from live fetches on 2026-09-09 of
 * `entry/{id}/event/{gw}/picks/` and `entry/{id}/history/`. Values are invented.
 *
 * Public endpoints only, by team id. No FPL credentials are requested,
 * transmitted or stored, and nothing here writes to FPL (F7-AC-13).
 */

import { describe, expect, it } from 'vitest'
import {
  CHIP_NAMES,
  chipsRemaining,
  freeTransfersRemaining,
  toSquadPlayers,
} from '../../apps/server/src/squad/snapshot.js'

/** Eleven starters at positions 1-11, then the bench: GK, then outfield 1, 2, 3. */
const picks = [
  ...Array.from({ length: 11 }, (_, i) => ({
    element: 100 + i,
    position: i + 1,
    multiplier: i === 9 ? 2 : 1,
    is_captain: i === 9,
    is_vice_captain: i === 3,
    element_type: i === 0 ? 1 : 2,
  })),
  { element: 200, position: 12, multiplier: 0, is_captain: false, is_vice_captain: false, element_type: 1 },
  { element: 201, position: 13, multiplier: 0, is_captain: false, is_vice_captain: false, element_type: 2 },
  { element: 202, position: 14, multiplier: 0, is_captain: false, is_vice_captain: false, element_type: 4 },
  { element: 203, position: 15, multiplier: 0, is_captain: false, is_vice_captain: false, element_type: 2 },
]

describe('F1-AC-01, F1-AC-02 · the shape of a squad', () => {
  it('F1-AC-01, F1-AC-02: fifteen players, eleven starters, bench GK then 1, 2, 3', () => {
    const players = toSquadPlayers(picks)

    expect(players).toHaveLength(15)
    expect(players.filter((p) => p.isStarter)).toHaveLength(11)

    // The bench order is fixed and it is not "whatever order the feed sent".
    // Position 12 is the substitute goalkeeper, then outfield one, two, three —
    // confirmed against the live endpoint, where position 12 carries
    // element_type 1 and 13-15 do not.
    const bench = players.filter((p) => !p.isStarter)
    expect(bench.map((p) => p.benchOrder)).toEqual([0, 1, 2, 3])
    expect(bench.map((p) => p.playerId)).toEqual([200, 201, 202, 203])

    // A starter has no bench order at all. Null rather than a sentinel, because
    // zero is a real bench position and would read as "the substitute keeper".
    expect(players.filter((p) => p.isStarter).every((p) => p.benchOrder === null)).toBe(true)
  })

  it('F1-AC-13: exactly one captain and exactly one vice, and never the same player', () => {
    const players = toSquadPlayers(picks)

    expect(players.filter((p) => p.isCaptain).map((p) => p.playerId)).toEqual([109])
    expect(players.filter((p) => p.isVice).map((p) => p.playerId)).toEqual([103])
    expect(players.some((p) => p.isCaptain && p.isVice)).toBe(false)
  })

  it('F1-AC-01: refuses a squad that is not fifteen', () => {
    // A short read is a broken read. Storing it would put a squad on screen that
    // the manager does not have, which is worse than failing loudly.
    expect(() => toSquadPlayers(picks.slice(0, 14))).toThrow(/fifteen/i)
  })

  it('F1-AC-13: refuses a squad with no captain', () => {
    const headless = picks.map((p) => ({ ...p, is_captain: false }))
    expect(() => toSquadPlayers(headless)).toThrow(/captain/i)
  })
})

describe('F1-AC-08 · the four chips, available or spent', () => {
  it('F1-AC-08: a chip is spent once it appears in the history, and available otherwise', () => {
    const history = {
      chips: [
        { name: 'bboost', event: 2 },
        { name: 'wildcard', event: 3 },
      ],
      current: [],
    }

    const chips = chipsRemaining(history)

    expect(Object.keys(chips).sort()).toEqual([...CHIP_NAMES].sort())
    expect(chips.wildcard).toBe('spent')
    expect(chips.bboost).toBe('spent')
    expect(chips.freehit).toBe('available')
    expect(chips['3xc']).toBe('available')
  })

  it('F1-AC-08: all four are available for a manager who has played none', () => {
    const chips = chipsRemaining({ chips: [], current: [] })
    expect(Object.values(chips).every((s) => s === 'available')).toBe(true)
  })
})

describe('F1-AC-07 · free transfers, which no public endpoint reports', () => {
  // The picks and history endpoints give transfers *made* per gameweek, never the
  // balance remaining. It is therefore derived: one earned per gameweek, carried
  // over, capped at five. A wildcard or free hit leaves the balance untouched.
  //
  // **This is a derivation, not a feed value**, and it is wrong quietly if FPL
  // changes the accumulation rule — which they did in 2024/25, raising the cap
  // from two to five. Tracked as an open question; see the module.
  const gw = (event: number, event_transfers: number) => ({ event, event_transfers })

  it('F1-AC-07: one transfer earned per gameweek, unused ones carried over', () => {
    const history = { chips: [], current: [gw(1, 0), gw(2, 0), gw(3, 0)] }
    // Earned three, used none — but the opening gameweek's squad is free, so the
    // count starts after it.
    expect(freeTransfersRemaining(history, 4)).toBe(3)
  })

  it('F1-AC-07: transfers made are deducted, and a hit does not push the balance negative', () => {
    // Entering GW2 the manager holds one. They make two — one free, one a hit at
    // -4. The balance floors at zero rather than carrying a debt forward: FPL
    // charges the hit at the time and does not remember it.
    //
    //   GW2  earn 1, use 2  -> 0 (floored, the second was a hit)
    //   GW3  earn 1, use 0  -> 1
    //   GW4  earn 1         -> 2
    const history = { chips: [], current: [gw(1, 0), gw(2, 2), gw(3, 0)] }
    expect(freeTransfersRemaining(history, 4)).toBe(2)
  })

  it('F1-AC-07: the balance is capped at five and never goes negative', () => {
    const many = { chips: [], current: Array.from({ length: 12 }, (_, i) => gw(i + 1, 0)) }
    expect(freeTransfersRemaining(many, 13)).toBe(5)

    const overspent = { chips: [], current: [gw(1, 0), gw(2, 8)] }
    expect(freeTransfersRemaining(overspent, 3)).toBeGreaterThanOrEqual(0)
  })

  it('F1-AC-07: a wildcard gameweek does not consume the balance', () => {
    // Unlimited transfers on a wildcard, so the transfers made in that gameweek
    // are not deducted. Reading them as spent would show the manager fewer
    // transfers than they have, every week after a wildcard.
    const history = { chips: [{ name: 'wildcard', event: 2 }], current: [gw(1, 0), gw(2, 9)] }
    expect(freeTransfersRemaining(history, 3)).toBe(2)
  })
})
