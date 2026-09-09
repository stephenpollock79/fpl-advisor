/**
 * Assembling the one object every screen re-derives from (STE-103).
 *
 * Pure: rows in, world out. The database reads that feed it are injected at the
 * route, so everything worth asserting here is asserted without one.
 *
 * This is where the two feeds finally meet, and where getting the join wrong
 * would look like working software. The fixture below is deliberately awkward:
 * one blanking club, one doubling club, one ordinary club.
 */

import { describe, expect, it } from 'vitest'
import { assembleWorld } from '../../apps/server/src/world/assemble.js'

const gameweek = { id: 4, name: 'Gameweek 4', deadlineTime: '2026-09-12T17:30:00Z', isNext: true, isCurrent: false, finished: false, dataChecked: false }

const clubs = [
  { id: 1, name: 'Arsenal', shortName: 'ARS' },
  { id: 2, name: 'Brighton', shortName: 'BHA' },
  { id: 3, name: 'Chelsea', shortName: 'CHE' },
]

// Club 1 blanks in GW4. Club 2 doubles, playing 3 twice. Club 3 therefore also
// doubles — so club 3's own fixtures are the ordinary control in GW5 and GW6.
const fixtures = [
  { id: 1, gameweek: 4, homeClub: 2, awayClub: 3, kickoff: null, homeDifficulty: 2, awayDifficulty: 4, finished: false },
  { id: 2, gameweek: 4, homeClub: 3, awayClub: 2, kickoff: null, homeDifficulty: 3, awayDifficulty: 3, finished: false },
  { id: 3, gameweek: 5, homeClub: 1, awayClub: 2, kickoff: null, homeDifficulty: 5, awayDifficulty: 1, finished: false },
  { id: 4, gameweek: 6, homeClub: 2, awayClub: 1, kickoff: null, homeDifficulty: 2, awayDifficulty: 2, finished: false },
]

const players = [
  { id: 101, clubId: 1, position: 'GKP' as const, firstName: 'A', surname: 'Blanker', shirtNumber: 1 },
  { id: 102, clubId: 2, position: 'MID' as const, firstName: 'B', surname: 'Doubler', shirtNumber: 7 },
]

const squad = [
  { playerId: 101, isStarter: true, benchOrder: null, isCaptain: false, isVice: true },
  { playerId: 102, isStarter: true, benchOrder: null, isCaptain: true, isVice: false },
]

const states = [
  { feedReadId: 'r1', playerId: 101, status: 'a', news: null, newsAdded: null, chanceOfPlayingNextRound: null, nowCostTenths: 45, form: 2.1, selectedByPercent: 5.5, seasonPoints: 12, transfersIn: 100, transfersOut: 20 },
  { feedReadId: 'r1', playerId: 102, status: 'd', news: 'Knock', newsAdded: null, chanceOfPlayingNextRound: 75, nowCostTenths: 101, form: 6.4, selectedByPercent: 41.2, seasonPoints: 30, transfersIn: 900, transfersOut: 10 },
]

// Both are projected something. The blanking player's figure is deliberately
// non-zero: the feed is not wrong, it simply does not know about the blank.
const projections = [
  { gameweek: 4, playerId: 101, projectedPoints: 4.4, feedReadId: 'r1' },
  { gameweek: 4, playerId: 102, projectedPoints: 9.2, feedReadId: 'r1' },
]

const snapshot = {
  id: 's1',
  source: 'fpl_deadline' as const,
  capturedAt: '2026-09-09T12:00:00Z',
  bankTenths: 12,
  freeTransfers: 2,
  chipsRemaining: { wildcard: 'available', freehit: 'available', bboost: 'spent', '3xc': 'available' },
}

const world = () =>
  assembleWorld({ gameweek, lastScored: null, snapshot, squad, players, clubs, fixtures, projections, states })

describe('F1-UP-01, F1-UP-02 · the two feeds meeting', () => {
  it('F1-UP-01: a blanking player projects 0.0, whatever the projections feed carries', () => {
    const blanker = world().players.find((p) => p.playerId === 101)

    // The feed said 4.4. The fixture table says no fixture. The count wins.
    expect(blanker?.fixtures).toEqual([])
    expect(blanker?.projectedPoints).toBe(0)
  })

  it('F1-UP-02: a doubling player keeps one figure across two fixtures', () => {
    const doubler = world().players.find((p) => p.playerId === 102)

    expect(doubler?.fixtures).toHaveLength(2)
    // Not 18.4. The figure already covers both matches; there is nothing to add.
    expect(doubler?.projectedPoints).toBe(9.2)
  })

  it('F1-UP-01, F1-UP-02: the pitch carries a count of each', () => {
    expect(world().blanks).toBe(1)
    expect(world().doubles).toBe(1)
  })

  it('F1-AC-11: each fixture names the opponent and which side of it the player is on', () => {
    const doubler = world().players.find((p) => p.playerId === 102)

    // Club 2 plays club 3 at home, then away. Difficulty is always the one facing
    // *this* player's club, never the opponent's — reading the wrong column would
    // colour every pill from the other team's point of view.
    expect(doubler?.fixtures).toEqual([
      { opponentClubId: 3, opponentShortName: 'CHE', isHome: true, difficulty: 2 },
      { opponentClubId: 3, opponentShortName: 'CHE', isHome: false, difficulty: 3 },
    ])
  })
})

describe('F1-AC-19 · the next three difficulties', () => {
  it('F1-AC-19: three entries, and a blank is null rather than zero', () => {
    const blanker = world().players.find((p) => p.playerId === 101)

    // Club 1: blanks in GW4; hosts club 2 in GW5, where the difficulty *facing
    // club 1* is 5, not the 1 facing their opponent; away in GW6 at difficulty 2.
    //
    // That first pair is the trap this test exists for. Both numbers are on the
    // same fixture row, and taking the wrong one colours every pill from the other
    // team's point of view — a hard fixture rendered green.
    //
    // A blank is an absence, not a difficulty of zero: zero would colour as the
    // easiest fixture there is.
    expect(blanker?.nextThree).toEqual([null, 5, 2])
  })

  it('F1-AC-19: a double contributes both of its difficulties to the first slot', () => {
    const doubler = world().players.find((p) => p.playerId === 102)

    // The first bar splits into two half-width bars, so it needs both numbers.
    expect(doubler?.nextThree[0]).toEqual([2, 3])
  })
})

describe('the header, and what the world does not carry', () => {
  it('F1-AC-06, F1-AC-07, F1-AC-08: the deadline, the balance, the transfers and the four chips', () => {
    const w = world()

    // The gameweek advised on is the one flagged next — established upstream and
    // carried here, so no screen re-derives it.
    expect(w.gameweek).toEqual({ id: 4, name: 'Gameweek 4', deadlineTime: '2026-09-12T17:30:00Z' })
    expect(w.snapshot.bankTenths).toBe(12)
    expect(w.snapshot.freeTransfers).toBe(2)
    expect(Object.keys(w.snapshot.chipsRemaining)).toHaveLength(4)
  })

  it('carries the attribution link the licence requires', () => {
    expect(world().attribution.href).toBe('https://fantasyfootballiq.app')
  })

  it('F1-AC-22: carries no totals, so no total can disagree with its players', () => {
    // Squad and bench totals are summed from the players shown, at render. A
    // stored total is a second answer that can drift from the first.
    expect(world()).not.toHaveProperty('squadPoints')
    expect(world()).not.toHaveProperty('benchPoints')
  })
})
